-- Per-service offered pressure levels. NULL = all four (backward compat).
alter table public.services
  add column pressure_levels text[] null
  check (
    pressure_levels is null
    or (
      array_length(pressure_levels, 1) >= 1
      and pressure_levels <@ array['Lekki','Średni','Mocny','Głęboki']::text[]
    )
  );

comment on column public.services.pressure_levels is
  'Subset of pressure levels this service offers; NULL means all four.';
