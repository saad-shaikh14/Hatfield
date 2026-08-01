# ADR 0001: Build a HatfieldHome job-application portal, modelled on TRUSTUS's

## Status
Accepted

## Context
Saad asked to replicate the working Supabase-backed recruitment portal built for TRUSTUS Group
(`trust_us/trustus` in the parent `HatfieldOffsted` folder) for HatfieldHome, a different,
Ofsted-regulated children's/young-people's residential care provider under the same folder tree.
`offsted/` (Hatfield's site) had zero careers presence before this — no nav link, no CV intake,
no application flow — unlike trust_us where `careers.html` already existed and only the backend
(Supabase portal) was being added on top.

trust_us's portal itself carries three years-worth of incidents and fixes documented in its own
`CLAUDE.md` and ADRs 0001–0003: a Supabase free-tier auto-pause that may have silently dropped a
real candidate's application, a silent HR-email-failure bug, and a security hardening pass moving
tokens from query strings to URL fragments. This ADR's job is to decide what to copy verbatim,
what to adopt proactively rather than wait to discover by incident, and what to deliberately not
replicate.

## Options considered
1. **Share TRUSTUS's Supabase project, new schema** — one free-tier quota, one keep-alive workflow
   to maintain. Rejected (Saad's call, 2026-08-01): mixes two different care businesses' candidate
   PII in one project; a config mistake (CORS, service role key) risks both clients at once.
2. **New, fully separate Supabase project (chosen)** — clean security/billing/GDPR boundary, its
   own free-tier quota. Costs a second keep-alive workflow and a second Resend domain to verify,
   but that's a small, one-time setup cost for real isolation.
3. **Replicate trust_us's orphaned scorecard.html token flow too** — rejected (Saad's call): trust_us
   itself no longer uses this path (superseded by `portal.html`'s built-in Scorecard tab); cloning
   known-dead code into a fresh project just carries forward complexity with no current use case.

## Decision
- New Supabase project `hatfieldhome-portal` (ref `nnshgtrvtdynkqvfbvfi`, region `us-east-1`,
  same org as TRUSTUS's project but fully separate), created via the Supabase Management API using
  the existing `SUPABASE_PAT` (a personal access token, account-scoped — not project-scoped, so
  reusable across projects under the same account without creating a new login).
- Schema: `hatfield.applications` / `hatfield.application_details` / `hatfield.competency_results`,
  bridged as `public.hatfield_applications` / `public.hatfield_application_details` /
  `public.hatfield_competency_results` — a consistent `hatfield_` prefix on all three, fixing
  trust_us's own inconsistent naming (`trustus_applications`, `trustus_application_details`, but an
  unprefixed `competency_results`). Attempt-history support (retakes) and its unique partial index
  were included in the initial migration, adopted proactively rather than added later via incident
  the way trust_us's ADR 0003 did.
- 7 of trust_us's 8 Edge Functions ported (`submit-cv`, `submit-form1`, `validate-token`,
  `send-invite`, `generate-scorecard-token`, `submit-mcq`, `submit-scorecard`); `validate-scorecard-token`
  and `submit-scorecard-token` (the orphaned flow) were not.
- Token security posture (fragment-only delivery, `sessionStorage`, `history.replaceState`,
  POST-only validation, `no-referrer` meta) replicated identically from trust_us's 2026-07-01 fix —
  built in from the start here rather than retrofitted.
- Front-end (`careers.html`, `apply.html`, `test.html`, `portal.html`) restyled entirely to
  Hatfield's own brand (cream/ink/accent, Gilda Display/Jost) — confirmed explicitly by Saad that
  the theme must match the Hatfield site, not TRUSTUS's sage/terracotta/Nunito system. trust_us's
  pages were used as a structural/logic template only, never a visual one.
- Added a "Careers" nav entry to `hatfieldhome-v6.html` (header + mobile menu) — this didn't exist
  before; a simplified, Hatfield-branded header (not the site's animated flower-logo nav) was used
  on the new standalone portal pages instead of replicating that fragile, iOS-Safari-sensitive
  component (documented in `offsted/NOTES.md`) across four new files.
- GitHub Actions keep-alive workflow added, same daily-cron + `workflow_dispatch` pattern as
  trust_us's ADR 0002, but pings the public `validate-token` Edge Function instead of querying
  `hatfield_applications` directly — see Consequences.

## Consequences
- **A real gotcha found while applying the migration, not present in any trust_us doc**: Supabase's
  project bootstrap sets default privileges on the `public` schema that auto-grant `anon` full CRUD
  on any newly-created view, regardless of what the migration's own `GRANT` statement lists. RLS
  still blocked `anon` from reading a row in practice (confirmed: direct REST query returned `42501`
  permission-denied), so this was never an open door, but the grant itself shouldn't have existed.
  Fixed with explicit `REVOKE` statements in the migration — worth checking for on any future
  Supabase project in this codebase, not just this one.
- **Resend's free tier only allows 1 verified domain** (TRUSTUS's account already uses it for
  `trustuscare.com`) — discovered when adding `hatfieldhome.co.uk` returned a 403. Saad's call: sign
  up a new, separate free Resend account for Hatfield rather than upgrading TRUSTUS's account to
  Pro. Not yet done — `.env.portal`'s `RESEND_API_KEY` and the repo's GitHub Actions secret both
  currently hold TRUSTUS's key as a placeholder, meaning candidate/HR emails will not actually send
  until this is replaced. See `CONTEXT.md` blockers.
- **The keep-alive workflow's health-check target had to change** from trust_us's pattern (direct
  REST query against the applications view using the public anon key) because this project's anon
  key deliberately has no grant on that view. Pinging `validate-token` instead still proves the DB +
  Edge Runtime are reachable, without loosening the RLS lockdown just for a health check.
- **Three real placeholders block go-live**, all clearly marked inline in the affected files:
  `test.html` + `submit-mcq`'s entire competency-question content (copied in shape only from
  trust_us's adult-care test — not appropriate for this Ofsted-regulated children's setting without
  Hatfield's own safeguarding review), `careers.html`'s role dropdown, and `apply.html`'s 4th
  declaration checkbox (Enhanced DBS/barred-list consent wording). None of these were invented as
  final copy — see `CONTEXT.md`.
- Not yet pushed to `saad-shaikh14/Hatfield` — everything above is committed locally only, since
  pushing adds a live "Careers" link on the public homepage pointing at a flow that isn't ready for
  real candidates yet.
- Zahid not yet added as a repository collaborator — deferred to after end-to-end verification,
  per Saad's explicit instruction.
