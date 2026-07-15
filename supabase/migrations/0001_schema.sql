-- BespokeTouch — initial schema (Phase 0 foundation)
-- Multi-tenant SaaS backbone for all four plans:
--   accounts → locations → (slots, services, intakes, guest_profiles, surveys)
-- RLS is enabled on EVERY table. Access is decided by `memberships` (or the
-- platform-admin flag), never by the client. Tenancy tables are fully policied
-- here; feature-table policies are added in their respective phases.
--
-- Roles (memberships.role): owner | manager | therapist | frontdesk
-- Platform Admin is the boolean flag on `profiles`, not a membership.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- One row per auth user. `is_platform_admin` = cross-tenant god mode (the owner).
create table public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  full_name         text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

-- The paying customer (one spa owner or one chain company).
create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  plan               text,
  slots_paid         integer not null default 0,   -- set manually until Stripe (deferred)
  subscription_start date,
  subscription_end   date,
  stripe_customer_id text,
  created_at         timestamptz not null default now()
);

-- Org unit between account and slot. A chain has many; a single spa has one.
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name       text not null,
  currency   text not null default 'PLN',
  timezone   text not null default 'Europe/Warsaw',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every non-platform role. location_id NULL = account-wide scope (owner).
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  location_id uuid references public.locations (id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'therapist', 'frontdesk')),
  created_at  timestamptz not null default now()
);

-- Prevent duplicate memberships (NULL location_id treated as its own slot).
create unique index memberships_unique
  on public.memberships (user_id, account_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so they bypass RLS when checking membership,
-- avoiding recursive policy evaluation). Fixed search_path for safety.
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.is_platform_admin
  );
$$;

create or replace function public.has_account_access(target_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.account_id = target_account
  );
$$;

-- Access to a location: platform admin, an account-wide membership (owner) on the
-- location's account, or a membership scoped to that exact location.
create or replace function public.has_location_access(target_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships m
    join public.locations l on l.id = target_location
    where m.user_id = auth.uid()
      and m.account_id = l.account_id
      and (m.location_id is null or m.location_id = target_location)
  );
$$;

