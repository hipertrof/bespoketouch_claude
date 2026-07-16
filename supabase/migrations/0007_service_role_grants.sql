-- Grant the backend `service_role` its table privileges.
--
-- The /api/members invite endpoint runs as service_role (via the Supabase secret
-- key). service_role bypasses RLS, but Postgres GRANTs still gate table access —
-- and these were only ever granted to `authenticated` (0002), never to
-- service_role. The missing grant surfaced as:
--   42501  permission denied for table profiles
-- This is also what 0002's own comment assumed ("guest flows go through edge
-- functions with the service role") but never actually granted.
--
-- Grant service_role full access to all current and future objects in public —
-- the standard Supabase posture for the trusted backend role.

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
