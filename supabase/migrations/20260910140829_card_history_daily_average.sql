create or replace function private.rebuild_card_history_from_sales(p_card_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  r record;
  v_count integer := 0;
  v_conf numeric;
begin
  if not exists(select 1 from public.canonical_cards where id = p_card_id) then
    raise exception 'canonical card not found';
  end if;

  delete from public.canonical_price_history
  where canonical_card_id = p_card_id
    and series_kind = 'sold_bucket';

  for r in
    select sold_at::date as sale_day,
           count(*)::int as n,
           round(avg(price)::numeric, 2) as daily_average_price,
           min(price) as low_price,
           max(price) as high_price,
           max(sold_at) as latest_sale
    from public.card_market_observations
    where canonical_card_id = p_card_id
      and exact_match = true
      and source_kind = 'sold'
      and currency = 'USD'
      and price > 0
      and sold_at is not null
    group by sold_at::date
    order by sale_day
  loop
    v_conf := case when r.n >= 8 then .90 when r.n >= 5 then .82 when r.n >= 3 then .70 when r.n = 2 then .56 else .40 end;
    insert into public.canonical_price_history(
      canonical_card_id, market_price, currency, low, high, sample_size,
      confidence, method, source_summary, observed_at, series_kind, period_start
    ) values (
      p_card_id, r.daily_average_price, 'USD', r.low_price, r.high_price, r.n,
      v_conf, 'daily arithmetic mean of verified exact sold comps',
      format('Historical daily chart point from %s verified exact sold comp%s', r.n, case when r.n = 1 then '' else 's' end),
      r.latest_sale, 'sold_bucket', r.sale_day
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$function$;

revoke all on function private.rebuild_card_history_from_sales(uuid) from public, anon, authenticated;
grant execute on function private.rebuild_card_history_from_sales(uuid) to service_role;
