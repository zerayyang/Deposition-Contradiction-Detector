-- Remove the ten-character minimum; nonblank text and upper limits remain required.
-- Existing authorization, source checks, append-only history and grants are unchanged.
-- Run after the feedback, approved-memory and source-review migrations.
begin;
alter table public.finding_feedback drop constraint finding_feedback_rationale_check;
alter table public.finding_feedback add constraint finding_feedback_rationale_check
 check(length(btrim(rationale)) >= 1 and length(rationale) <= 4000);
alter table public.feedback_decisions drop constraint feedback_decisions_rationale_check;
alter table public.feedback_decisions add constraint feedback_decisions_rationale_check
 check(length(btrim(rationale)) >= 1 and length(rationale) <= 4000);
alter table public.feedback_memory_releases drop constraint feedback_memory_releases_lesson_check;
alter table public.feedback_memory_releases add constraint feedback_memory_releases_lesson_check
 check(length(btrim(lesson)) >= 1 and length(lesson) <= 1500);

create or replace function public.submit_finding_feedback(
 p_case_id uuid,p_finding_index integer,p_expected_finding jsonb,
 p_proposed_type text,p_rationale text,p_request_id uuid,p_supersedes_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 caller uuid:=auth.uid(); saved public.cases%rowtype; prior public.finding_feedback%rowtype;
 finding jsonb; snapshot jsonb; target text; created uuid;
begin
 if caller is null then raise exception 'Sign in before submitting feedback.'; end if;
 if p_request_id is null or p_case_id is null or p_finding_index is null or p_finding_index<0
  or p_proposed_type is null or p_proposed_type not in ('DIRECT','INFERENTIAL','FALSE_POSITIVE')
  or p_rationale is null or (length(btrim(p_rationale)) < 1 or length(p_rationale) > 4000)
  or p_expected_finding is null or jsonb_typeof(p_expected_finding)<>'object'
  or octet_length(p_expected_finding::text)>1048576 then raise exception 'Invalid feedback fields.'; end if;
 select * into saved from public.cases where id=p_case_id and owner_id=caller for share;
 if not found then raise exception 'Case not found or access denied.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||p_request_id::text,0));
 select * into prior from public.finding_feedback where owner_id=caller and request_id=p_request_id;
 if found then
  if prior.case_id<>p_case_id or prior.finding_index<>p_finding_index or prior.proposed_type<>p_proposed_type
   or prior.rationale<>p_rationale or prior.supersedes_id is distinct from p_supersedes_id
   or prior.original_snapshot->'finding' is distinct from p_expected_finding then
   raise exception 'Request ID already belongs to a different submission.';
  end if;
  return prior.id;
 end if;
 if jsonb_typeof(saved.results)='array' then finding:=saved.results->p_finding_index;
 else finding:=saved.results->'findings'->p_finding_index; end if;
 if finding is null or jsonb_typeof(finding)<>'object' or finding is distinct from p_expected_finding then
  raise exception 'Saved finding changed. Save and review the current result before submitting.';
 end if;
 if finding->>'type' is null or finding->>'type' not in ('DIRECT','INFERENTIAL','FALSE_POSITIVE')
  or jsonb_typeof(finding#>'{claim1,original}') is distinct from 'string'
  or jsonb_typeof(finding#>'{claim2,original}') is distinct from 'string'
  or coalesce(length(btrim(finding#>>'{claim1,original}')),0)=0
  or coalesce(length(btrim(finding#>>'{claim2,original}')),0)=0
  or strpos(coalesce(saved.transcript1,''),finding#>>'{claim1,original}')=0
  or strpos(coalesce(saved.transcript2,''),finding#>>'{claim2,original}')=0 then
  raise exception 'Saved finding needs literal source quotations before feedback.';
 end if;
 snapshot:=jsonb_build_object('version',1,'case_id',p_case_id,'finding',finding,
  'transcript1_sha256',encode(sha256(convert_to(coalesce(saved.transcript1,''),'UTF8')),'hex'),
  'transcript2_sha256',encode(sha256(convert_to(coalesce(saved.transcript2,''),'UTF8')),'hex'),
  'provenance',saved.results#>'{analysis,provenance}',
  'origin_notice','Snapshot of a user-saved result, not cryptographic proof of provider origin or semantic correctness.');
 target:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 if p_supersedes_id is not null and not exists(select 1 from public.finding_feedback f
  where f.id=p_supersedes_id and f.owner_id=caller and f.case_id=p_case_id and f.target_key=target) then
  raise exception 'Revision must refer to your feedback on this same source/result snapshot.';
 end if;
 insert into public.finding_feedback(owner_id,case_id,submitted_by,request_id,finding_index,target_key,original_snapshot,proposed_type,rationale,supersedes_id)
 values(caller,p_case_id,caller,p_request_id,p_finding_index,target,snapshot,p_proposed_type,p_rationale,p_supersedes_id) returning id into created;
 return created;
end;
$$;

create or replace function public.review_finding_feedback(
 p_feedback_id uuid,p_decision text,p_rationale text,p_source_checked boolean,
 p_expected_decision_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 caller uuid:=auth.uid(); proposal public.finding_feedback%rowtype;
 latest public.feedback_decisions%rowtype; created uuid;
begin
 if caller is null then raise exception 'Sign in before reviewing feedback.'; end if;
 if p_decision is null or p_decision not in ('APPROVE','REJECT','NEEDS_CONTEXT','REVOKE')
  or p_rationale is null or (length(btrim(p_rationale)) < 1 or length(p_rationale) > 4000) or p_source_checked is null then raise exception 'Invalid review fields.'; end if;
 select * into proposal from public.finding_feedback where id=p_feedback_id
  and (owner_id=caller or public.can_review_finding_feedback(owner_id)) for update;
 if not found then raise exception 'Feedback not found or review denied.'; end if;
 if caller=proposal.submitted_by or not public.can_review_finding_feedback(proposal.owner_id) then
  raise exception 'A separately authorized reviewer must review this feedback.';
 end if;
 -- Serialize decisions across the same original source/result target, not votes.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(proposal.owner_id::text||proposal.target_key,0));
 select * into latest from public.feedback_decisions where feedback_id=proposal.id order by revision desc limit 1;
 if latest.id is distinct from p_expected_decision_id then raise exception 'Review changed. Reload the latest decision before submitting.'; end if;
 if latest.decision='APPROVE' and p_decision<>'REVOKE' then raise exception 'Revoke the current approval explicitly before another decision.'; end if;
 if p_decision='REVOKE' and latest.decision is distinct from 'APPROVE' then raise exception 'Only a currently approved correction can be revoked.'; end if;
 if p_decision='APPROVE' then
  if not p_source_checked then raise exception 'Explicit source review is required for approval.'; end if;
  if exists(select 1 from public.finding_feedback f join public.feedback_decisions d on d.feedback_id=f.id
   where f.owner_id=proposal.owner_id and f.target_key=proposal.target_key and d.decision='APPROVE'
   and d.revision=(select max(newest.revision) from public.feedback_decisions newest where newest.feedback_id=f.id)) then
   raise exception 'Another correction on this source/result is approved. Revoke it before approving a replacement.';
  end if;
 end if;
 insert into public.feedback_decisions(feedback_id,owner_id,revision,reviewer_id,decision,rationale,source_checked)
 values(proposal.id,proposal.owner_id,coalesce(latest.revision,0)+1,caller,p_decision,p_rationale,p_source_checked) returning id into created;
 if p_decision='REVOKE' then
  delete from feedback_private.active_approvals where owner_id=proposal.owner_id and target_key=proposal.target_key and decision_id=latest.id;
  if not found then raise exception 'Current approval changed. Reload before revoking.'; end if;
 end if;
 if p_decision='APPROVE' then
  insert into feedback_private.active_approvals(owner_id,target_key,feedback_id,decision_id)
  values(proposal.owner_id,proposal.target_key,proposal.id,created);
  insert into public.approved_feedback_examples(feedback_id,owner_id,decision_id,corrected_type,explanation)
  values(proposal.id,proposal.owner_id,created,proposal.proposed_type,p_rationale);
 end if;
 return created;
end;
$$;

create or replace function public.release_feedback_memory(p_example_id uuid,p_enabled boolean,p_lesson text,p_search_terms text[],p_not_evaluation_material boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare ex public.approved_feedback_examples%rowtype; created uuid;
begin
 select * into ex from public.approved_feedback_examples where id=p_example_id for update;
 if not found or auth.uid() is null or not public.can_review_finding_feedback(ex.owner_id) then
  raise exception 'An independently assigned reviewer must release memory.';
 end if;
 if p_not_evaluation_material is distinct from true or p_enabled is null or p_lesson is null
 or length(btrim(p_lesson))<1 or length(p_lesson)>1500 or p_search_terms is null
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
commit;
