create or replace function private.reprice_card_from_observations(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private'
as $function$
declare
  v_prev numeric;
  v_active_count integer := 0;
  v_sold_30 integer := 0;
  v_sold_90 integer := 0;
  v_sold_count integer := 0;
  v_window interval := interval '365 days';
  v_window_label text := '365d';
  v_weighted_median numeric;
  v_weighted_trimmed_mean numeric;
  v_p10 numeric;
  v_p25 numeric;
  v_p75 numeric;
  v_p90 numeric;
  v_latest timestamptz;
  v_price numeric;
  v_quick_sale numeric;
  v_suggested_list numeric;
  v_method text;
  v_confidence numeric;
  v_sample_factor numeric;
  v_recency_factor numeric;
  v_spread_factor numeric;
  v_iqr_ratio numeric;
  v_crosscheck_gap numeric;
  v_summary text;
  v_changed boolean := false;
begin
  select current_price into v_prev
  from public.canonical_cards
  where id = p_card_id
  for update;
  if not found then raise exception 'canonical card not found'; end if;

  select count(*)::int into v_active_count
  from public.card_market_observations
  where canonical_card_id = p_card_id
    and exact_match = true
    and source_kind = 'active'
    and currency = 'USD'
    and price > 0;

  select
    count(*) filter (where coalesce(sold_at, observed_at) >= now() - interval '30 days')::int,
    count(*) filter (where coalesce(sold_at, observed_at) >= now() - interval '90 days')::int
  into v_sold_30, v_sold_90
  from public.card_market_observations
  where canonical_card_id = p_card_id
    and exact_match = true
    and source_kind = 'sold'
    and currency = 'USD'
    and price > 0
    and coalesce(sold_at, observed_at) >= now() - interval '365 days';

  if v_sold_30 >= 3 then
    v_window := interval '30 days';
    v_window_label := '30d';
  elsif v_sold_90 >= 3 then
    v_window := interval '90 days';
    v_window_label := '90d';
  end if;

  with eligible as (
    select
      price,
      coalesce(sold_at, observed_at) as sale_time,
      exp(-greatest(0::numeric, extract(epoch from (now() - coalesce(sold_at, observed_at)))::numeric / 86400) / 45)
        * greatest(.50::numeric, least(1::numeric, coalesce(match_score, 1::numeric))) as weight
    from public.card_market_observations
    where canonical_card_id = p_card_id
      and exact_match = true
      and source_kind = 'sold'
      and currency = 'USD'
      and price > 0
      and coalesce(sold_at, observed_at) >= now() - v_window
  ), stats as (
    select
      count(*)::int as n,
      percentile_cont(.10) within group (order by price)::numeric as p10,
      percentile_cont(.25) within group (order by price)::numeric as p25,
      percentile_cont(.75) within group (order by price)::numeric as p75,
      percentile_cont(.90) within group (order by price)::numeric as p90,
      max(sale_time) as latest
    from eligible
  ), ranked as (
    select
      price,
      weight,
      sum(weight) over (order by price, sale_time rows between unbounded preceding and current row) as cumulative_weight,
      sum(weight) over () as total_weight
    from eligible
  ), weighted_median as (
    select price
    from ranked
    where cumulative_weight >= total_weight / 2
    order by cumulative_weight
    limit 1
  )
  select s.n, s.p10, s.p25, s.p75, s.p90, s.latest, wm.price
  into v_sold_count, v_p10, v_p25, v_p75, v_p90, v_latest, v_weighted_median
  from stats s
  left join weighted_median wm on true;

  if coalesce(v_sold_count, 0) = 0 then
    update public.canonical_cards
      set research_status = 'insufficient_data',
          last_researched_at = now(),
          valuation_status = case when current_price is null then 'insufficient_data' else 'stale' end,
          valuation_sample_size = 0,
          valuation_confidence = null,
          valuation_source_summary = 'No verified exact sold comps in the last 365 days; active listings are context only.',
          updated_at = now()
    where id = p_card_id;

    insert into public.card_market_research_runs(canonical_card_id,status,sold_candidates,active_candidates,accepted_comps,computed_price,confidence,summary)
    values(p_card_id,'insufficient_data',0,v_active_count,0,null,null,'No verified exact sold comps in the last 365 days. Active asking prices were not substituted for sales.');

    return jsonb_build_object('status','insufficient_data','sold_comps',0,'active_context',v_active_count,'price',v_prev,'changed',false);
  end if;

  with eligible as (
    select
      price,
      exp(-greatest(0::numeric, extract(epoch from (now() - coalesce(sold_at, observed_at)))::numeric / 86400) / 45)
        * greatest(.50::numeric, least(1::numeric, coalesce(match_score, 1::numeric))) as weight
    from public.card_market_observations
    where canonical_card_id = p_card_id
      and exact_match = true
      and source_kind = 'sold'
      and currency = 'USD'
      and price > 0
      and coalesce(sold_at, observed_at) >= now() - v_window
      and price between v_p10 and v_p90
  )
  select round(sum(price * weight) / nullif(sum(weight), 0), 2)
  into v_weighted_trimmed_mean
  from eligible;

  v_price := round(v_weighted_median, 2);
  v_quick_sale := round(v_p25, 2);
  v_suggested_list := round(v_p75, 2);
  v_method := format('recency-weighted median of verified exact sold comps (%s window)', v_window_label);

  v_sample_factor := case
    when v_sold_count >= 20 then .98
    when v_sold_count >= 10 then .95
    when v_sold_count >= 8 then .90
    when v_sold_count >= 5 then .82
    when v_sold_count >= 3 then .70
    when v_sold_count = 2 then .55
    else .40
  end;
  v_recency_factor := case
    when v_latest >= now() - interval '7 days' then 1.00
    when v_latest >= now() - interval '30 days' then .95
    when v_latest >= now() - interval '90 days' then .85
    when v_latest >= now() - interval '180 days' then .72
    else .58
  end;
  if coalesce(v_weighted_median, 0) > 0 then
    v_iqr_ratio := (coalesce(v_p75, v_weighted_median) - coalesce(v_p25, v_weighted_median)) / v_weighted_median;
    v_crosscheck_gap := abs(coalesce(v_weighted_trimmed_mean, v_weighted_median) - v_weighted_median) / v_weighted_median;
  else
    v_iqr_ratio := 2;
    v_crosscheck_gap := 2;
  end if;
  v_spread_factor := case
    when v_iqr_ratio <= .20 then 1.00
    when v_iqr_ratio <= .35 then .92
    when v_iqr_ratio <= .60 then .80
    else .65
  end;
  if v_crosscheck_gap > .20 then v_spread_factor := v_spread_factor * .75; end if;
  v_confidence := round(least(.98, greatest(.15, v_sample_factor * v_recency_factor * v_spread_factor)), 2);

  v_summary := format(
    'Cardfolio · %s verified exact sold comp%s · %s · weighted trimmed mean cross-check $%s · active asks excluded from FMV',
    v_sold_count,
    case when v_sold_count = 1 then '' else 's' end,
    v_method,
    coalesce(to_char(v_weighted_trimmed_mean, 'FM999999990.00'), 'n/a')
  );
  v_changed := v_prev is null or round(v_prev, 2) is distinct from round(v_price, 2);

  update public.canonical_cards
    set current_price = v_price,
        currency = 'USD',
        valuation_status = 'priced',
        valuation_method = v_method,
        valuation_confidence = v_confidence,
        valuation_sample_size = v_sold_count,
        valuation_low = v_p25,
        valuation_high = v_p75,
        valuation_source_summary = v_summary,
        valuation_observed_at = coalesce(v_latest, now()),
        market_updated_at = now(),
        research_status = 'ready',
        last_researched_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'valuation_details', jsonb_build_object(
            'window', v_window_label,
            'weighted_median', v_weighted_median,
            'weighted_trimmed_mean', v_weighted_trimmed_mean,
            'p10', v_p10,
            'p25', v_p25,
            'p75', v_p75,
            'p90', v_p90,
            'quick_sale_estimate', v_quick_sale,
            'suggested_listing_reference', v_suggested_list,
            'active_asks_excluded', true
          )
        ),
        updated_at = now()
  where id = p_card_id;

  insert into public.card_market_research_runs(canonical_card_id,status,sold_candidates,active_candidates,accepted_comps,computed_price,confidence,summary)
  values(p_card_id,case when v_changed then 'priced' else 'no_change' end,v_sold_count,v_active_count,v_sold_count,v_price,v_confidence,v_summary);

  return jsonb_build_object(
    'status', case when v_changed then 'priced' else 'no_change' end,
    'sold_comps', v_sold_count,
    'active_context', v_active_count,
    'price', v_price,
    'low', v_p25,
    'high', v_p75,
    'quick_sale', v_quick_sale,
    'listing_reference', v_suggested_list,
    'weighted_trimmed_mean', v_weighted_trimmed_mean,
    'confidence', v_confidence,
    'method', v_method,
    'window', v_window_label,
    'changed', v_changed
  );
end;
$function$;

revoke all on function private.reprice_card_from_observations(uuid) from public, anon, authenticated;
grant execute on function private.reprice_card_from_observations(uuid) to service_role;