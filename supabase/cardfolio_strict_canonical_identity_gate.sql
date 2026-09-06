-- Cardfolio exact-identity hardening.
-- Shared canonical market assets must never be created from a subject/player name alone.

create or replace function private.resolve_canonical_card_internal(p_identity jsonb, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
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
  v_family text;
  v_key text;
  v_id uuid;
begin
  if p_user_id is null then raise exception 'authentication required'; end if;
  if length(v_subject) < 2 then raise exception 'subject is required'; end if;

  if v_year is null
     or v_card_number is null
     or (v_set_name is null and v_brand is null and v_manufacturer is null) then
    raise exception 'exact identity incomplete: year, card number, and set/product or brand/manufacturer are required';
  end if;

  if (v_grading_company is null) <> (v_grade is null) then
    raise exception 'exact identity incomplete: grading company and grade must be supplied together';
  end if;

  if v_card_type is null then
    v_card_type := case
      when v_auto and v_relic then 'autograph_relic'
      when v_auto then 'autograph'
      when v_relic then 'relic'
      when v_parallel is not null or v_variant_name is not null or v_serial is not null then 'parallel_or_variation'
      else 'base'
    end;
  end if;

  v_family := public.cardfolio_family_key_v2(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_language,v_edition);
  v_key := public.cardfolio_identity_key_v2(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_parallel,v_variant_name,v_card_type,v_auto,v_relic,v_serial,v_grading_company,v_grade,v_language,v_edition);

  insert into public.canonical_cards(
    identity_key,family_key,category,subject,year,manufacturer,brand,set_name,subset,card_number,
    parallel,variant_name,card_type,team,league,rookie,autograph,relic,serial_denominator,
    grading_company,grade,language,edition,metadata,research_status
  ) values (
    v_key,v_family,v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,
    v_parallel,v_variant_name,v_card_type,v_team,v_league,coalesce((p_identity->>'rookie')::boolean,false),v_auto,v_relic,
    nullif(regexp_replace(split_part(coalesce(v_serial,''),'/',2),'[^0-9]','','g'),'')::integer,
    v_grading_company,v_grade,v_language,v_edition,
    jsonb_build_object('created_from_user_scan',true),
    'queued'
  )
  on conflict(identity_key) do update set
    family_key=excluded.family_key,
    subset=coalesce(public.canonical_cards.subset,excluded.subset),
    variant_name=coalesce(public.canonical_cards.variant_name,excluded.variant_name),
    card_type=coalesce(public.canonical_cards.card_type,excluded.card_type),
    team=coalesce(public.canonical_cards.team,excluded.team),
    league=coalesce(public.canonical_cards.league,excluded.league),
    updated_at=now()
  returning id into v_id;

  -- card_variant_catalog is checklist/evidence-backed. A user upload alone is not
  -- sufficient evidence to assert a variant exists in the shared catalog.
  return v_id;
end;
$function$;

revoke all on function private.resolve_canonical_card_internal(jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_canonical_card(jsonb) from public, anon;
grant execute on function public.resolve_canonical_card(jsonb) to authenticated;
