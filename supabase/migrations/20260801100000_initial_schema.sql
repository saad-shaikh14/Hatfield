-- Initial schema for the HatfieldHome job-application portal.
-- Fresh build (unlike trust_us/trustus, whose base schema was created via
-- dashboard/Management API and never committed to git) — this migration is
-- the full authored history from day one, including the attempt-history
-- support that trust_us only added in a later migration (see its ADR 0003).
--
-- Deliberate improvements over trust_us's live schema, not a blind copy:
--   - consistent `hatfield_` prefix on all three bridging views (trust_us has
--     an inconsistent mix: trustus_applications, trustus_application_details,
--     but an unprefixed competency_results)
--   - no `scorecard_tokens` table / anon grants — trust_us's orphaned
--     scorecard.html flow is intentionally not being replicated here
--   - `anon` gets no direct grants on any table/view: every public-facing
--     write/read in this portal goes through an Edge Function using the
--     service_role key (which bypasses RLS/grants entirely), never through a
--     client-side anon-key query — confirmed by reading careers.html/
--     apply.html/test.html in trust_us, none of which call supabase-js
--     directly. Only portal.html (HR-only, authenticated role) needs grants.

create extension if not exists pgcrypto;

create schema if not exists hatfield;

create table hatfield.applications (
  id                   uuid primary key default gen_random_uuid(),
  token                text not null unique default encode(gen_random_bytes(32), 'hex'),
  status               text not null default 'cv_received'
                       check (status in ('cv_received','form1_complete','interview_invited','rejected')),
  first_name           text not null,
  last_name            text not null,
  phone                text not null,
  email                text not null,
  role_applied         text not null,
  cv_url               text,
  submitted_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  form1_submitted_at   timestamptz,
  hr_notes             text,
  cv_downloaded_at     timestamptz,
  invited_at           timestamptz
);

create table hatfield.application_details (
  application_id         uuid primary key references hatfield.applications(id) on delete cascade,
  ni_number              text,
  dob                    date,
  title                  text,
  mobile                 text,
  alt_phone              text,
  email                  text,
  other_training         text,
  current_employer       text,
  address_history        jsonb not null default '[]',
  employment_history     jsonb not null default '[]',
  education              jsonb not null default '[]',
  referees               jsonb not null default '[]',
  declaration_signed_at  timestamptz,
  declaration_signature  text
);

create table hatfield.competency_results (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references hatfield.applications(id) on delete cascade,
  mcq_score           integer,
  section_scores      jsonb,
  domain_ratings      jsonb not null default '{}',
  strengths           text,
  development_areas   text,
  outcome             text check (outcome in ('PASS','HOLD','FAIL')),
  interviewer_name    text,
  completed_at        timestamptz,
  answers             jsonb,
  mcq_submitted_at    timestamptz,
  score_viewed_at     timestamptz,
  attempt_number      integer not null default 1,
  superseded_at       timestamptz
);

-- At most one "current" (non-superseded) attempt per application — built in
-- from day one (trust_us only added this via a follow-up migration + ADR).
create unique index competency_results_one_current_per_app
  on hatfield.competency_results (application_id)
  where superseded_at is null;

-- Bridging views so PostgREST can see this data — `hatfield` schema itself is
-- not exposed directly, matching trust_us's `trustus` schema pattern.
create view public.hatfield_applications as
  select id, token, status, first_name, last_name, phone, email, role_applied,
         cv_url, submitted_at, created_at, updated_at, form1_submitted_at,
         hr_notes, cv_downloaded_at, invited_at
  from hatfield.applications;

create view public.hatfield_application_details as
  select application_id, ni_number, dob, title, mobile, alt_phone, email,
         other_training, current_employer, address_history, employment_history,
         education, referees, declaration_signed_at, declaration_signature
  from hatfield.application_details;

create view public.hatfield_competency_results as
  select id, application_id, mcq_score, section_scores, domain_ratings, strengths,
         development_areas, outcome, interviewer_name, completed_at, answers,
         mcq_submitted_at, score_viewed_at, attempt_number, superseded_at
  from hatfield.competency_results;

-- RLS: Edge Functions run under service_role and bypass RLS entirely, so the
-- policies below only govern portal.html's direct client-side queries, which
-- run as the single HR user under Supabase Auth (role = authenticated).
alter table hatfield.applications enable row level security;
alter table hatfield.application_details enable row level security;
alter table hatfield.competency_results enable row level security;

create policy "authenticated full access" on hatfield.applications
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on hatfield.application_details
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on hatfield.competency_results
  for all to authenticated using (true) with check (true);

grant usage on schema hatfield to authenticated;
grant select, insert, update, delete on hatfield.applications to authenticated;
grant select, insert, update, delete on hatfield.application_details to authenticated;
grant select, insert, update, delete on hatfield.competency_results to authenticated;

grant select, insert, update, delete on public.hatfield_applications to authenticated, service_role;
grant select, insert, update, delete on public.hatfield_application_details to authenticated, service_role;
grant select, insert, update, delete on public.hatfield_competency_results to authenticated, service_role;

-- Gotcha discovered applying this migration: Supabase's project bootstrap
-- sets ALTER DEFAULT PRIVILEGES on schema `public` (and `hatfield`, once
-- created) granting anon full CRUD on any newly created table/view
-- automatically — the GRANTs above are not additive on top of a clean slate,
-- they land alongside an anon grant nobody asked for. RLS (enabled above)
-- still blocks anon from ever reading a row through it, so this was never an
-- open door in practice, but the grant itself should not exist. Explicit
-- revoke, since simply omitting anon from the GRANT list above is not
-- sufficient in this environment.
revoke all on public.hatfield_applications from anon;
revoke all on public.hatfield_application_details from anon;
revoke all on public.hatfield_competency_results from anon;
revoke all on hatfield.applications from anon;
revoke all on hatfield.application_details from anon;
revoke all on hatfield.competency_results from anon;

-- Storage: HR (authenticated) needs to create signed download URLs for CVs;
-- uploads only ever happen via the service_role-backed submit-cv function.
create policy "authenticated can read cv objects" on storage.objects
  for select to authenticated using (bucket_id = 'cvs');
