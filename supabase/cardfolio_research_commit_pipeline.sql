-- Cardfolio hourly research commit pipeline. Applied to production 2026-09-06.
-- Deduplicates marketplace observations and atomically records each research result.

alter table public.card_market_observations add column if not exists observation_fingerprint text;

create or replace function private.cardfolio_observation_fingerprint(
  p_marketplace text,p_source_kind text,p_external_id text,p_provenance_url text,p_title text,p_price numeric,p_sold_at timestamptz
) returns text
language sql immutable set search_path=public,private as $$
  select md5(concat_ws('|',
    lower(trim(coalesce(p_marketplace,''))),lower(trim(coalesce(p_source_kind,''))),lower(trim(coalesce(p_external_id,''))),
    lower(trim(coalesce(p_provenance_url,''))),lower(regexp_replace(trim(coalesce(p_title,'')), '\s+', ' ', 'g')),
    coalesce(p_price::text,''),coalesce(p_sold_at::text,'')
  ))
$$;

update public.card_market_observations
set observation_fingerprint=private.cardfolio_observation_fingerprint(marketplace,source_kind,external_id,provenance_url,title,price,sold_at)
where observation_fingerprint is null;

alter table public.card_market_observations alter column observation_fingerprint set not null;
create unique index if not exists card_market_observations_dedupe_idx on public.card_market_observations(canonical_card_id,observation_fingerprint);

create or replace function private.cardfolio_set_observation_fingerprint()
returns trigger language plpgsql set search_path=public,private as $$
begin
  new.observation_fingerprint:=private.cardfolio_observation_fingerprint(new.marketplace,new.source_kind,new.external_id,new.provenance_url,new.title,new.price,new.sold_at);
  return new;
end $$;

drop trigger if exists card_market_observation_fingerprint on public.card_market_observations;
create trigger card_market_observation_fingerprint before insert or update of marketplace,source_kind,external_id,provenance_url,title,price,sold_at on public.card_market_observations for each row execute function private.cardfolio_set_observation_fingerprint();

create or replace function private.cardfolio_commit_research_result(
  p_canonical_card_id uuid,p_status text,p_observations jsonb default '[]'::jsonb,p_price numeric default null,
  p_low numeric default null,p_high numeric default null,p_sample_size integer default 0,p_confidence numeric default null,
  p_method text default null,p_source_summary text default null,p_analyst_bull text default null,p_analyst_base text default null,
  p_analyst_bear text default null,p_research_summary text default null
) returns void
language plpgsql security definer set search_path=public,private as $$
declare
  o jsonb;v_sold integer:=0;v_active integer:=0;v_accepted integer:=0;v_research_status text;v_valuation_status text;
begin
  if p_status not in ('priced','insufficient_data','no_change','error') then raise exception 'invalid research status'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then raise exception 'confidence out of range'; end if;
  if p_price is not null and p_price<0 then raise exception 'price must be nonnegative'; end if;
  if p_low is not null and p_high is not null and p_low>p_high then raise exception 'invalid valuation range'; end if;
  if not exists(select 1 from public.canonical_cards where id=p_canonical_card_id) then raise exception 'canonical card not found'; end if;

  for o in select value from jsonb_array_elements(coalesce(p_observations,'[]'::jsonb)) loop
    if coalesce((o->>'price')::numeric,-1)<0 then continue; end if;
    if coalesce(o->>'source_kind','')='sold' then v_sold:=v_sold+1; elsif coalesce(o->>'source_kind','')='active' then v_active:=v_active+1; end if;
    if coalesce((o->>'exact_match')::boolean,false) then v_accepted:=v_accepted+1; end if;
    insert into public.card_market_observations(canonical_card_id,marketplace,source_kind,title,price,currency,condition,external_id,provenance_url,sold_at,observed_at,exact_match,match_score,raw_reference)
    values(p_canonical_card_id,left(coalesce(o->>'marketplace','Unknown'),80),coalesce(o->>'source_kind','indexed'),left(o->>'title',300),(o->>'price')::numeric,coalesce(o->>'currency','USD'),left(o->>'condition',100),left(o->>'external_id',180),left(o->>'provenance_url',1000),nullif(o->>'sold_at','')::timestamptz,coalesce(nullif(o->>'observed_at','')::timestamptz,now()),coalesce((o->>'exact_match')::boolean,false),nullif(o->>'match_score','')::numeric,coalesce(o->'raw_reference','{}'::jsonb))
    on conflict(canonical_card_id,observation_fingerprint) do update set observed_at=greatest(public.card_market_observations.observed_at,excluded.observed_at),match_score=coalesce(excluded.match_score,public.card_market_observations.match_score),exact_match=public.card_market_observations.exact_match or excluded.exact_match,raw_reference=public.card_market_observations.raw_reference||excluded.raw_reference;
  end loop;

  insert into public.card_market_research_runs(canonical_card_id,status,sold_candidates,active_candidates,accepted_comps,computed_price,confidence,summary,researched_at)
  values(p_canonical_card_id,p_status,v_sold,v_active,coalesce(p_sample_size,v_accepted),p_price,p_confidence,left(p_research_summary,1200),now());

  v_research_status:=case p_status when 'priced' then 'ready' when 'no_change' then 'ready' when 'insufficient_data' then 'insufficient_data' else 'error' end;
  v_valuation_status:=case when p_status='priced' and p_price is not null then 'priced' when p_status='no_change' then (select valuation_status from public.canonical_cards where id=p_canonical_card_id) when p_status='insufficient_data' then 'insufficient_data' else 'error' end;

  update public.canonical_cards set
    current_price=case when p_status='priced' and p_price is not null then p_price else current_price end,
    valuation_status=v_valuation_status,
    valuation_low=case when p_status='priced' then p_low else valuation_low end,
    valuation_high=case when p_status='priced' then p_high else valuation_high end,
    valuation_sample_size=case when p_status='priced' then greatest(coalesce(p_sample_size,0),0) else valuation_sample_size end,
    valuation_confidence=case when p_status='priced' then p_confidence else valuation_confidence end,
    valuation_method=case when p_status='priced' then left(p_method,160) else valuation_method end,
    valuation_source_summary=case when p_status='priced' then left(p_source_summary,1200) else valuation_source_summary end,
    valuation_observed_at=case when p_status in ('priced','no_change') then now() else valuation_observed_at end,
    analyst_bull=coalesce(left(p_analyst_bull,1200),analyst_bull),analyst_base=coalesce(left(p_analyst_base,1200),analyst_base),analyst_bear=coalesce(left(p_analyst_bear,1200),analyst_bear),
    analyst_updated_at=case when p_analyst_bull is not null or p_analyst_base is not null or p_analyst_bear is not null then now() else analyst_updated_at end,
    research_status=v_research_status,last_researched_at=now(),updated_at=now()
  where id=p_canonical_card_id;
end $$;

revoke all on function private.cardfolio_observation_fingerprint(text,text,text,text,text,numeric,timestamptz) from public,anon,authenticated;
revoke all on function private.cardfolio_set_observation_fingerprint() from public,anon,authenticated;
revoke all on function private.cardfolio_commit_research_result(uuid,text,jsonb,numeric,numeric,numeric,integer,numeric,text,text,text,text,text,text) from public,anon,authenticated;
