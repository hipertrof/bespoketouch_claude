-- 0016: logo storage for per-location kiosk branding.
--
-- The branding data itself lives in location_settings.branding (jsonb, declared
-- in 0001; anon read + can_manage_location write policies already exist from
-- 0003). This migration only adds the Storage side: a public bucket for logos
-- and object policies keyed on the path convention <location_id>/<filename>.
--
-- NOTE: if the SQL editor rejects the policies with "must be owner of table
-- objects", create the same four policies via Dashboard -> Storage -> Policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  1048576, -- 1 MB
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do nothing;

-- Logos are public brand assets (the kiosk reads them as anon), like the
-- price-list read bridge. Nothing sensitive lives in this bucket.
create policy branding_objects_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'branding');

-- Writes: only managers of the location named by the first path segment.
create policy branding_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and public.can_manage_location(((storage.foldername(name))[1])::uuid)
  );

create policy branding_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and public.can_manage_location(((storage.foldername(name))[1])::uuid)
  );

create policy branding_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and public.can_manage_location(((storage.foldername(name))[1])::uuid)
  );
