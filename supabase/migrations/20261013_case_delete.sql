begin;
grant delete on public.cases to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cases' and policyname = 'Delete own cases') then
    create policy "Delete own cases" on public.cases
      for delete to authenticated
      using ((select auth.uid()) = owner_id);
  end if;
end $$;
commit;
