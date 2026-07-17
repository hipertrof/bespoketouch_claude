-- BespokeTouch — Phase 4b: post-treatment survey
--
-- ⚠️ `survey_responses` ALREADY EXISTS — 0001 declared the whole schema up front,
-- including this table (see "Survey (Phase 4)" there), with RLS enabled and no
-- policies (deny-all), 0002's grants to `authenticated`, and an index on
-- (location_id, created_at desc). 0007 then granted service_role everything.
--
-- So this migration only does what 0001 deferred: fit the columns to the agreed
-- question set, constrain the enums, and add the read policy. An earlier draft
-- of this file re-declared the table with CREATE TABLE and aborted the whole
-- script on 42P07 — which is why the endpoint failed with a column mismatch.
-- Re-runnable: every statement is idempotent.
--
-- Visibility rule (decided with the user): therapist ratings are MANAGERS ONLY.
-- Rather than fight Postgres column privileges (grants are per DB role —
-- `authenticated` — not per app role), the whole table is manager-and-up: the
-- read policy below is can_manage_location(). Therapists and front-desk get no
-- rows, which satisfies "therapists can't see their ratings" without any
-- column-level machinery. Revisit only if therapists ever need self-service
-- scores — that would need a SECURITY DEFINER view exposing a column subset.
--
-- Writes never come from a logged-in user: the kiosk is anonymous-but-paired, so
-- api/survey.ts inserts with the service role after resolving the device token
-- (same model as api/intake.ts — see api/_deviceAuth.ts). 0002 did grant
-- insert/update/delete to `authenticated`, but with RLS on and NO write policy
-- those are denied anyway — deny-by-default is doing the work here.

-- ---------------------------------------------------------------------------
-- 1. Columns 0001 didn't anticipate.
-- ---------------------------------------------------------------------------

-- Therapist NAME snapshot, so reporting still reads correctly after someone
-- leaves and their membership/profile row is gone. Mirrors the intake's habit of
-- snapshotting the treatment rather than trusting a live join.
alter table public.survey_responses
  add column if not exists therapist_name text;

-- 0001 typed these two as integer. The agreed questions ("was the atmosphere
-- comfortable?", "did the therapist listen?") are three-point verbal scales, not
-- counts, and storing 'yes'/'mostly'/'no' keeps the DB self-describing instead of
-- needing a lookup to read a report. Safe to retype: the feature has never
-- shipped, so the table is empty — and if it somehow isn't, the USING cast plus
-- the CHECK below will fail loudly rather than silently mangle data.
alter table public.survey_responses
  alter column atmosphere_comfort type text using atmosphere_comfort::text;
alter table public.survey_responses
  alter column therapist_responsiveness type text using therapist_responsiveness::text;

-- ---------------------------------------------------------------------------
-- 2. Constrain the answer domains. The server whitelists these too
--    (api/_surveyCore.ts); this is the backstop, not the only guard.
--    All columns stay NULLABLE: every question is skippable by design, so NULL
--    is a real answer meaning "declined", not missing data.
-- ---------------------------------------------------------------------------

alter table public.survey_responses drop constraint if exists survey_pressure_chk;
alter table public.survey_responses add  constraint survey_pressure_chk
  check (pressure_feedback in ('too_light', 'just_right', 'too_deep'));

alter table public.survey_responses drop constraint if exists survey_atmosphere_chk;
alter table public.survey_responses add  constraint survey_atmosphere_chk
  check (atmosphere_comfort in ('yes', 'mostly', 'no'));

alter table public.survey_responses drop constraint if exists survey_responsiveness_chk;
alter table public.survey_responses add  constraint survey_responsiveness_chk
  check (therapist_responsiveness in ('yes', 'mostly', 'no'));

alter table public.survey_responses drop constraint if exists survey_csat_chk;
alter table public.survey_responses add  constraint survey_csat_chk
  check (csat_stars between 1 and 5);

alter table public.survey_responses drop constraint if exists survey_nps_chk;
alter table public.survey_responses add  constraint survey_nps_chk
  check (nps between 0 and 10);

-- ---------------------------------------------------------------------------
-- 3. Reads: managers and up only (owner / manager-of-location / platform admin).
--    can_manage_location() is the same helper the CMS + /kiosks dashboards use,
--    so the three RBAC mirrors stay consistent.
-- ---------------------------------------------------------------------------

drop policy if exists survey_read_manage on public.survey_responses;
create policy survey_read_manage on public.survey_responses
  for select to authenticated
  using (public.can_manage_location(location_id));

-- ---------------------------------------------------------------------------
-- 4. Indexes. 0001 already covers (location_id, created_at desc) via
--    survey_location_idx, and intakes via intakes_location_idx — the survey's
--    "today's visits" picker rides that one. Only the per-therapist grouping
--    for reporting is new.
-- ---------------------------------------------------------------------------

create index if not exists survey_responses_therapist_idx
  on public.survey_responses (therapist_id);
