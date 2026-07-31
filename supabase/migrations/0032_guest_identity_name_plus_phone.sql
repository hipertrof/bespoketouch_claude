-- ---------------------------------------------------------------------------
-- 0032: a guest profile is identified by phone AND name, not by phone alone.
--
-- Until now `guest_profiles` carried `unique (account_id, phone_hash)` from
-- 0001, and every writer upserted on that pair. The constraint did hold — no
-- duplicate row was ever created — but it held by letting the SECOND person to
-- use a number overwrite the FIRST: name, preferences, contact columns and
-- consent stamps were all replaced, and `guest_visits` rows from both people
-- piled onto one profile. Verified in prod 2026-07-31: one profile on a phone
-- typed as a placeholder by two different test guests, carrying 4 visits.
--
-- That is the one behaviour no comparable product has. Phorest, Mindbody,
-- Mangomint and Zenoti all ALLOW several client records to share a number,
-- surface them in a duplicates report, and let a human merge them additively.
-- This migration is step 1 of moving to that model: stop the overwrite. The
-- duplicates view and the merge tool follow in later migrations.
--
-- Consequences, deliberate:
--   * A phone number may now legitimately appear on several profiles. Any
--     query that treats "one phone -> one profile" as an invariant is now a
--     bug — see the callers updated alongside this migration.
--   * Nothing here backfills or merges the profiles that were already
--     overwritten. That data is gone; only the surviving name remains. The
--     merge tool is for future collisions, not a recovery of past ones.
-- ---------------------------------------------------------------------------

-- The normalised name that, together with the phone hash, identifies a person.
-- Written by the trigger below, never by the application: three separate
-- endpoints upsert into this table (_guestCore.saveGuest, _checkinCore's
-- saveByCode, _previsitCore's saveByPrevisitCode) and a column each of them
-- had to remember to set would eventually be missed by one of them.
alter table public.guest_profiles
  add column if not exists name_key text not null default '';

-- Folding rules, in this exact order:
--   collapse any run of whitespace to one space -> trim -> lowercase ->
--   map the nine Polish diacritics onto their base letters.
-- `nameKey()` in api/_guestCore.ts MUST stay character-for-character identical
-- to this. It deliberately folds ONLY these nine: a general accent-stripper
-- (unaccent, or NFD in JS) would also fold e/u/etc, and JS's NFD cannot
-- decompose 'l' at all, so the two implementations would silently disagree and
-- split one returning guest into two profiles.
create or replace function public.guest_profiles_name_key(raw text)
returns text
language sql
immutable
as $$
  select translate(
    lower(btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'))),
    'ąćęłńóśźż',
    'acelnoszz'
  );
$$;

create or replace function public.guest_profiles_set_name_key()
returns trigger
language plpgsql
as $$
begin
  new.name_key := public.guest_profiles_name_key(new.display_name);
  return new;
end;
$$;

-- BEFORE ROW, so the value is in place before ON CONFLICT arbitration runs —
-- which is what lets PostgREST's `on_conflict=account_id,phone_hash,name_key`
-- infer the unique index below from an INSERT payload that never mentions
-- name_key.
drop trigger if exists guest_profiles_name_key_trg on public.guest_profiles;
create trigger guest_profiles_name_key_trg
  before insert or update on public.guest_profiles
  for each row execute function public.guest_profiles_set_name_key();

-- Backfill through the same function, so existing rows key identically to new
-- ones. Without this the swap below would put every current profile at
-- name_key = '' and the next save under the guest's real name would create a
-- second profile for someone who already has one.
update public.guest_profiles
   set name_key = public.guest_profiles_name_key(display_name)
 where name_key is distinct from public.guest_profiles_name_key(display_name);

-- The swap itself. Drop first: the old constraint is strictly narrower than
-- the new one, so both cannot coexist.
alter table public.guest_profiles
  drop constraint if exists guest_profiles_account_id_phone_hash_key;

alter table public.guest_profiles
  drop constraint if exists guest_profiles_account_id_phone_hash_name_key_key;

alter table public.guest_profiles
  add constraint guest_profiles_account_id_phone_hash_name_key_key
  unique (account_id, phone_hash, name_key);

-- The dropped unique constraint was also the index behind every phone lookup
-- (`account_id=eq.X&phone_hash=eq.Y`). The new three-column unique index still
-- serves those as a leading-column prefix, so this is belt-and-braces rather
-- than strictly required — kept because the lookup is on the kiosk's
-- check-in path and must not regress if the constraint is ever reshaped again.
create index if not exists guest_profiles_account_phone_idx
  on public.guest_profiles (account_id, phone_hash);
