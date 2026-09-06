-- Cardfolio market v2 hardening and exact-identity follow-up.
-- Mirrors production migrations applied 2026-09-06 after cardfolio_market_v2.sql.

alter table public.card_holdings
  add column if not exists subset text,
  add column if not exists variant_name text,
  add column if not exists card_type text,
  add column if not exists language text,
  add column if not exists edition text;

create index if not exists card_variant_catalog_canonical_card_idx
  on public.card_variant_catalog(canonical_card_id);
create index if not exists card_holdings_canonical_status_idx
  on public.card_holdings(canonical_card_id, valuation_status);

create or replace function public.cardfolio_family_key_v2(
  p_category text,p_subject text,p_year text,p_manufacturer text,p_brand text,p_set_name text,
  p_subset text,p_card_number text,p_language text default null,p_edition text default null
) returns text
language sql immutable set search_path=public as $$
  select concat_ws('|',
    lower(regexp_replace(trim(coalesce(p_category,'Other')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_subject,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_year,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_manufacturer,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_brand,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_set_name,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_subset,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_card_number,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_language,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_edition,'')), '\s+', ' ', 'g'))
  )
$$;

create or replace function public.cardfolio_identity_key_v2(
  p_category text,p_subject text,p_year text,p_manufacturer text,p_brand text,p_set_name text,
  p_subset text,p_card_number text,p_parallel text,p_variant_name text,p_card_type text,
  p_autograph boolean,p_relic boolean,p_serial_number text,p_grading_company text,p_grade text,
  p_language text default null,p_edition text default null
) returns text
language sql immutable set search_path=public as $$
  select concat_ws('|',
    public.cardfolio_family_key_v2(p_category,p_subject,p_year,p_manufacturer,p_brand,p_set_name,p_subset,p_card_number,p_language,p_edition),
    lower(regexp_replace(trim(coalesce(p_parallel,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_variant_name,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_card_type,'')), '\s+', ' ', 'g')),
    case when coalesce(p_autograph,false) then 'auto' else 'noauto' end,
    case when coalesce(p_relic,false) then 'relic' else 'norelic' end,
    lower(coalesce(nullif(regexp_replace(split_part(coalesce(p_serial_number,''),'/',2),'[^0-9]','','g'),''),'unnum')),
    lower(regexp_replace(trim(coalesce(p_grading_company,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_grade,'')), '\s+', ' ', 'g'))
  )
$$;

create or replace function private.resolve_canonical_card_internal(p_identity jsonb,p_user_id uuid)
returns uuid
language plpgsql security definer set search_path=public,private as $$
declare
  v_subject text := left(trim(coalesce(p_identity->>'subject','')),120);
  v_category text := left(trim(coalesce(p_identity->>'category','Other')),80);
  v_year text := nullif(left(trim(coalesce(p_identity->>'year','')),20),'');
  v_manufacturer text := nullif(left(trim(coalesce(p_identity->>'manufacturer','')),80),'');
  v_brand text := nullif(left(trim(coalesce(p_identity->>'brand','')),100),'');
  v_set_name text := nullif(left(trim(coalesce(p_identity->>'set_name','')),140),'');
  v_subset text := nullif(left(trim(coalesce(p_identity->>'subset','')),120),'');
  v_card_number text := nullif(left(trim(coalesce(p_identity->>'card_number','')),50),'');
  v_parallel text := nullif(left(trim(coalesce(p_identity->>'parallel','')),120),'');
  v_variant_name text := nullif(left(trim(coalesce(p_identity->>'variant_name',p_identity->>'variation','')),120),'');
  v_team text := nullif(left(trim(coalesce(p_identity->>'team','')),100),'');
  v_league text := nullif(left(trim(coalesce(p_identity->>'league','')),80),'');
  v_serial text := nullif(left(trim(coalesce(p_identity->>'serial_number','')),40),'');
  v_grading_company text := nullif(left(trim(coalesce(p_identity->>'grading_company','')),40),'');
  v_grade text := nullif(left(trim(coalesce(p_identity->>'grade','')),20),'');
  v_language text := nullif(left(trim(coalesce(p_identity->>'language','')),40),'');
  v_edition text := nullif(left(trim(coalesce(p_identity->>'edition','')),80),'');
  v_auto boolean := coalesce((p_identity->>'autograph')::boolean,false);
  v_relic boolean := coalesce((p_identity->>'relic')::boolean,false);
  v_card_type text := nullif(left(trim(coalesce(p_identity->>'card_type','')),60),'');
  v_family text;v_key text;v_id uuid;
