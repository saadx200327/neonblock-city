create or replace function private.cardfolio_populate_evidence_outlook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_details jsonb := coalesce(new.metadata->'valuation_details','{}'::jsonb);
  v_p10 numeric;
  v_p25 numeric;
  v_p75 numeric;
  v_p90 numeric;
  v_fmv numeric := new.current_price;
  v_n integer := coalesce(new.valuation_sample_size,0);
  v_fmt text;
begin
  if new.valuation_status <> 'priced' or v_fmv is null or v_n <= 0 then
    new.analyst_bull := null;
    new.analyst_base := null;
    new.analyst_bear := null;
    new.analyst_updated_at := null;
    return new;
  end if;

  begin v_p10 := nullif(v_details->>'p10','')::numeric; exception when others then v_p10 := null; end;
  begin v_p25 := coalesce(new.valuation_low,nullif(v_details->>'p25','')::numeric); exception when others then v_p25 := new.valuation_low; end;
  begin v_p75 := coalesce(new.valuation_high,nullif(v_details->>'p75','')::numeric); exception when others then v_p75 := new.valuation_high; end;
  begin v_p90 := nullif(v_details->>'p90','')::numeric; exception when others then v_p90 := null; end;

  new.analyst_base := format(
    'Current fair value is $%s, anchored by %s verified exact sold comp%s. The middle 50%% of accepted sales is $%s–$%s.',
    to_char(v_fmv,'FM999999990.00'),
    v_n,
    case when v_n=1 then '' else 's' end,
    coalesce(to_char(v_p25,'FM999999990.00'),'—'),
    coalesce(to_char(v_p75,'FM999999990.00'),'—')
  );

  new.analyst_bull := case
    when v_p75 is not null then format(
      'Upside evidence is the upper part of the actual sold distribution: the 75th percentile is $%s%s. Sustained new exact sales above that band would support a higher reprice.',
      to_char(v_p75,'FM999999990.00'),
      case when v_p90 is not null then format(' and the 90th percentile is $%s',to_char(v_p90,'FM999999990.00')) else '' end
    )
    else 'Not enough verified exact sold evidence yet to define an upside case.'
  end;

  new.analyst_bear := case
    when v_p25 is not null then format(
      'Downside evidence is the lower part of the actual sold distribution: the 25th percentile is $%s%s. Sustained new exact sales below that band would support a lower reprice.',
      to_char(v_p25,'FM999999990.00'),
      case when v_p10 is not null then format(' and the 10th percentile is $%s',to_char(v_p10,'FM999999990.00')) else '' end
    )
    else 'Not enough verified exact sold evidence yet to define a downside case.'
  end;

  new.analyst_updated_at := now();
  return new;
end;
$function$;

revoke all on function private.cardfolio_populate_evidence_outlook() from public, anon, authenticated;

drop trigger if exists cardfolio_evidence_outlook_trigger on public.canonical_cards;
create trigger cardfolio_evidence_outlook_trigger
before insert or update of current_price,valuation_status,valuation_sample_size,valuation_low,valuation_high,metadata
on public.canonical_cards
for each row execute function private.cardfolio_populate_evidence_outlook();

-- Backfill existing priced canonical cards through the same deterministic trigger.
update public.canonical_cards
set updated_at = now()
where valuation_status='priced' and current_price is not null;
