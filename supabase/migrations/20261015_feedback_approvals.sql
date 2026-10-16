-- Stage 6. Apply once as the database administrator; never from a browser.
-- No case/result/prompt/scoring data is rewritten by this migration.
begin;
create schema if not exists feedback_private;
revoke all on schema feedback_private from public, anon, authenticated;
create table feedback_private.reviewer_assignments (
 owner_id uuid not null references auth.users(id) on delete cascade,
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(owner_id,reviewer_id),
 check(owner_id <> reviewer_id)
);
alter table feedback_private.reviewer_assignments enable row level security;
revoke all on feedback_private.reviewer_assignments from public, anon, authenticated;

create table public.finding_feedback (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 case_id uuid not null references public.cases(id) on delete cascade,
 submitted_by uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 finding_index integer not null check(finding_index >= 0),
 target_key text not null check(length(target_key)=64),
 original_snapshot jsonb not null check(jsonb_typeof(original_snapshot)='object'),
 proposed_type text not null check(proposed_type in ('DIRECT','INFERENTIAL','FALSE_POSITIVE')),
 rationale text not null check(length(btrim(rationale)) >= 10 and length(rationale) <= 4000),
 supersedes_id uuid,
 source_origin text not null default 'APP_SAVED_RESULT' check(source_origin='APP_SAVED_RESULT'),
 created_at timestamptz not null default now(),
 unique(id,owner_id), unique(owner_id,request_id),
 foreign key(supersedes_id,owner_id) references public.finding_feedback(id,owner_id),
 check(submitted_by=owner_id)
);
create index finding_feedback_case on public.finding_feedback(case_id,created_at,id);
create index finding_feedback_target on public.finding_feedback(owner_id,target_key);
create table public.feedback_decisions (
 id uuid primary key default gen_random_uuid(),
 feedback_id uuid not null,
 owner_id uuid not null,
 revision integer not null check(revision>0),
 reviewer_id uuid references auth.users(id) on delete set null,
 decision text not null check(decision in ('APPROVE','REJECT','NEEDS_CONTEXT','REVOKE')),
 rationale text not null check(length(btrim(rationale)) >= 10 and length(rationale) <= 4000),
 source_checked boolean not null,
 review_method text not null default 'ACCOUNT_REVIEW' check(review_method='ACCOUNT_REVIEW'),
 created_at timestamptz not null default now(),
 unique(feedback_id,revision), unique(id,feedback_id,owner_id),
 foreign key(feedback_id,owner_id) references public.finding_feedback(id,owner_id) on delete cascade,
 check(decision<>'APPROVE' or source_checked)
);
create table public.approved_feedback_examples (
 id uuid primary key default gen_random_uuid(),
 feedback_id uuid not null,
 owner_id uuid not null,
 decision_id uuid not null unique,
 corrected_type text not null check(corrected_type in ('DIRECT','INFERENTIAL','FALSE_POSITIVE')),
 explanation text not null,
 privacy_scope text not null default 'OWNER_ONLY' check(privacy_scope='OWNER_ONLY'),
 source_origin text not null default 'APP_SAVED_RESULT' check(source_origin='APP_SAVED_RESULT'),
 created_at timestamptz not null default now(),
 foreign key(feedback_id,owner_id) references public.finding_feedback(id,owner_id) on delete cascade,
 foreign key(decision_id,feedback_id,owner_id) references public.feedback_decisions(id,feedback_id,owner_id) on delete cascade
);

-- Mutable coordination index only; public submissions/decisions/examples remain
-- append-only. The unique target key also guards concurrent approvals at stronger
-- isolation levels where a prior read could have an older snapshot.
create table feedback_private.active_approvals (
 owner_id uuid not null,
 target_key text not null,
 feedback_id uuid not null,
 decision_id uuid not null unique,
 primary key(owner_id,target_key),
 foreign key(feedback_id,owner_id) references public.finding_feedback(id,owner_id) on delete cascade,
 foreign key(decision_id,feedback_id,owner_id) references public.feedback_decisions(id,feedback_id,owner_id) on delete cascade
);
alter table feedback_private.active_approvals enable row level security;
revoke all on feedback_private.active_approvals from public, anon, authenticated;

create function public.can_review_finding_feedback(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and auth.uid() <> p_owner_id and exists(
  select 1 from feedback_private.reviewer_assignments r
  where r.owner_id=p_owner_id and r.reviewer_id=auth.uid()
 );
$$;
revoke all on function public.can_review_finding_feedback(uuid) from public, anon, authenticated;
grant execute on function public.can_review_finding_feedback(uuid) to authenticated;

alter table public.finding_feedback enable row level security;
alter table public.feedback_decisions enable row level security;
alter table public.approved_feedback_examples enable row level security;
revoke all on public.finding_feedback, public.feedback_decisions, public.approved_feedback_examples from public, anon, authenticated;
grant select on public.finding_feedback, public.feedback_decisions, public.approved_feedback_examples to authenticated;
create policy "Feedback owner or assigned reviewer reads" on public.finding_feedback
 for select to authenticated using ((select auth.uid())=owner_id or public.can_review_finding_feedback(owner_id));
create policy "Decision owner or assigned reviewer reads" on public.feedback_decisions
 for select to authenticated using ((select auth.uid())=owner_id or public.can_review_finding_feedback(owner_id));
create policy "Example owner or assigned reviewer reads" on public.approved_feedback_examples
 for select to authenticated using ((select auth.uid())=owner_id or public.can_review_finding_feedback(owner_id));

create function public.submit_finding_feedback(
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
  or p_rationale is null or (length(btrim(p_rationale)) < 10 or length(p_rationale) > 4000)
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
revoke all on function public.submit_finding_feedback(uuid,integer,jsonb,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.submit_finding_feedback(uuid,integer,jsonb,text,text,uuid,uuid) to authenticated;

create function public.review_finding_feedback(
 p_feedback_id uuid,p_decision text,p_rationale text,p_source_checked boolean,
 p_expected_decision_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 caller uuid:=auth.uid(); proposal public.finding_feedback%rowtype;
 latest public.feedback_decisions%rowtype; created uuid;
begin
 if caller is null then raise exception 'Sign in before reviewing feedback.'; end if;
 if p_decision is null or p_decision not in ('APPROVE','REJECT','NEEDS_CONTEXT','REVOKE')
  or p_rationale is null or (length(btrim(p_rationale)) < 10 or length(p_rationale) > 4000) or p_source_checked is null then raise exception 'Invalid review fields.'; end if;
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
revoke all on function public.review_finding_feedback(uuid,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.review_finding_feedback(uuid,text,text,boolean,uuid) to authenticated;
comment on table public.approved_feedback_examples is 'Private historical approvals. Current eligibility requires latest decision APPROVE with this decision_id; revocation never deletes history. Not production memory in Stage 6.';
commit;
