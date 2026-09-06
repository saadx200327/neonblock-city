-- Cardfolio atomic valuation persistence
-- Keeps a holding's current valuation and its portfolio history snapshot in one transaction.

create or replace function public.set_holding_valuation(
  p_holding_id uuid,
  p_market_value numeric,
  p_source text,
  p_observed_at timestamptz default now(),
  p_provenance_url text default null,
  p_raw_reference jsonb default '{}'::jsonb
)
returns public.card_holdings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_holding public.card_holdings;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_market_value is null or p_market_value < 0 then
    raise exception 'market value must be non-negative' using errcode = '22023';
  end if;
  if nullif(btrim(p_source), '') is null then
    raise exception 'valuation source is required' using errcode = '22023';
  end if;

  update public.card_holdings
     set market_value = p_market_value,
         valuation_source = btrim(p_source),
         valuation_observed_at = coalesce(p_observed_at, now()),
         updated_at = now()
   where id = p_holding_id
     and user_id = auth.uid()
  returning * into v_holding;

  if v_holding.id is null then
    raise exception 'holding not found' using errcode = 'P0002';
  end if;

  insert into public.price_snapshots (
    holding_id, user_id, market_value, quantity, currency, source,
    observed_at, provenance_url, raw_reference
  ) values (
    v_holding.id, auth.uid(), p_market_value, v_holding.quantity, 'USD',
    btrim(p_source), coalesce(p_observed_at, now()), p_provenance_url,
    coalesce(p_raw_reference, '{}'::jsonb)
  );

  return v_holding;
end;
$$;

revoke all on function public.set_holding_valuation(uuid, numeric, text, timestamptz, text, jsonb) from public;
revoke all on function public.set_holding_valuation(uuid, numeric, text, timestamptz, text, jsonb) from anon;
grant execute on function public.set_holding_valuation(uuid, numeric, text, timestamptz, text, jsonb) to authenticated;

comment on function public.set_holding_valuation(uuid, numeric, text, timestamptz, text, jsonb)
is 'Atomically updates an authenticated user-owned holding valuation and appends the matching portfolio price snapshot.';