-- True if the current user can manage (write) the location: platform admin,
-- account owner, or a manager scoped to that location.
create or replace function public.can_manage_location(target_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships m
    join public.locations l on l.id = target_location
    where m.user_id = auth.uid()
      and m.account_id = l.account_id
      and (
        (m.role = 'owner'  and m.location_id is null)
        or (m.role = 'manager' and (m.location_id is null or m.location_id = target_location))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Monetization: slots / tokens / pair codes (Phase 2 mechanics; billing deferred)
-- ---------------------------------------------------------------------------

create table public.slots (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  label       text,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  created_at  timestamptz not null default now()
);

create table public.tokens (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid not null references public.slots (id) on delete cascade,
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz,
  last_seen_at timestamptz
);

create table public.pair_codes (
  code       text primary key,
  slot_id    uuid not null references public.slots (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Offer / CMS (Phase 3): replaces hardcoded src/data/massageTypes.ts
-- ---------------------------------------------------------------------------

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations (id) on delete cascade,
  name_i18n       jsonb not null default '{}'::jsonb,        -- { pl, en, ... }
  description_i18n jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now()
);

create table public.service_durations (
  id               uuid primary key default gen_random_uuid(),
  service_id       uuid not null references public.services (id) on delete cascade,
  minutes          integer not null,
  price_single     numeric(10, 2),
  price_couple     numeric(10, 2),
  couple_available boolean not null default false
);

create table public.location_settings (
  location_id uuid primary key references public.locations (id) on delete cascade,
  defaults    jsonb not null default '{}'::jsonb,   -- createPersonalization() defaults
  oils        jsonb not null default '[]'::jsonb,   -- data/oils.ts, per-location
  branding    jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Intakes (Phase 3): ephemeral per-visit snapshot feeding the therapist dashboard
-- PII: guest names + body/health notes. Short retention via expires_at.
-- ---------------------------------------------------------------------------

create table public.intakes (
  id                   uuid primary key default gen_random_uuid(),
  location_id          uuid not null references public.locations (id) on delete cascade,
  status               text not null default 'submitted',
  party_size           integer not null default 1,
  guest_names          jsonb not null default '[]'::jsonb,
  treatment_selections jsonb not null default '[]'::jsonb,
  personalizations     jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz    -- auto-purge target (retention job)
);
create index intakes_location_idx on public.intakes (location_id, created_at desc);

-- ---------------------------------------------------------------------------
-- CRM (Phase 4): opt-in preference memory. Pseudonymous — phone stored only as
-- a per-account keyed hash, never raw. Structured prefs only (no health notes).
-- ---------------------------------------------------------------------------

create table public.guest_profiles (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  phone_hash      text not null,                       -- HMAC(phone, secret + account_id)
  preferences     jsonb not null default '{}'::jsonb,  -- structured prefs only
  consent_version text,
  consent_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz,
  unique (account_id, phone_hash)
);

-- ---------------------------------------------------------------------------
-- Survey (Phase 4): post-treatment feedback. Pseudonymous (no guest PII).
-- ---------------------------------------------------------------------------

create table public.survey_responses (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references public.accounts (id) on delete cascade,
  location_id              uuid not null references public.locations (id) on delete cascade,
  intake_id                uuid references public.intakes (id) on delete set null,
  therapist_id             uuid references auth.users (id) on delete set null,
  treatment_type           text,
  pressure_feedback        text,     -- too_light | just_right | too_deep
  atmosphere_comfort       integer,
  therapist_responsiveness integer,  -- managers-only visibility (enforced in Phase 4 policy)
  csat_stars               integer,
  nps                      integer,
  next_visit_note          text,
  lang                     text,
  created_at               timestamptz not null default now()
);
create index survey_location_idx on public.survey_responses (location_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security: enable on ALL tables (deny-by-default until policies exist)
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.accounts          enable row level security;
alter table public.locations         enable row level security;
alter table public.memberships       enable row level security;
alter table public.slots             enable row level security;
alter table public.tokens            enable row level security;
alter table public.pair_codes        enable row level security;
alter table public.services          enable row level security;
alter table public.service_durations enable row level security;
alter table public.location_settings enable row level security;
alter table public.intakes           enable row level security;
alter table public.guest_profiles    enable row level security;
alter table public.survey_responses  enable row level security;

-- ----- Tenancy backbone policies (Phase 1) ---------------------------------

-- profiles: a user reads/updates only their own row; platform admins read all.
create policy profiles_self_read on public.profiles
  for select using (user_id = auth.uid() or public.is_platform_admin());
create policy profiles_self_update on public.profiles
  for update using (user_id = auth.uid());

-- accounts: members of the account (or platform admin) can read; only platform
-- admin writes (account creation / slots_paid / subscription dates).
create policy accounts_read on public.accounts
  for select using (public.has_account_access(id));
create policy accounts_admin_write on public.accounts
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- locations: readable by anyone with account access; writable by owner/platform admin.
create policy locations_read on public.locations
  for select using (public.has_account_access(account_id));
create policy locations_write on public.locations
  for all using (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.account_id = locations.account_id
        and m.role = 'owner' and m.location_id is null
    )
  ) with check (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.account_id = locations.account_id
        and m.role = 'owner' and m.location_id is null
    )
  );

-- memberships: users see their own; account owners/platform admin see & manage
-- memberships within their account.
create policy memberships_self_read on public.memberships
  for select using (user_id = auth.uid() or public.has_account_access(account_id));
create policy memberships_owner_write on public.memberships
  for all using (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.account_id = memberships.account_id
        and m.role = 'owner' and m.location_id is null
    )
  ) with check (
    public.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.account_id = memberships.account_id
        and m.role = 'owner' and m.location_id is null
    )
  );

-- NOTE: policies for slots, tokens, pair_codes, services, service_durations,
-- location_settings, intakes, guest_profiles, survey_responses are added in
-- their feature phases (2–4). Until then RLS denies all non-service-role access.
