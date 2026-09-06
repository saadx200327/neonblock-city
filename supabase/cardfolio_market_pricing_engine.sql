-- Server-only pricing engine. Browser roles cannot execute it.
-- Exact sold comps set market value; active asking prices are context only.
create or replace function private.reprice_card_from_observations(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_prev numeric;v_sold_count integer:=0;v_active_count integer:=0;v_low numeric;v_high numeric;v_median numeric;v_p10 numeric;v_p90 numeric;v_price numeric;v_latest timestamptz;v_method text;v_confidence numeric;v_sample_factor numeric;v_recency_factor numeric;v_spread_factor numeric;v_spread_ratio numeric;v_summary text;v_changed boolean:=false;
begin
  select current_price into v_prev from public.canonical_cards where id=p_card_id for update;
  if not found then raise exception 'canonical card not found'; end if;
  select count(*)::int into v_active_count from public.card_market_observations where canonical_card_id=p_card_id and exact_match=true and source_kind='active' and currency='USD' and price>0;
  select count(*)::int,min(price),max(price),percentile_cont(0.5) within group(order by price)::numeric,percentile_cont(0.1) within group(order by price)::numeric,percentile_cont(0.9) within group(order by price)::numeric,max(coalesce(sold_at,observed_at))
    into v_sold_count,v_low,v_high,v_median,v_p10,v_p90,v_latest
  from public.card_market_observations
  where canonical_card_id=p_card_id and exact_match=true and source_kind='sold' and currency='USD' and price>0 and coalesce(sold_at,observed_at)>=now()-interval '365 days';
  if v_sold_count=0 then
    update public.canonical_cards set research_status='insufficient_data',last_researched_at=now(),valuation_status=case when current_price is null then 'insufficient_data' else 'stale' end,valuation_sample_size=0,valuation_confidence=null,valuation_source_summary='No verified exact sold comps in the last 365 days; active listings are context only.',updated_at=now() where id=p_card_id;
    insert into public.card_market_research_runs(canonical_card_id,status,sold_candidates,active_candidates,accepted_comps,computed_price,confidence,summary) values(p_card_id,'insufficient_data',0,v_active_count,0,null,null,'No verified exact sold comps in the last 365 days. Active asking prices were not substituted for sales.');
    return jsonb_build_object('status','insufficient_data','sold_comps',0,'active_context',v_active_count,'price',v_prev,'changed',false);
  end if;
  if v_sold_count>=5 then
    select round(avg(price),2) into v_price from public.card_market_observations where canonical_card_id=p_card_id and exact_match=true and source_kind='sold' and currency='USD' and price>0 and coalesce(sold_at,observed_at)>=now()-interval '365 days' and price between v_p10 and v_p90;
    v_method:='10% trimmed mean of verified exact sold comps';
  else
    v_price:=round(v_median,2);v_method:='median of verified exact sold comps';
  end if;
  v_sample_factor:=case when v_sold_count>=10 then .95 when v_sold_count>=5 then .85 when v_sold_count>=3 then .72 when v_sold_count=2 then .58 else .42 end;
  v_recency_factor:=case when v_latest>=now()-interval '7 days' then 1.0 when v_latest>=now()-interval '30 days' then .95 when v_latest>=now()-interval '90 days' then .85 when v_latest>=now()-interval '180 days' then .72 else .58 end;
  if coalesce(v_median,0)>0 then v_spread_ratio:=(coalesce(v_high,v_median)-coalesce(v_low,v_median))/v_median; else v_spread_ratio:=2; end if;
  v_spread_factor:=case when v_spread_ratio<=.25 then 1.0 when v_spread_ratio<=.5 then .9 when v_spread_ratio<=1 then .75 else .55 end;
  v_confidence:=round(least(.98,greatest(.15,v_sample_factor*v_recency_factor*v_spread_factor)),2);
  v_summary:=format('Cardfolio · %s verified exact sold comp%s · %s · active asks excluded from price',v_sold_count,case when v_sold_count=1 then '' else 's' end,v_method);
  v_changed:=v_prev is null or round(v_prev,2) is distinct from round(v_price,2);
  if v_changed then
    update public.canonical_cards set current_price=v_price,currency='USD',valuation_status='priced',valuation_method=v_method,valuation_confidence=v_confidence,valuation_sample_size=v_sold_count,valuation_low=v_low,valuation_high=v_high,valuation_source_summary=v_summary,valuation_observed_at=coalesce(v_latest,now()),market_updated_at=now(),research_status='ready',last_researched_at=now(),updated_at=now() where id=p_card_id;
  else
    update public.canonical_cards set valuation_status='priced',valuation_method=v_method,valuation_confidence=v_confidence,valuation_sample_size=v_sold_count,valuation_low=v_low,valuation_high=v_high,valuation_source_summary=v_summary,valuation_observed_at=coalesce(v_latest,valuation_observed_at,now()),research_status='ready',last_researched_at=now(),updated_at=now() where id=p_card_id;
  end if;
  insert into public.card_market_research_runs(canonical_card_id,status,sold_candidates,active_candidates,accepted_comps,computed_price,confidence,summary) values(p_card_id,case when v_changed then 'priced' else 'no_change' end,v_sold_count,v_active_count,v_sold_count,v_price,v_confidence,v_summary);
  return jsonb_build_object('status',case when v_changed then 'priced' else 'no_change' end,'sold_comps',v_sold_count,'active_context',v_active_count,'price',v_price,'low',v_low,'high',v_high,'confidence',v_confidence,'method',v_method,'changed',v_changed);
end;
$$;
revoke all on function private.reprice_card_from_observations(uuid) from public,anon,authenticated;
