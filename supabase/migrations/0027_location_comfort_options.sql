-- Per-location comfort options (which comfort features a location offers, and
-- what the choices are for the list-valued ones: oil / music / pillow).
--
-- '{}' = the built-in defaults (all five features on, the bundled oil/music/
-- pillow lists), the same "one canonical no-restriction value" idiom as
-- services.pressure_levels IS NULL in 0023 — so no location needs backfilling.
--
-- No policy or grant work: location_settings already carries
-- location_settings_read_anon / _read_auth / _write from 0003_offer_cms.sql and
-- a table-level `grant select ... to anon`, all of which cover a new column.
alter table public.location_settings
  add column comfort jsonb not null default '{}'::jsonb;

comment on column public.location_settings.comfort is
  'Per-location comfort options (src/lib/comfort.ts ComfortConfig). {} = built-in defaults.';
