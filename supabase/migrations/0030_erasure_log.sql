-- BespokeTouch — erasure accountability record, anonymised visit totals, and
-- the do-not-contact list.
--
-- Six code paths delete or cut back a guest_profiles row today, and none of
-- them leaves a trace:
--   1. /api/crm forget                    (manager, "Zapomnij gościa")
--   2. /api/crm withdrawConsent base      (consent desk — same act as forget)
--   3. /api/crm withdrawConsent health|marketing
--   4. /api/guest forget + save with a tier switched off  (kiosk)
--   5. /api/checkin save with base consent off            (guest's own phone)
--   6. the 540-day lazy expiry inside /api/guest lookup
--
-- Art. 17 does not require keeping the erasure itself, but Art. 5(2)
-- accountability requires the CONTROLLER (the spa — BespokeTouch is the
-- processor) to be able to DEMONSTRATE that a request arrived, that the
-- subject was identified, and that it was carried out. A minimal record that
-- holds no name, no contact detail and no treatment data is the expected
-- design, not a loophole. What it must never become is a "deletion log" that
-- quietly preserves the profile under another name — hence the column list
-- below is deliberately short and free of anything readable.
--
-- Every table here follows the pair_codes / checkin_codes / guest_profiles
-- pattern: RLS enabled, ZERO policies, ZERO grants. Only the serverless
-- functions holding the service-role key can touch them.
--
-- NOTE ON SCOPE: as shipped there is NO read path and NO UI for erasure_log —
-- it is write-only on purpose. The tenant-facing export ("hand this to UODO")
-- and the refused/partial request form are a deliberate later step, not an
-- oversight. `outcome`/`refusal_reason` already exist so that step needs no
-- second migration.
--
-- Re-runnable: guarded with if-not-exists where possible.

-- ---------------------------------------------------------------------------
-- erasure_log — the proof that the process ran
-- ---------------------------------------------------------------------------
-- subject_ref is the EXISTING guest_profiles.phone_hash: HMAC-SHA256 of the
-- normalized phone under GUEST_HASH_SECRET + account_id. Reused deliberately
-- rather than inventing a second pseudonym — a guest who comes back six months
-- later gives their number, the server hashes it, and the erasure can be
-- confirmed without anything readable ever having been kept. It is still
-- pseudonymised personal data, which is why this table has its own retention
-- period (the purge job at the bottom) and its own basis in the ROPA
-- (Art. 6(1)(c)/(f), accountability) — see docs/erasure-policy.md.

create table if not exists public.erasure_log (
  id                           uuid primary key default gen_random_uuid(),
  -- The record belongs to the TENANT: the spa is the controller and must be
  -- able to produce it for a regulator. Cascades with the account.
  account_id                   uuid not null references public.accounts (id) on delete cascade,
  subject_ref                  text not null,
  request_received_at          date not null default current_date,
  request_channel              text not null
    check (request_channel in ('dashboard', 'consent_desk', 'kiosk', 'checkin', 'retention')),
  identity_verification_method text not null,
  -- What was actually erased. Subset of:
  --   profile, visits, notes, tags, health, marketing, contact
  scope                        text[] not null,
  -- 'refused' is unwritten today (no UI to record a declined request yet) but
  -- constrained now so the later form is a code change, not a migration.
  outcome                      text not null default 'completed'
    check (outcome in ('completed', 'partial', 'refused')),
  refusal_reason               text,
  -- Art. 17(3): e.g. an invoice the spa must keep under Polish tax law. Nothing
  -- in BespokeTouch itself is exempt (it stores no accounting records), so this
  -- exists for the spa to record ITS OWN call.
  retained_under_exemption     text,
  completed_at                 timestamptz,
  executed_by                  uuid references auth.users (id) on delete set null,
  -- Name snapshot (the guest_notes.author_name / survey therapist_name idiom):
  -- a manager who later leaves the spa stays attributed.
  executed_by_name             text,
  -- Set instead of executed_by when no human acted: kiosk-device,
  -- checkin-code, retention-540d.
  executed_by_system           text,
  -- Art. 19: the processors told about the erasure.
  recipients_notified          text[],
  created_at                   timestamptz not null default now()
);

comment on table public.erasure_log is
  'Append-only Art. 5(2) accountability record for guest erasures. Holds no name, no contact detail, no treatment data — only the phone_hash pseudonym and the process metadata. Belongs to the tenant (account_id).';
comment on column public.erasure_log.subject_ref is
  'guest_profiles.phone_hash (HMAC-SHA256 under GUEST_HASH_SECRET + account_id). Matchable, never readable back. Rotating the secret orphans these rows exactly as it orphans guest_profiles.';

create index if not exists erasure_log_account_idx on public.erasure_log (account_id, created_at desc);
-- The "did we already erase this person?" lookup.
create index if not exists erasure_log_subject_idx on public.erasure_log (account_id, subject_ref);

alter table public.erasure_log enable row level security;
-- Deliberately no grant to anon/authenticated and no policies.

-- Append-only: an accountability record that can be edited afterwards proves
-- nothing. UPDATE is blocked outright.
--
-- DELETE is deliberately NOT blocked. Two legitimate deletes exist: the
-- retention purge below, and the ON DELETE CASCADE when a whole tenant is
-- removed in /admin. A blanket delete guard would break both, and the table is
-- service-role-only anyway — no staff login can reach it.
create or replace function public.erasure_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'erasure_log is append-only: rows cannot be modified once written';
end $$;

drop trigger if exists erasure_log_no_update on public.erasure_log;
create trigger erasure_log_no_update
  before update on public.erasure_log
  for each row execute function public.erasure_log_append_only();

-- ---------------------------------------------------------------------------
-- visit_stats — the aggregate that survives an erasure
-- ---------------------------------------------------------------------------
-- guest_visits FKs guest_profiles ON DELETE CASCADE (0025), so erasing one
-- guest also destroys the spa's throughput and revenue history for those
-- visits. The correct treatment of an aggregate is ANONYMISE, not delete:
-- keep "treatment X, 40 times in March", sever the link to the individual
-- irreversibly, and the figure leaves GDPR scope entirely.
--
-- Deliberately coarse: month only (no visit timestamp), location and treatment
-- by NAME only (no ids), no therapist, no guest, no intake. Nothing here can
-- be joined back to a person — which is what makes the severance real rather
-- than cosmetic.

create table if not exists public.visit_stats (
  account_id     uuid not null references public.accounts (id) on delete cascade,
  month          date not null,
  -- Empty string rather than null: these are primary-key columns and a null
  -- would defeat the ON CONFLICT accumulate below.
  location_name  text not null default '',
  treatment_name text not null default '',
  visit_count    integer not null default 0,
  revenue_total  numeric not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (account_id, month, location_name, treatment_name)
);

comment on table public.visit_stats is
  'Anonymous monthly totals folded out of guest_visits immediately before a guest_profiles row is deleted. No guest, no date finer than the month, no ids — outside GDPR scope by construction.';

alter table public.visit_stats enable row level security;
-- No policies/grants yet: nothing reads this today. The reporting that will
-- read it ships with its own policy.

-- The fold is a TRIGGER, not an application-code call, on purpose: there are
-- six delete paths today, plus hand-written SQL and whatever is added later.
-- A helper call is missable; a trigger is not. BEFORE DELETE, so the visits
-- are still there to be counted when the cascade removes them.
create or replace function public.guest_profiles_fold_visits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visit_stats (account_id, month, location_name, treatment_name, visit_count, revenue_total)
  select v.account_id,
         date_trunc('month', v.visited_at)::date,
         coalesce(v.location_name, ''),
         coalesce(v.treatment_name, ''),
         count(*),
         coalesce(sum(v.treatment_price), 0)
  from public.guest_visits v
  where v.guest_id = old.id
  group by 1, 2, 3, 4
  on conflict (account_id, month, location_name, treatment_name) do update
    set visit_count   = visit_stats.visit_count   + excluded.visit_count,
        revenue_total = visit_stats.revenue_total + excluded.revenue_total,
        updated_at    = now();
  return old;
end $$;

drop trigger if exists guest_profiles_fold_visits_before_delete on public.guest_profiles;
create trigger guest_profiles_fold_visits_before_delete
  before delete on public.guest_profiles
  for each row execute function public.guest_profiles_fold_visits();

-- ---------------------------------------------------------------------------
-- contact_suppression — the do-not-contact list
-- ---------------------------------------------------------------------------
-- Deliberately NOT a FK to guest_profiles: it must SURVIVE the erasure. Without
-- it, a spa re-importing an old marketing spreadsheet next month silently
-- resurrects someone who objected, and re-processes them.
--
-- Holds the phone_hash and nothing else: a number cannot be read out of it,
-- only checked against.
--
-- Written on every profile erasure and every marketing withdrawal. Cleared ONLY
-- by a fresh, in-person marketing opt-in at the kiosk or /checkin — a new
-- freely-given consent supersedes the old objection. Staff can never clear it,
-- mirroring withdrawConsent, which can only turn a tier OFF.
--
-- NO retention period, deliberately: purging this list would defeat the whole
-- point of it. Stated as a position in docs/erasure-policy.md, not left
-- implicit.

create table if not exists public.contact_suppression (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  subject_ref text not null,
  reason      text not null check (reason in ('erasure', 'marketing_withdrawal')),
  created_at  timestamptz not null default now(),
  primary key (account_id, subject_ref)
);

comment on table public.contact_suppression is
  'Do-not-contact list keyed by phone_hash only. Survives guest erasure by design (no FK to guest_profiles). Any future sending path MUST check this table first.';

alter table public.contact_suppression enable row level security;
-- Deliberately no grant to anon/authenticated and no policies.

-- ---------------------------------------------------------------------------
-- Retention for the log itself
-- ---------------------------------------------------------------------------
-- The hash is pseudonymised personal data, so the accountability record needs
-- its own end date. Three years aligns with the window for RODO complaints and
-- claims; the same hourly cron rhythm as 0018/0019 (job name upserts on
-- re-run, so this migration stays re-runnable).

select cron.schedule(
  'erasure-log-purge',
  '41 3 * * *',
  $$delete from public.erasure_log where created_at < now() - interval '3 years'$$
);
