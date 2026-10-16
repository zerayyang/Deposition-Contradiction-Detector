-- Stage 8: an explicitly assigned reviewer can inspect only a selected proposal's sources.
-- No grants on other owners' cases, browser writes, automatic approvals or releases.
begin;
create function public.get_feedback_review_sources(p_feedback_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.finding_feedback%rowtype; c public.cases%rowtype; unchanged boolean;
begin
 if auth.uid() is null then raise exception 'Sign in before reviewing sources.'; end if;
 select * into f from public.finding_feedback where id=p_feedback_id
  and (owner_id=auth.uid() or public.can_review_finding_feedback(owner_id));
 if not found then raise exception 'Feedback not found or review denied.'; end if;
 select * into c from public.cases where id=f.case_id and owner_id=f.owner_id;
 if not found then raise exception 'Original case is unavailable.'; end if;
 unchanged:=(f.original_snapshot->>'transcript1_sha256'=encode(sha256(convert_to(coalesce(c.transcript1,''),'UTF8')),'hex')
 and f.original_snapshot->>'transcript2_sha256'=encode(sha256(convert_to(coalesce(c.transcript2,''),'UTF8')),'hex'));
 return jsonb_build_object('caseTitle',c.title,'transcript1',c.transcript1,'transcript2',c.transcript2,
  'sourcesUnchanged',coalesce(unchanged,false),'findingUnchanged',coalesce((case when jsonb_typeof(c.results)='array' then c.results->f.finding_index else c.results->'findings'->f.finding_index end)=f.original_snapshot->'finding',false));
end; $$;
revoke all on function public.get_feedback_review_sources(uuid) from public,anon,authenticated;
grant execute on function public.get_feedback_review_sources(uuid) to authenticated;
-- Recheck at the write boundary too: a case can change after a reviewer opens it.
create function feedback_private.require_current_review_sources()
returns trigger language plpgsql security definer set search_path='' as $$
declare f public.finding_feedback%rowtype; c public.cases%rowtype;
begin
 select * into f from public.finding_feedback where id=new.feedback_id;
 select * into c from public.cases where id=f.case_id and owner_id=f.owner_id;
 if not found or f.original_snapshot->>'transcript1_sha256' is distinct from encode(sha256(convert_to(coalesce(c.transcript1,''),'UTF8')),'hex')
 or f.original_snapshot->>'transcript2_sha256' is distinct from encode(sha256(convert_to(coalesce(c.transcript2,''),'UTF8')),'hex')
 or (case when jsonb_typeof(c.results)='array' then c.results->f.finding_index else c.results->'findings'->f.finding_index end) is distinct from f.original_snapshot->'finding' then
  raise exception 'Sources or finding changed. Submit and review a current correction before approval.';
 end if;
 return new;
end; $$;
revoke all on function feedback_private.require_current_review_sources() from public,anon,authenticated;
create trigger review_requires_current_sources before insert on public.feedback_decisions
 for each row when(new.decision='APPROVE') execute function feedback_private.require_current_review_sources();
commit;