begin
  if p_user_id is null then raise exception 'authentication required'; end if;
  if length(v_subject)<2 then raise exception 'subject is required'; end if;
  if v_card_type is null then
    v_card_type := case when v_auto and v_relic then 'autograph_relic' when v_auto then 'autograph' when v_relic then 'relic' when v_parallel is not null or v_variant_name is not null or v_serial is not null then 'parallel_or_variation' else 'base' end;
  end if;
  v_family := public.cardfolio_family_key_v2(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_language,v_edition);
  v_key := public.cardfolio_identity_key_v2(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_parallel,v_variant_name,v_card_type,v_auto,v_relic,v_serial,v_grading_company,v_grade,v_language,v_edition);
  insert into public.canonical_cards(identity_key,family_key,category,subject,year,manufacturer,brand,set_name,subset,card_number,parallel,variant_name,card_type,team,league,rookie,autograph,relic,serial_denominator,grading_company,grade,language,edition,metadata,research_status)
  values(v_key,v_family,v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_parallel,v_variant_name,v_card_type,v_team,v_league,coalesce((p_identity->>'rookie')::boolean,false),v_auto,v_relic,nullif(regexp_replace(split_part(coalesce(v_serial,''),'/',2),'[^0-9]','','g'),'')::integer,v_grading_company,v_grade,v_language,v_edition,jsonb_build_object('created_from_user_scan',true),'queued')
  on conflict(identity_key) do update set family_key=excluded.family_key,subset=coalesce(public.canonical_cards.subset,excluded.subset),variant_name=coalesce(public.canonical_cards.variant_name,excluded.variant_name),card_type=coalesce(public.canonical_cards.card_type,excluded.card_type),team=coalesce(public.canonical_cards.team,excluded.team),league=coalesce(public.canonical_cards.league,excluded.league),updated_at=now()
  returning id into v_id;
  insert into public.card_variant_catalog(family_key,variant_key,canonical_card_id,variant_name,parallel,autograph,relic,serial_denominator,metadata,source_summary,observed_at,updated_at)
  values(v_family,v_key,v_id,coalesce(v_variant_name,v_parallel,v_card_type,'Base'),v_parallel,v_auto,v_relic,nullif(regexp_replace(split_part(coalesce(v_serial,''),'/',2),'[^0-9]','','g'),'')::integer,jsonb_build_object('card_type',v_card_type,'grading_company',v_grading_company,'grade',v_grade,'language',v_language,'edition',v_edition),'Observed from a confirmed user holding',now(),now())
  on conflict(variant_key) do update set canonical_card_id=excluded.canonical_card_id,variant_name=excluded.variant_name,parallel=excluded.parallel,autograph=excluded.autograph,relic=excluded.relic,serial_denominator=excluded.serial_denominator,updated_at=now();
  return v_id;
end $$;
revoke all on function private.resolve_canonical_card_internal(jsonb,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.resolve_canonical_card_internal(jsonb,uuid) to authenticated;

create or replace function public.resolve_canonical_card(p_identity jsonb)
returns uuid language sql security invoker set search_path=public,private as $$
  select private.resolve_canonical_card_internal(p_identity,auth.uid())
$$;
revoke all on function public.resolve_canonical_card(jsonb) from public,anon;
grant execute on function public.resolve_canonical_card(jsonb) to authenticated;

create or replace function private.cardfolio_propagate_canonical_price()
returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  if new.current_price is distinct from old.current_price and new.current_price is not null then
    insert into public.canonical_price_history(canonical_card_id,market_price,currency,low,high,sample_size,confidence,method,source_summary,observed_at)
    values(new.id,new.current_price,new.currency,new.valuation_low,new.valuation_high,new.valuation_sample_size,new.valuation_confidence,new.valuation_method,new.valuation_source_summary,coalesce(new.valuation_observed_at,now()));
    update public.card_holdings set market_value=new.current_price,valuation_source=coalesce(new.valuation_source_summary,'Cardfolio canonical market'),valuation_observed_at=coalesce(new.valuation_observed_at,now()),valuation_status='priced',updated_at=now() where canonical_card_id=new.id;
    insert into public.price_snapshots(id,holding_id,user_id,market_value,quantity,currency,source,observed_at,raw_reference)
      select gen_random_uuid(),h.id,h.user_id,new.current_price,h.quantity,new.currency,coalesce(new.valuation_source_summary,'Cardfolio canonical market'),coalesce(new.valuation_observed_at,now()),jsonb_build_object('canonical_card_id',new.id,'method',new.valuation_method,'sample_size',new.valuation_sample_size,'confidence',new.valuation_confidence)
      from public.card_holdings h where h.canonical_card_id=new.id;
  elsif new.current_price is null and new.valuation_status is distinct from old.valuation_status then
    update public.card_holdings set valuation_status=new.valuation_status,updated_at=now() where canonical_card_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.cardfolio_propagate_canonical_price() from public,anon,authenticated;

drop trigger if exists canonical_price_propagation on public.canonical_cards;
create trigger canonical_price_propagation after update of current_price,valuation_status on public.canonical_cards for each row execute function private.cardfolio_propagate_canonical_price();
drop function if exists public.cardfolio_propagate_canonical_price();
