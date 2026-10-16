-- Part 7: private, explicitly released lessons. Ordinary feedback approval is NOT release.
create table public.feedback_memory_releases (
 id uuid primary key default gen_random_uuid(),
 revision bigint generated always as identity,
 example_id uuid not null references public.approved_feedback_examples(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 reviewer_id uuid references auth.users(id) on delete set null,
 enabled boolean not null,
 lesson text not null check(length(lesson) between 10 and 1500),
 search_terms text[] not null check(cardinality(search_terms) between 1 and 16),
 not_evaluation_material boolean not null check(not_evaluation_material),
 created_at timestamptz not null default now()
);
alter table public.feedback_memory_releases enable row level security;
revoke all on public.feedback_memory_releases from public,anon,authenticated;
grant select on public.feedback_memory_releases to authenticated;
create policy "Private memory release audit" on public.feedback_memory_releases for select to authenticated
 using(owner_id=(select auth.uid()) or public.can_review_finding_feedback(owner_id));

create function public.release_feedback_memory(p_example_id uuid,p_enabled boolean,p_lesson text,p_search_terms text[],p_not_evaluation_material boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare ex public.approved_feedback_examples%rowtype; created uuid;
begin
 select * into ex from public.approved_feedback_examples where id=p_example_id for update;
 if not found or auth.uid() is null or not public.can_review_finding_feedback(ex.owner_id) then
  raise exception 'An independently assigned reviewer must release memory.';
 end if;
 if p_not_evaluation_material is distinct from true or p_enabled is null or p_lesson is null
 or length(btrim(p_lesson))<10 or length(p_lesson)>1500 or p_search_terms is null
 or cardinality(p_search_terms) not between 1 and 16
 or exists(select 1 from unnest(p_search_terms) term where term is null or length(btrim(term)) not between 2 and 60) then
  raise exception 'Provide a short reusable lesson, search terms and an explicit non-evaluation declaration.';
 end if;
 if p_enabled and not exists(select 1 from feedback_private.active_approvals a join public.feedback_decisions d on d.id=a.decision_id
  where a.feedback_id=ex.feedback_id and a.decision_id=ex.decision_id and d.decision='APPROVE' and d.source_checked) then
  raise exception 'Only a current source-checked approval can be released.';
 end if;
 insert into public.feedback_memory_releases(example_id,owner_id,reviewer_id,enabled,lesson,search_terms,not_evaluation_material)
 values(ex.id,ex.owner_id,auth.uid(),p_enabled,btrim(p_lesson),p_search_terms,true) returning id into created;
 return created;
end; $$;
revoke all on function public.release_feedback_memory(uuid,boolean,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.release_feedback_memory(uuid,boolean,text,text[],boolean) to authenticated;

create function public.get_approved_feedback_memory(p_case_id uuid,p_document_hashes text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lessons jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.cases where id=p_case_id and owner_id=auth.uid()) then
  raise exception 'Save an owned case before using private memory.';
 end if;
 select coalesce(jsonb_agg(to_jsonb(pool) order by pool.id),'[]'::jsonb) into lessons from (
 select e.id,e.decision_id,r.id as release_id,e.corrected_type,r.lesson,r.search_terms
 from public.approved_feedback_examples e
 join public.finding_feedback f on f.id=e.feedback_id and f.owner_id=e.owner_id
 join public.cases c on c.id=f.case_id and c.owner_id=e.owner_id
 join feedback_private.active_approvals a on a.feedback_id=e.feedback_id and a.decision_id=e.decision_id
 join public.feedback_decisions d on d.id=e.decision_id and d.decision='APPROVE' and d.source_checked
 join lateral(select * from public.feedback_memory_releases m where m.example_id=e.id order by m.revision desc limit 1) r on r.enabled
 where e.owner_id=auth.uid() and e.privacy_scope='OWNER_ONLY' and e.source_origin='APP_SAVED_RESULT'
 and d.reviewer_id is not null and d.reviewer_id<>e.owner_id and r.reviewer_id is not null and r.reviewer_id<>e.owner_id
 and r.not_evaluation_material and f.case_id<>p_case_id
 and f.original_snapshot->>'transcript1_sha256'=encode(sha256(convert_to(coalesce(c.transcript1,''),'UTF8')),'hex')
 and f.original_snapshot->>'transcript2_sha256'=encode(sha256(convert_to(coalesce(c.transcript2,''),'UTF8')),'hex')
 and not(f.original_snapshot->>'transcript1_sha256'=any(coalesce(p_document_hashes,array[]::text[])))
 and not(f.original_snapshot->>'transcript2_sha256'=any(coalesce(p_document_hashes,array[]::text[])))
 order by e.id limit 101
 ) pool;
 if jsonb_array_length(lessons)>100 then raise exception 'Memory pool exceeds 100 lessons; curate it before use. Nothing was silently omitted.'; end if;
 return lessons;
end; $$;
revoke all on function public.get_approved_feedback_memory(uuid,text[]) from public,anon,authenticated;
grant execute on function public.get_approved_feedback_memory(uuid,text[]) to authenticated;
