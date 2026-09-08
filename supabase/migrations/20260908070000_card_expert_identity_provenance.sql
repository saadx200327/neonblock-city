-- Expert review must be able to replace machine/OCR guesses while preserving fields
-- the authenticated owner explicitly changed later. Nonempty does not mean confirmed.

create or replace function private.cardfolio_identity_field_confirmed(p_metadata jsonb, p_field text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select coalesce(coalesce(p_metadata,'{}'::jsonb)->'user_confirmed_identity_fields','[]'::jsonb) ? p_field;
$$;
revoke all on function private.cardfolio_identity_field_confirmed(jsonb,text) from public, anon, authenticated;

create or replace function private.apply_card_expert_identity(
  p_holding_id uuid,
  p_user_id uuid,
  p_identity jsonb,
  p_result jsonb,
  p_visual_status text default 'expert_resolved'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.card_holdings h set
    category = case when private.cardfolio_identity_field_confirmed(h.metadata,'category') then h.category else coalesce(nullif(p_identity->>'category',''),h.category) end,
    subject = case when private.cardfolio_identity_field_confirmed(h.metadata,'subject') then h.subject else coalesce(nullif(p_identity->>'subject',''),h.subject) end,
    display_name = case when private.cardfolio_identity_field_confirmed(h.metadata,'display_name') then h.display_name else coalesce(nullif(p_identity->>'display_name',''),nullif(p_identity->>'subject',''),h.display_name) end,
    year = case when private.cardfolio_identity_field_confirmed(h.metadata,'year') then h.year else coalesce(nullif(p_identity->>'year',''),h.year) end,
    manufacturer = case when private.cardfolio_identity_field_confirmed(h.metadata,'manufacturer') then h.manufacturer else coalesce(nullif(p_identity->>'manufacturer',''),h.manufacturer) end,
    brand = case when private.cardfolio_identity_field_confirmed(h.metadata,'brand') then h.brand else coalesce(nullif(p_identity->>'brand',''),h.brand) end,
    set_name = case when private.cardfolio_identity_field_confirmed(h.metadata,'set_name') then h.set_name else coalesce(nullif(p_identity->>'set_name',''),h.set_name) end,
    subset = case when private.cardfolio_identity_field_confirmed(h.metadata,'subset') then h.subset else coalesce(nullif(p_identity->>'subset',''),h.subset) end,
    card_number = case when private.cardfolio_identity_field_confirmed(h.metadata,'card_number') then h.card_number else coalesce(nullif(p_identity->>'card_number',''),h.card_number) end,
    parallel = case when private.cardfolio_identity_field_confirmed(h.metadata,'parallel') then h.parallel else coalesce(nullif(p_identity->>'parallel',''),h.parallel) end,
    variant_name = case when private.cardfolio_identity_field_confirmed(h.metadata,'variant_name') then h.variant_name else coalesce(nullif(p_identity->>'variant_name',''),h.variant_name) end,
    serial_number = case when private.cardfolio_identity_field_confirmed(h.metadata,'serial_number') then h.serial_number else coalesce(nullif(p_identity->>'serial_number',''),h.serial_number) end,
    team = case when private.cardfolio_identity_field_confirmed(h.metadata,'team') then h.team else coalesce(nullif(p_identity->>'team',''),h.team) end,
    league = case when private.cardfolio_identity_field_confirmed(h.metadata,'league') then h.league else coalesce(nullif(p_identity->>'league',''),h.league) end,
    grading_company = case when private.cardfolio_identity_field_confirmed(h.metadata,'grading_company') then h.grading_company else coalesce(nullif(p_identity->>'grading_company',''),h.grading_company) end,
    grade = case when private.cardfolio_identity_field_confirmed(h.metadata,'grade') then h.grade else coalesce(nullif(p_identity->>'grade',''),h.grade) end,
    language = case when private.cardfolio_identity_field_confirmed(h.metadata,'language') then h.language else coalesce(nullif(p_identity->>'language',''),h.language) end,
    edition = case when private.cardfolio_identity_field_confirmed(h.metadata,'edition') then h.edition else coalesce(nullif(p_identity->>'edition',''),h.edition) end,
    card_type = case when private.cardfolio_identity_field_confirmed(h.metadata,'card_type') then h.card_type else coalesce(nullif(p_identity->>'card_type',''),h.card_type) end,
    rookie = case when private.cardfolio_identity_field_confirmed(h.metadata,'rookie') then h.rookie when lower(coalesce(p_identity->>'rookie','')) in ('true','false') then (p_identity->>'rookie')::boolean else h.rookie end,
    autograph = case when private.cardfolio_identity_field_confirmed(h.metadata,'autograph') then h.autograph when lower(coalesce(p_identity->>'autograph','')) in ('true','false') then (p_identity->>'autograph')::boolean else h.autograph end,
    relic = case when private.cardfolio_identity_field_confirmed(h.metadata,'relic') then h.relic when lower(coalesce(p_identity->>'relic','')) in ('true','false') then (p_identity->>'relic')::boolean else h.relic end,
    metadata = coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
      'needs_visual_analysis',false,
      'visual_analysis_status',p_visual_status,
      'identity_resolution_source',case when p_visual_status='expert_memory' then 'expert_visual_memory' else 'expert_visual_review' end,
      'display_name_source',case when private.cardfolio_identity_field_confirmed(h.metadata,'display_name') then coalesce(h.metadata->>'display_name_source','user') else case when p_visual_status='expert_memory' then 'expert_visual_memory' else 'expert_visual_review' end end,
      'expert_review',coalesce(p_result,'{}'::jsonb) || jsonb_build_object('identity',coalesce(p_identity,'{}'::jsonb),'applied_at',now())
    ),
    updated_at=now()
  where h.id=p_holding_id and h.user_id=p_user_id;
end;
$$;
revoke all on function private.apply_card_expert_identity(uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;

create or replace function private.track_cardfolio_user_identity_changes()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fields text[] := array[]::text[];
  v_field text;
  v_confirmed jsonb;
begin
  -- Only direct authenticated owner writes establish confirmation provenance.
  if auth.uid() is null or auth.uid() <> new.user_id then return new; end if;

  if new.category is distinct from old.category then v_fields:=array_append(v_fields,'category'); end if;
  if new.subject is distinct from old.subject then v_fields:=array_append(v_fields,'subject'); end if;
  if new.display_name is distinct from old.display_name then v_fields:=array_append(v_fields,'display_name'); end if;
  if new.year is distinct from old.year then v_fields:=array_append(v_fields,'year'); end if;
  if new.manufacturer is distinct from old.manufacturer then v_fields:=array_append(v_fields,'manufacturer'); end if;
  if new.brand is distinct from old.brand then v_fields:=array_append(v_fields,'brand'); end if;
  if new.set_name is distinct from old.set_name then v_fields:=array_append(v_fields,'set_name'); end if;
  if new.subset is distinct from old.subset then v_fields:=array_append(v_fields,'subset'); end if;
  if new.card_number is distinct from old.card_number then v_fields:=array_append(v_fields,'card_number'); end if;
  if new.parallel is distinct from old.parallel then v_fields:=array_append(v_fields,'parallel'); end if;
  if new.variant_name is distinct from old.variant_name then v_fields:=array_append(v_fields,'variant_name'); end if;
  if new.serial_number is distinct from old.serial_number then v_fields:=array_append(v_fields,'serial_number'); end if;
  if new.team is distinct from old.team then v_fields:=array_append(v_fields,'team'); end if;
  if new.league is distinct from old.league then v_fields:=array_append(v_fields,'league'); end if;
  if new.grading_company is distinct from old.grading_company then v_fields:=array_append(v_fields,'grading_company'); end if;
  if new.grade is distinct from old.grade then v_fields:=array_append(v_fields,'grade'); end if;
  if new.language is distinct from old.language then v_fields:=array_append(v_fields,'language'); end if;
  if new.edition is distinct from old.edition then v_fields:=array_append(v_fields,'edition'); end if;
  if new.card_type is distinct from old.card_type then v_fields:=array_append(v_fields,'card_type'); end if;
  if new.rookie is distinct from old.rookie then v_fields:=array_append(v_fields,'rookie'); end if;
  if new.autograph is distinct from old.autograph then v_fields:=array_append(v_fields,'autograph'); end if;
  if new.relic is distinct from old.relic then v_fields:=array_append(v_fields,'relic'); end if;

  if cardinality(v_fields)=0 then return new; end if;
  v_confirmed:=coalesce(coalesce(new.metadata,'{}'::jsonb)->'user_confirmed_identity_fields','[]'::jsonb);
  foreach v_field in array v_fields loop
    if not (v_confirmed ? v_field) then v_confirmed:=v_confirmed || to_jsonb(v_field); end if;
  end loop;
  new.metadata:=jsonb_set(coalesce(new.metadata,'{}'::jsonb),'{user_confirmed_identity_fields}',v_confirmed,true);
  return new;
end;
$$;
revoke all on function private.track_cardfolio_user_identity_changes() from public, anon, authenticated;

drop trigger if exists card_holdings_track_user_identity_changes on public.card_holdings;
create trigger card_holdings_track_user_identity_changes
before update on public.card_holdings
for each row execute function private.track_cardfolio_user_identity_changes();

create or replace function private.resolve_card_expert_review(
  p_review_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_identity jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_review private.card_expert_review_queue%rowtype;
  v_conf numeric := 0;
  v_resolved boolean := p_status='resolved';
begin
  if p_status not in ('resolved','needs_user','failed') then raise exception 'invalid_review_status'; end if;
  select * into v_review from private.card_expert_review_queue where id=p_review_id for update;
  if not found then raise exception 'review_not_found'; end if;

  if coalesce(p_result->>'overall_confidence','') ~ '^(0(\.\d+)?|1(\.0+)?)$' then
    v_conf := (p_result->>'overall_confidence')::numeric;
  end if;

  update private.card_expert_review_queue
     set status=p_status,
         expert_result=coalesce(p_result,'{}'::jsonb) || jsonb_build_object('identity',coalesce(p_identity,'{}'::jsonb)),
         last_error=case when p_status='failed' then left(coalesce(p_result->>'error','expert review failed'),500) else null end,
         resolved_at=case when p_status in ('resolved','needs_user') then now() else resolved_at end,
         updated_at=now()
   where id=p_review_id;

  if v_resolved then
    perform private.apply_card_expert_identity(v_review.holding_id,v_review.user_id,p_identity,p_result,'expert_resolved');

    if nullif(v_review.exact_image_sha256,'') is not null then
      insert into private.card_expert_visual_memory(exact_image_sha256,local_visual_hash,identity,confidence,expert_result,source_review_id)
      values(v_review.exact_image_sha256,v_review.local_visual_hash,coalesce(p_identity,'{}'::jsonb),v_conf,coalesce(p_result,'{}'::jsonb),p_review_id)
      on conflict(exact_image_sha256) do update set
        local_visual_hash=excluded.local_visual_hash,
        identity=excluded.identity,
        confidence=greatest(private.card_expert_visual_memory.confidence,excluded.confidence),
        expert_result=excluded.expert_result,
        source_review_id=excluded.source_review_id,
        updated_at=now();
    end if;
  else
    update public.card_holdings h set
      metadata=coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
        'needs_visual_analysis',true,
        'visual_analysis_status',case when p_status='needs_user' then 'expert_needs_user' else 'expert_failed' end,
        'expert_review',coalesce(p_result,'{}'::jsonb) || jsonb_build_object('review_id',p_review_id,'reviewed_at',now())
      ),
      updated_at=now()
    where h.id=v_review.holding_id and h.user_id=v_review.user_id;
  end if;
end;
$$;
revoke all on function private.resolve_card_expert_review(uuid,text,jsonb,jsonb) from public, anon, authenticated;

create or replace function private.queue_card_expert_review()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_needs boolean := coalesce(new.metadata->>'needs_visual_analysis','false')='true';
  v_status text := coalesce(new.metadata->>'visual_analysis_status','');
  v_sha text := nullif(new.metadata #>> '{local_visual_signature,image_sha256}','');
  v_hash text := nullif(new.metadata #>> '{local_visual_signature,dhash64}','');
  v_memory private.card_expert_visual_memory%rowtype;
begin
  if new.image_path is null or btrim(new.image_path)='' or not v_needs or v_status in ('analyzed','expert_resolved','expert_memory') then
    return new;
  end if;

  if v_sha is not null then
    select * into v_memory from private.card_expert_visual_memory m
     where m.exact_image_sha256=v_sha and m.confidence>=0.95
     order by m.updated_at desc limit 1;
  end if;

  if found then
    insert into private.card_expert_review_queue(holding_id,user_id,image_path,exact_image_sha256,local_visual_hash,status,reason,expert_result,resolved_at)
    values(new.id,new.user_id,new.image_path,v_sha,v_hash,'resolved','exact_image_memory_hit',v_memory.expert_result,now())
    on conflict(holding_id) do update set
      image_path=excluded.image_path, exact_image_sha256=excluded.exact_image_sha256, local_visual_hash=excluded.local_visual_hash,
      status='resolved', reason='exact_image_memory_hit', expert_result=excluded.expert_result, resolved_at=now(), updated_at=now();

    perform private.apply_card_expert_identity(new.id,new.user_id,v_memory.identity,v_memory.expert_result,'expert_memory');
    return new;
  end if;

  insert into private.card_expert_review_queue(holding_id,user_id,image_path,exact_image_sha256,local_visual_hash,status,reason)
  values(new.id,new.user_id,new.image_path,v_sha,v_hash,'pending','image_needs_expert_review')
  on conflict(holding_id) do update set
    image_path=excluded.image_path,
    exact_image_sha256=excluded.exact_image_sha256,
    local_visual_hash=excluded.local_visual_hash,
    status=case when private.card_expert_review_queue.exact_image_sha256 is not distinct from excluded.exact_image_sha256 and private.card_expert_review_queue.status in ('pending','claimed') then private.card_expert_review_queue.status else 'pending' end,
    reason='image_needs_expert_review',
    last_error=null,
    queued_at=case when private.card_expert_review_queue.exact_image_sha256 is distinct from excluded.exact_image_sha256 then now() else private.card_expert_review_queue.queued_at end,
    resolved_at=case when private.card_expert_review_queue.exact_image_sha256 is distinct from excluded.exact_image_sha256 then null else private.card_expert_review_queue.resolved_at end,
    updated_at=now();
  return new;
end;
$$;
revoke all on function private.queue_card_expert_review() from public, anon, authenticated;
