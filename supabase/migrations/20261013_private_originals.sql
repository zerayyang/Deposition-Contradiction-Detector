begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-originals', 'case-originals', false, 2097152, array['text/plain','text/markdown'])
on conflict (id) do nothing;
do $$ begin
  if exists (select 1 from storage.buckets where id = 'case-originals' and public) then
    raise exception 'case-originals already exists as a public bucket; make it private before continuing';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Upload own case originals') then
    create policy "Upload own case originals" on storage.objects for insert to authenticated with check (
      bucket_id = 'case-originals' and (storage.foldername(name))[1] = (select auth.uid())::text
      and (storage.foldername(name))[2] in (select id::text from public.cases where owner_id = (select auth.uid()))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Read own case originals') then
    create policy "Read own case originals" on storage.objects for select to authenticated using (
      bucket_id = 'case-originals' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Remove own case originals') then
    create policy "Remove own case originals" on storage.objects for delete to authenticated using (
      bucket_id = 'case-originals' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end $$;
commit;
