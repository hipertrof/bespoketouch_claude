-- Staff contact details: phone number on profiles (full_name already exists).
-- Written by the /api/members endpoint (service role) and readable under the
-- existing profiles policies (self + account co-members).

alter table public.profiles add column if not exists phone text;
