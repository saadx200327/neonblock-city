create table private.card_expert_review_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  holding_id uuid not null unique references public.card_holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  exact_image_sha256 text,
  local_visual_hash text,
  status text not null default 'pending' check (status in ('pending','claimed','resolved','needs_user','failed')),
  priority smallint not null default 100 check (priority between 1 and 1000),
  reason text not null default 'image_needs_expert_review',
  attempts integer not null default 0 check (attempts >= 0),
  expert_result jsonb not null default '{}'::jsonb,
  last_error text,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.card_expert_review_queue enable row level security;
revoke all on table private.card_expert_review_queue from public, anon, authenticated;
create index card_expert_review_queue_pending_idx on private.card_expert_review_queue (status, priority desc, queued_at asc) where status in ('pending','claimed');
create index card_expert_review_queue_fingerprint_idx on private.card_expert_review_queue (exact_image_sha256) where exact_image_sha256 is not null;

create table private.card_expert_visual_memory (
  id uuid primary key default extensions.gen_random_uuid(),
  exact_image_sha256 text not null unique,
  local_visual_hash text,
  canonical_card_id uuid references public.canonical_cards(id) on delete set null,
  identity jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0 check (confidence between 0 and 1),
  expert_result jsonb not null default '{}'::jsonb,
  source_review_id uuid references private.card_expert_review_queue(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.card_expert_visual_memory enable row level security;
revoke all on table private.card_expert_visual_memory from public, anon, authenticated;
create index card_expert_visual_memory_local_hash_idx on private.card_expert_visual_memory (local_visual_hash) where local_visual_hash is not null;

create table private.card_expert_review_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null references private.card_expert_review_queue(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.card_expert_review_tokens enable row level security;
revoke all on table private.card_expert_review_tokens from public, anon, authenticated;
create index card_expert_review_tokens_review_idx on private.card_expert_review_tokens (review_id, expires_at desc);

create or replace function private.issue_card_expert_review_token(p_review_id uuid, p_ttl_seconds integer default 300)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds,300),600));
begin
  if not exists (
    select 1 from private.card_expert_review_queue q
    where q.id = p_review_id and q.status in ('pending','claimed')
  ) then
    raise exception 'review_not_available';
  end if;

  delete from private.card_expert_review_tokens
   where expires_at < now() or (used_at is not null and used_at < now() - interval '1 hour');

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.card_expert_review_tokens(review_id, token_hash, expires_at)
  values (p_review_id, encode(extensions.digest(v_token,'sha256'),'hex'), now() + make_interval(secs => v_ttl));

  update private.card_expert_review_queue
     set status='claimed', claimed_at=coalesce(claimed_at,now()), attempts=attempts+1, updated_at=now()
   where id=p_review_id;

  return v_token;
end;
$$;
revoke all on function private.issue_card_expert_review_token(uuid,integer) from public, anon, authenticated;

