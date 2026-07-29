-- Fake guests for UI testing — NOT a migration.
--
-- This file deliberately lives outside supabase/migrations/ so it never runs
-- as part of the schema history. Paste it into the Supabase SQL editor, set
-- v_account (and optionally v_location) on the lines marked below, and run it.
-- The DELETE at the bottom undoes it completely.
--
-- Creates 60 guests, which is enough to push /guests past its 50-per-page
-- limit and make the "Pokaż więcej" button appear. The spread is deliberate so
-- every filter has something to find:
--   * visit counts 0-8            -> "Nowi" (<=1) and "Stali" (>=3)
--   * every 5th guest last seen 100-300 days ago -> "Nieaktywni" (>90 days)
--   * every 3rd guest has health consent
--   * every 2nd guest has marketing consent, with a phone and e-mail
--   * every 11th guest has NO name -> renders as the "Gość #XXXX" handle
--
-- Every row is identifiable by its phone_hash starting with 'seedtest', which
-- is what the cleanup matches on. Real phone hashes are 64 hex characters, so
-- there is no chance of colliding with a genuine guest.

do $$
declare
  v_account  uuid := '00000000-0000-0000-0000-000000000000';  -- <<< SET THIS
  v_location text := 'ZZZ Lokalizacja';                       -- <<< optional

  first_names text[] := array[
    'Anna','Katarzyna','Maria','Agnieszka','Barbara','Magdalena','Zofia','Julia',
    'Piotr','Krzysztof','Tomasz','Paweł','Michał','Marcin','Jakub','Adam'
  ];
  last_names text[] := array[
    'Nowak','Kowalska','Wiśniewski','Wójcik','Kowalczyk','Kamińska','Lewandowski',
    'Zielińska','Szymański','Woźniak','Dąbrowska','Kozłowski','Mazur','Krawczyk'
  ];
  treatments text[] := array[
    'Masaż relaksacyjny','Masaż głęboki','Masaż gorącymi kamieniami',
    'Masaż sportowy','Masaż aromaterapeutyczny','Masaż pleców'
  ];
  therapists text[] := array['Ola','Marta','Piotr','Kasia','Bartek'];
  pressures  text[] := array['Lekki','Średni','Mocny','Głęboki'];

  g          uuid;
  i          int;
  j          int;
  n_visits   int;
  last_days  int;
  seen_at    timestamptz;
  has_health boolean;
  has_mkt    boolean;
begin
  if v_account = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set v_account to a real accounts.id before running this.';
  end if;

  for i in 1..60 loop
    n_visits   := (random() * 8)::int;
    -- Every 5th guest is deliberately stale so the "Nieaktywni" filter has
    -- something to show; a lapsed guest needs at least one past visit.
    last_days  := case when i % 5 = 0 then 100 + (random() * 200)::int
                       else (random() * 80)::int end;
    if i % 5 = 0 and n_visits = 0 then
      n_visits := 1 + (random() * 3)::int;
    end if;
    seen_at    := now() - (last_days || ' days')::interval;
    has_health := (i % 3 = 0);
    has_mkt    := (i % 2 = 0);

    insert into public.guest_profiles (
      account_id, phone_hash, preferences,
      consent_version, consent_at,
      health_consent_version, health_consent_at,
      marketing_consent_version, marketing_consent_at,
      display_name, contact_phone, contact_email,
      last_seen_at
    ) values (
      v_account,
      'seedtest' || lpad(i::text, 4, '0') || md5(i::text),
      jsonb_build_object(
        'v', 1,
        'pressure', pressures[1 + (random() * 3)::int],
        'tableWarming', (i % 2 = 0)
      ),
      '2026-07-v4-base', seen_at,
      case when has_health then '2026-07-v3-health' end,
      case when has_health then seen_at end,
      case when has_mkt then '2026-07-v6-marketing' end,
      case when has_mkt then seen_at end,
      -- Every 11th row is left unnamed on purpose, to exercise the
      -- "Gość #XXXX" fallback that legacy pre-v4 rows still hit.
      case when i % 11 <> 0
        then first_names[1 + (i % array_length(first_names, 1))] || ' ' ||
             last_names[1 + (i % array_length(last_names, 1))]
      end,
      case when has_mkt then '+48600' || lpad(i::text, 6, '0') end,
      case when has_mkt then 'seedtest' || i || '@example.test' end,
      seen_at
    )
    returning id into g;

    for j in 1..n_visits loop
      insert into public.guest_visits (
        account_id, guest_id, location_name, visited_at,
        treatment_name, treatment_price, duration_min, therapist_name
      ) values (
        v_account, g, v_location,
        seen_at - ((j - 1) * 30 || ' days')::interval,
        treatments[1 + (random() * (array_length(treatments, 1) - 1))::int],
        150 + (random() * 250)::int,
        (array[30, 60, 90])[1 + (random() * 2)::int],
        therapists[1 + (random() * (array_length(therapists, 1) - 1))::int]
      );
    end loop;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- CLEANUP — removes every seeded guest and, by cascade, their visits, notes
-- and tag assignments. Tags themselves are account vocabulary and survive.
-- Set the same account id, then run just this statement.
-- ---------------------------------------------------------------------------

-- delete from public.guest_profiles
--  where account_id = '00000000-0000-0000-0000-000000000000'  -- <<< SET THIS
--    and phone_hash like 'seedtest%';
