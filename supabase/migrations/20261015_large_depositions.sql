-- Apply in Supabase SQL Editor (or your migration deployment). This does not
-- change existing objects, ownership, case rows or private storage policies.
begin;
do $$ begin
  if not exists(select 1 from storage.buckets where id='case-originals' and public=false) then
    raise exception 'Create the private case-originals bucket using earlier migrations first';
  end if;
end $$;
update storage.buckets set file_size_limit=52428800,
  allowed_mime_types=array['application/pdf','text/plain','text/markdown']
where id='case-originals' and public=false;
commit;
-- Also set Storage Settings > Global file size limit to at least 50 MiB.
-- The bucket cannot override the project's global limit or plan quota.
