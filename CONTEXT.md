# HatfieldHome site + job-application portal — CONTEXT

## What this is
Static HTML/CSS/JS marketing site for HatfieldHome, a children's/young-people's
residential care provider, plus (new, 2026-08-01) a Supabase-backed job
application portal modelled on the one built for TRUSTUS Group
(`trust_us/trustus` in the parent `HatfieldOffsted` folder).

## Live deployment
- **GitHub:** `saad-shaikh14/Hatfield` (public repo), default branch `main`
- **Live URL:** `https://saad-shaikh14.github.io/Hatfield/` + custom domain `hatfieldhome.co.uk` (CNAME)
- Push to `main` → GitHub Pages auto-deploys
- Push workflow: `gh auth switch -u saad-shaikh14` first (default account `sshaikh-jpg` gets 403), matching trust_us's convention
- Source file: `hatfieldhome-v6.html` — edit this, `cp` to `index.html`, commit, push

## Current state (2026-08-01)
- Homepage (`hatfieldhome-v6.html`) unchanged except a new "Careers" nav link (header + mobile menu) — previously had none
- Job application portal **built but NOT YET LIVE** — see blockers below
- Existing Google Apps Script contact form (`google-apps-script/Code.gs`, lives one level up in `offsted/`) is untouched and unrelated to this portal

