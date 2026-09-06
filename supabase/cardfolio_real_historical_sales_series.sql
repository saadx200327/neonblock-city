-- Cardfolio real historical series. Applied to production 2026-09-06.
-- Creates weekly historical market points only from verified exact sold comps with real sold dates.

alter table public.canonical_price_history
  add column if not exists series_kind text not null default 'valuation' check (series_kind in ('valuation','sold_bucket')),
  add column if not exists period_start date;

create unique index if not exists canonical_price_history_series_period_uniq
  on public.canonical_price_history(canonical_card_id,series_kind,period_start);

create or replace function private.rebuild_card_history_from_sales(p_card_id uuid)
returns integer
language plpgsql security definer set search_path=public,private as $$
declare
  r record;v_count integer:=0;v_conf numeric;
begin
  if not exists(select 1 from public.canonical_cards where id=p_card_id) then raise exception 'canonical card not found'; end if;
  for r in
    select date_trunc('week',sold_at)::date as week_start,count(*)::int as n,
           round(percentile_cont(0.5) within group(order by price)::numeric,2) as median_price,
           min(price) as low_price,max(price) as high_price,max(sold_at) as latest_sale
    from public.card_market_observations
    where canonical_card_id=p_card_id and exact_match=true and source_kind='sold' and currency='USD' and price>0 and sold_at is not null
    group by date_trunc('week',sold_at)::date order by week_start
  loop
    v_conf:=case when r.n>=8 then .90 when r.n>=5 then .82 when r.n>=3 then .70 when r.n=2 then .56 else .40 end;
    insert into public.canonical_price_history(canonical_card_id,market_price,currency,low,high,sample_size,confidence,method,source_summary,observed_at,series_kind,period_start)
    values(p_card_id,r.median_price,'USD',r.low_price,r.high_price,r.n,v_conf,'weekly median of verified exact sold comps',format('Historical weekly market point from %s verified exact sold comp%s',r.n,case when r.n=1 then '' else 's' end),r.latest_sale,'sold_bucket',r.week_start)
    on conflict(canonical_card_id,series_kind,period_start) do update set
      market_price=excluded.market_price,low=excluded.low,high=excluded.high,sample_size=excluded.sample_size,confidence=excluded.confidence,method=excluded.method,source_summary=excluded.source_summary,observed_at=excluded.observed_at
    where (public.canonical_price_history.market_price,public.canonical_price_history.low,public.canonical_price_history.high,public.canonical_price_history.sample_size,public.canonical_price_history.observed_at)
          is distinct from
          (excluded.market_price,excluded.low,excluded.high,excluded.sample_size,excluded.observed_at);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

revoke all on function private.rebuild_card_history_from_sales(uuid) from public,anon,authenticated;
