-- BespokeTouch — Phase 4b: post-treatment survey
--
-- A pseudonymous feedback row written by a paired kiosk at checkout. It links to
-- the guest's earlier intake (therapist + treatment) but never to the guest:
-- no name, phone, or email — by construction, not by policy.
--
-- Visibility rule (decided with the user): therapist ratings are MANAGERS ONLY.
-- Rather than fight Postgres column privileges (grants are per DB role —
-- `authenticated` — not per app role), the whole table is manager-and-up: the
-- read policy is can_manage_location(). Therapists and front-desk simply get no
-- rows, which satisfies "therapists can't see their ratings" without any
-- column-level machinery. Revisit only if therapists ever need self-service
-- scores — that would need a SECURITY DEFINER view exposing a column subset.
--
-- Writes never come from a logged-in user: the kiosk is anonymous-but-paired, so
-- api/survey.ts inserts with the service role after resolving the device token
-- (same model as api/intake.ts — see api/_deviceAuth.ts). Hence no INSERT policy
-- for `authenticated` and no grant of any kind to `anon`.

create table public.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts  (id) on delete cascade,
  location_id  uuid not null references public.locations (id) on delete cascade,

  -- Pseudonymous link to the visit. Nullable + ON DELETE SET NULL so purging an
  -- intake (48h retention) never destroys the feedback history built on it.
  intake_id    uuid references public.intakes (id) on delete set null,

  -- Therapist id for joins, plus a NAME SNAPSHOT so reporting still reads
  -- correctly after someone leaves and their membership/profile is gone.
  therapist_id   uuid references auth.users (id) on delete set null,
  therapist_name text,

  -- Treatment snapshot, same reasoning as intakes.treatment_selections: a later
  -- rename in the CMS must not rewrite past feedback.
  treatment_name text,

  -- Answers. All nullable: every question is skippable by design.
  pressure_feedback        text check (pressure_feedback        in ('too_light', 'just_right', 'too_deep')),
  atmosphere_comfort       text check (atmosphere_comfort       in ('yes', 'mostly', 'no')),
  therapist_responsiveness text check (therapist_responsiveness in ('yes', 'mostly', 'no')),
  csat_stars               integer check (csat_stars between 1 and 5),
  nps                      integer check (nps between 0 and 10),

  -- Free text. A guest could type something identifying or health-related here,
  -- so it is treated like the intake's notes: manager-visible only (the read
  -- policy below) and a purge target for the retention job. No job yet — a
  -- future sweep should null this out on age using created_at.
  next_visit_note text,

  lang       text,
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Reads: managers and up only (owner / manager-of-location / platform admin).
-- can_manage_location() is the same helper the CMS + /kiosks dashboards use, so
-- the three RBAC mirrors stay consistent.
-- ---------------------------------------------------------------------------

create policy survey_read_manage on public.survey_responses
  for select to authenticated
  using (public.can_manage_location(location_id));

-- ---------------------------------------------------------------------------
-- Grants. `authenticated` needs table-level SELECT for the policy above to have
-- anything to filter. service_role is granted explicitly rather than relying on
-- 0007's default privileges — the missing-grant 42501 has bitten this project
-- before, and an explicit grant costs nothing.
-- ---------------------------------------------------------------------------

grant select on public.survey_responses to authenticated;
grant all    on public.survey_responses to service_role;

-- Reporting reads by location over a time window; the FK columns are also the
-- group-by keys for per-therapist / per-treatment breakdowns.
create index survey_responses_location_created_idx
  on public.survey_responses (location_id, created_at desc);
create index survey_responses_therapist_idx
  on public.survey_responses (therapist_id);

-- Front-desk picks the guest's earlier visit from *today's* intakes for this
-- location; api/survey.ts serves that list to the paired device.
create index if not exists intakes_location_created_idx
  on public.intakes (location_id, created_at desc);
