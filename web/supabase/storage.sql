-- =====================================================================
--  "images" storage bucket  (avatars now, shared verse images later)
--  Run in  Supabase → SQL Editor  (after schema.sql). Safe to re-run.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- anyone can view images (public bucket)
drop policy if exists "images public read" on storage.objects;
create policy "images public read" on storage.objects
  for select using (bucket_id = 'images');

-- a user may write only inside their own folder:  images/<uid>/...
drop policy if exists "images owner insert" on storage.objects;
create policy "images owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "images owner update" on storage.objects;
create policy "images owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "images owner delete" on storage.objects;
create policy "images owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