## Job application portal
- Stack: Supabase (Postgres + Auth + Storage) + Resend — free tier
- Supabase project: `hatfieldhome-portal` (ref `nnshgtrvtdynkqvfbvfi`, region `us-east-1`), dashboard: `https://supabase.com/dashboard/project/nnshgtrvtdynkqvfbvfi`
- **Deliberately separate from TRUSTUS's Supabase project** (`ssbcpblfkgpgtcxifopp`) — different client, different security/GDPR boundary
- CV files: Storage bucket `cvs`; HR downloads via signed URL (120s expiry)
- DB schema in `hatfield` schema (not `public`); bridging views: `hatfield_applications`, `hatfield_application_details`, `hatfield_competency_results` (consistent prefix — trust_us's own view naming is inconsistent)
- Edge Functions (Deno, all `--no-verify-jwt`): `submit-cv`, `submit-form1`, `validate-token`, `send-invite`, `generate-scorecard-token`, `submit-mcq`, `submit-scorecard`
- No candidate accounts — token-based links only; HR is the only authenticated user (`info@hatfieldhome.co.uk`)
- Application statuses: `cv_received` → `form1_complete` → `interview_invited` → `rejected` (trust_us's unused `test_complete`/`shortlisted` values were dropped — nothing in this codebase ever sets them)
- **Not replicated from trust_us, by design:** the orphaned `scorecard.html` / `validate-scorecard-token` / `submit-scorecard-token` / `scorecard_tokens` flow — trust_us itself no longer uses it (superseded by `portal.html`'s Scorecard tab), so it wasn't worth cloning here. `generate-scorecard-token` (used by the Scorecard tab) was kept.

**DB schema — `hatfield.applications`:**
id, token, status, first_name, last_name, phone, email, role_applied, cv_url, submitted_at, created_at, updated_at, form1_submitted_at, hr_notes, cv_downloaded_at, invited_at

**DB schema — `hatfield.competency_results`:**
id, application_id (FK), mcq_score, section_scores (jsonb), domain_ratings (jsonb), strengths, development_areas, outcome, interviewer_name, completed_at, answers (jsonb), mcq_submitted_at, score_viewed_at, attempt_number (default 1), superseded_at
- `outcome` check constraint: `'PASS'`, `'HOLD'`, `'FAIL'`
- Attempt-history (retake support) and its unique partial index were built in from day one — trust_us only added this via a later migration (see its ADR 0003)

**Security — token delivery:** identical to trust_us's 2026-07-01 fix. Candidate/interviewer links (`apply#token=`, `test.html#token=`) use a URL fragment, never a `?token=` query string. Client JS moves the token to `sessionStorage` and strips it from the address bar via `history.replaceState` on load. `validate-token` is POST-only. All portal pages carry `<meta name="referrer" content="no-referrer">`.

**A real gotcha found and fixed while building this (not present in trust_us's docs):** Supabase's project bootstrap sets default privileges on the `public` schema that auto-grant `anon` full CRUD on any newly-created view, regardless of what the migration's own `GRANT` statement lists. RLS still blocked `anon` from reading any row in practice, but the grant itself shouldn't have existed — the migration now includes explicit `REVOKE` statements. See `supabase/migrations/20260801100000_initial_schema.sql`.

**GDPR note:** Supabase free tier is US-hosted (AWS us-east-1), same as trust_us's project. GDPR-compliant via SCCs + UK-US Data Bridge. For strict EU data residency: upgrade to Pro and select Frankfurt region — not done here, matching trust_us's precedent, but worth a second look given this data concerns young people's carer applicants (see blockers).

## Blockers before this portal can go live (do not remove the placeholder markers below until resolved)
1. **`test.html` + `supabase/functions/submit-mcq/index.ts` question content is 100% placeholder.** Copied in *shape* only from trust_us's adult domiciliary/complex-care competency test — not appropriate content for an Ofsted-regulated children's/young-people's residential setting. Needs real safeguarding/EBD/residential-care content authored or reviewed by whoever owns Hatfield's Ofsted compliance policy. `portal.html`'s `MCQ_ANSWER_KEY`/`MCQ_SECTIONS` (used for HR's answer-review modal) must be updated to match, in the same order, once real content exists.
2. **`careers.html`'s role dropdown is a placeholder list** (`Residential Support Worker`, `Senior Support Worker/Team Leader`, `Waking Night Support Worker`, `Registered Manager`) — confirm Hatfield's actual open roles before launch.
3. **`apply.html`'s 4th declaration checkbox (Enhanced DBS/barred-list consent) is placeholder wording** — confirm exact required wording, don't treat as final legal copy.
4. **`RESEND_API_KEY` is currently TRUSTUS's key, reused as a placeholder.** Resend's free tier only allows 1 verified domain (already used by `trustuscare.com`), so `hatfieldhome.co.uk` needs its **own separate free Resend account** — sign up, verify the domain (add the DNS records it gives you), generate an API key, and replace both `.env.portal`'s `RESEND_API_KEY` and the `RESEND_API_KEY` GitHub Actions secret on this repo. Until then, `send-invite`, `submit-cv`'s candidate email, `submit-form1`'s HR email, and `submit-mcq`'s HR email will all fail to actually send (though `submit-cv`/`submit-form1`/`submit-mcq` degrade gracefully — the application still gets recorded even if the email fails; `send-invite` does not — it throws on email failure by design).
5. **Not yet pushed to GitHub / not live.** Everything above is committed locally only. Given the new "Careers" nav link on the homepage would immediately expose this flow to real visitors once pushed, don't push until blockers 1–4 are resolved (or accept that go-live means real candidates hitting placeholder content).
6. **Zahid not yet added as a collaborator** — per Saad's instruction, add with Admin access only after the portal is verified working end-to-end.

## Verification already done (2026-08-01)
Full candidate+HR journey smoke-tested against the live Supabase project with a disposable test row (deleted after): `submit-cv` → `validate-token` → `submit-form1` → `generate-scorecard-token` → `submit-mcq` → `submit-scorecard`, all confirmed working. `send-invite` deploys correctly but couldn't be tested end-to-end (blocked on Resend domain verification, see blocker 4). RLS verified: `anon` correctly blocked (`42501`), HR (`authenticated`, logged in via Supabase Auth) correctly able to read/write.

## Before proposing an alternative, check
- `trust_us/trustus/CLAUDE.md` and `trust_us/trustus/docs/decisions/` — the source portal this was modelled on, including its own incident history (ADR-0002 Supabase auto-pause, ADR-0003 attempt-history + silent-email-failure fix) that shaped decisions made here proactively rather than after an incident.
- `docs/decisions/0001-job-application-portal-build.md` in this repo.