create or replace function private.resolve_card_expert_review(
  p_review_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_identity jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
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
         expert_result=coalesce(p_result,'{}'::jsonb),
         last_error=case when p_status='failed' then left(coalesce(p_result->>'error','expert review failed'),500) else null end,
         resolved_at=case when p_status in ('resolved','needs_user') then now() else resolved_at end,
         updated_at=now()
   where id=p_review_id;

  if v_resolved then
    update public.card_holdings h set
      category = case when coalesce(nullif(h.category,''),'Other')='Other' and nullif(p_identity->>'category','') is not null then p_identity->>'category' else h.category end,
      subject = coalesce(nullif(h.subject,''), nullif(p_identity->>'subject','')),
      year = coalesce(nullif(h.year,''), nullif(p_identity->>'year','')),
      manufacturer = coalesce(nullif(h.manufacturer,''), nullif(p_identity->>'manufacturer','')),
      brand = coalesce(nullif(h.brand,''), nullif(p_identity->>'brand','')),
      set_name = coalesce(nullif(h.set_name,''), nullif(p_identity->>'set_name','')),
      subset = coalesce(nullif(h.subset,''), nullif(p_identity->>'subset','')),
      card_number = coalesce(nullif(h.card_number,''), nullif(p_identity->>'card_number','')),
      parallel = coalesce(nullif(h.parallel,''), nullif(p_identity->>'parallel','')),
      variant_name = coalesce(nullif(h.variant_name,''), nullif(p_identity->>'variant_name','')),
      serial_number = coalesce(nullif(h.serial_number,''), nullif(p_identity->>'serial_number','')),
      team = coalesce(nullif(h.team,''), nullif(p_identity->>'team','')),
      league = coalesce(nullif(h.league,''), nullif(p_identity->>'league','')),
      grading_company = coalesce(nullif(h.grading_company,''), nullif(p_identity->>'grading_company','')),
      grade = coalesce(nullif(h.grade,''), nullif(p_identity->>'grade','')),
      language = coalesce(nullif(h.language,''), nullif(p_identity->>'language','')),
      edition = coalesce(nullif(h.edition,''), nullif(p_identity->>'edition','')),
      card_type = coalesce(nullif(h.card_type,''), nullif(p_identity->>'card_type','')),
      rookie = h.rookie or coalesce((p_identity->>'rookie')::boolean,false),
      autograph = h.autograph or coalesce((p_identity->>'autograph')::boolean,false),
      relic = h.relic or coalesce((p_identity->>'relic')::boolean,false),
      metadata = coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
        'needs_visual_analysis',false,
        'visual_analysis_status','expert_resolved',
        'expert_review',coalesce(p_result,'{}'::jsonb) || jsonb_build_object('review_id',p_review_id,'resolved_at',now())
      ),
      updated_at=now()
    where h.id=v_review.holding_id and h.user_id=v_review.user_id;

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
set search_path = ''
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

    update public.card_holdings h set
      category = case when coalesce(nullif(h.category,''),'Other')='Other' and nullif(v_memory.identity->>'category','') is not null then v_memory.identity->>'category' else h.category end,
      subject = coalesce(nullif(h.subject,''), nullif(v_memory.identity->>'subject','')),
      year = coalesce(nullif(h.year,''), nullif(v_memory.identity->>'year','')),
      manufacturer = coalesce(nullif(h.manufacturer,''), nullif(v_memory.identity->>'manufacturer','')),
      brand = coalesce(nullif(h.brand,''), nullif(v_memory.identity->>'brand','')),
      set_name = coalesce(nullif(h.set_name,''), nullif(v_memory.identity->>'set_name','')),
      subset = coalesce(nullif(h.subset,''), nullif(v_memory.identity->>'subset','')),
      card_number = coalesce(nullif(h.card_number,''), nullif(v_memory.identity->>'card_number','')),
      parallel = coalesce(nullif(h.parallel,''), nullif(v_memory.identity->>'parallel','')),
      variant_name = coalesce(nullif(h.variant_name,''), nullif(v_memory.identity->>'variant_name','')),
      serial_number = coalesce(nullif(h.serial_number,''), nullif(v_memory.identity->>'serial_number','')),
      team = coalesce(nullif(h.team,''), nullif(v_memory.identity->>'team','')),
      league = coalesce(nullif(h.league,''), nullif(v_memory.identity->>'league','')),
      grading_company = coalesce(nullif(h.grading_company,''), nullif(v_memory.identity->>'grading_company','')),
      grade = coalesce(nullif(h.grade,''), nullif(v_memory.identity->>'grade','')),
      language = coalesce(nullif(h.language,''), nullif(v_memory.identity->>'language','')),
      edition = coalesce(nullif(h.edition,''), nullif(v_memory.identity->>'edition','')),
      card_type = coalesce(nullif(h.card_type,''), nullif(v_memory.identity->>'card_type','')),
      metadata=coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object('needs_visual_analysis',false,'visual_analysis_status','expert_memory','expert_review',v_memory.expert_result || jsonb_build_object('memory_reused_at',now())),
      updated_at=now()
    where h.id=new.id and h.user_id=new.user_id;
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

drop trigger if exists card_holdings_queue_expert_review on public.card_holdings;
create trigger card_holdings_queue_expert_review
after insert or update of image_path, metadata on public.card_holdings
for each row execute function private.queue_card_expert_review();
