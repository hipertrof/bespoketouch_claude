-- Table privileges for the `authenticated` role (Phase 0).
-- Because "automatically expose new tables" is OFF, roles get no privileges by
-- default. RLS gates ROWS, but Postgres GRANTs gate the TABLE — both are needed.
-- We grant to `authenticated` only (logged-in dashboard users); `anon` gets
-- nothing (kiosk / guest flows go through edge functions with the service role).
-- RLS still restricts which rows each authenticated user actually sees/writes;
-- tables without policies (tokens, pair_codes, guest_profiles) stay deny-all.

grant usage on schema public to authenticated;

-- Dashboard-facing tables (row access further restricted by RLS policies):
grant select, insert, update, delete on public.profiles          to authenticated;
grant select, insert, update, delete on public.accounts          to authenticated;
grant select, insert, update, delete on public.locations         to authenticated;
grant select, insert, update, delete on public.memberships       to authenticated;
grant select, insert, update, delete on public.slots             to authenticated;
grant select, insert, update, delete on public.services          to authenticated;
grant select, insert, update, delete on public.service_durations to authenticated;
grant select, insert, update, delete on public.location_settings to authenticated;
grant select, insert, update, delete on public.intakes           to authenticated;
grant select, insert, update, delete on public.survey_responses  to authenticated;

-- Note: tokens, pair_codes, guest_profiles are intentionally NOT granted to
-- authenticated — they are accessed only via edge functions (service role).
