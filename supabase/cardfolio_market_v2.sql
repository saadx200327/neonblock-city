-- Cardfolio market v2. Applied to production on 2026-09-06.
-- Adds exact-card variant families and auditable hourly research state.

alter table public.canonical_cards
  add column if not exists family_key text,
  add column if not exists variant_name text,
  add column if not exists subset text,
  add column if not exists card_type text,
  add column if not exists research_status text not null default 'queued' check (research_status in ('queued','researching','ready','insufficient_data','error')),
  add column if not exists last_researched_at timestamptz;

create index if not exists canonical_cards_family_key_idx on public.canonical_cards(family_key);
create index if not exists canonical_cards_research_queue_idx on public.canonical_cards(research_status, last_researched_at nulls first);

create table if not exists public.card_variant_catalog (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  variant_key text not null unique,
  canonical_card_id uuid references public.canonical_cards(id) on delete set null,
  variant_name text not null,
  parallel text,
  autograph boolean not null default false,
  relic boolean not null default false,
  serial_denominator integer,
  metadata jsonb not null default '{}'::jsonb,
  source_summary text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_variant_catalog_family_idx on public.card_variant_catalog(family_key, variant_name);

create table if not exists public.card_market_research_runs (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id uuid not null references public.canonical_cards(id) on delete cascade,
  status text not null check (status in ('started','priced','insufficient_data','no_change','error')),
  sold_candidates integer not null default 0,
  active_candidates integer not null default 0,
  accepted_comps integer not null default 0,
  computed_price numeric,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  summary text,
  researched_at timestamptz not null default now()
);
create index if not exists card_market_research_runs_card_time_idx on public.card_market_research_runs(canonical_card_id, researched_at desc);

create or replace function public.cardfolio_family_key(
  p_category text,p_subject text,p_year text,p_manufacturer text,p_brand text,p_set_name text,p_card_number text
) returns text language sql immutable set search_path=public as $$
  select concat_ws('|',
    lower(regexp_replace(trim(coalesce(p_category,'Other')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_subject,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_year,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_manufacturer,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_brand,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_set_name,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_card_number,'')), '\s+', ' ', 'g'))
  )
$$;

create or replace function public.resolve_canonical_card(p_identity jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
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
  v_variant_name text := nullif(left(trim(coalesce(p_identity->>'variant_name','')),160),'');
  v_card_type text := nullif(left(trim(coalesce(p_identity->>'card_type','')),80),'');
  v_team text := nullif(left(trim(coalesce(p_identity->>'team','')),100),'');
  v_league text := nullif(left(trim(coalesce(p_identity->>'league','')),80),'');
  v_serial text := nullif(left(trim(coalesce(p_identity->>'serial_number','')),40),'');
  v_grading_company text := nullif(left(trim(coalesce(p_identity->>'grading_company','')),40),'');
  v_grade text := nullif(left(trim(coalesce(p_identity->>'grade','')),20),'');
  v_language text := nullif(left(trim(coalesce(p_identity->>'language','')),40),'');
  v_edition text := nullif(left(trim(coalesce(p_identity->>'edition','')),80),'');
  v_key text; v_family text; v_id uuid; v_serial_denominator integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(v_subject) < 2 then raise exception 'subject is required'; end if;
  v_serial_denominator := nullif(regexp_replace(split_part(coalesce(v_serial,''),'/',2),'[^0-9]','','g'),'')::integer;
  v_key := public.cardfolio_identity_key(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_card_number,v_parallel,coalesce((p_identity->>'autograph')::boolean,false),coalesce((p_identity->>'relic')::boolean,false),v_serial,v_grading_company,v_grade,v_language,v_edition);
  v_family := public.cardfolio_family_key(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_card_number);
  if v_variant_name is null then
    v_variant_name := concat_ws(' · ', nullif(v_parallel,''), case when coalesce((p_identity->>'autograph')::boolean,false) then 'Autograph' end, case when coalesce((p_identity->>'relic')::boolean,false) then 'Relic' end, case when v_serial_denominator is not null then '/'||v_serial_denominator end, case when v_grading_company is not null then trim(v_grading_company||' '||coalesce(v_grade,'')) end);
    if nullif(trim(v_variant_name),'') is null then v_variant_name := 'Base / standard'; end if;
  end if;
  insert into public.canonical_cards(identity_key,family_key,category,subject,year,manufacturer,brand,set_name,subset,card_number,parallel,variant_name,card_type,team,league,rookie,autograph,relic,serial_denominator,grading_company,grade,language,edition,metadata,research_status)
  values(v_key,v_family,v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_subset,v_card_number,v_parallel,v_variant_name,v_card_type,v_team,v_league,coalesce((p_identity->>'rookie')::boolean,false),coalesce((p_identity->>'autograph')::boolean,false),coalesce((p_identity->>'relic')::boolean,false),v_serial_denominator,v_grading_company,v_grade,v_language,v_edition,jsonb_build_object('created_from_user_scan',true),'queued')
  on conflict(identity_key) do update set
    family_key=coalesce(public.canonical_cards.family_key,excluded.family_key),
    subset=coalesce(public.canonical_cards.subset,excluded.subset),
    variant_name=coalesce(public.canonical_cards.variant_name,excluded.variant_name),
    card_type=coalesce(public.canonical_cards.card_type,excluded.card_type),
    updated_at=now()
  returning id into v_id;
  insert into public.card_variant_catalog(family_key,variant_key,canonical_card_id,variant_name,parallel,autograph,relic,serial_denominator,metadata)
  values(v_family,v_key,v_id,v_variant_name,v_parallel,coalesce((p_identity->>'autograph')::boolean,false),coalesce((p_identity->>'relic')::boolean,false),v_serial_denominator,jsonb_build_object('created_from_user_scan',true))
  on conflict(variant_key) do update set canonical_card_id=excluded.canonical_card_id,updated_at=now();
  return v_id;
end $$;
revoke all on function public.resolve_canonical_card(jsonb) from public;
grant execute on function public.resolve_canonical_card(jsonb) to authenticated;

alter table public.card_variant_catalog enable row level security;
alter table public.card_market_research_runs enable row level security;
drop policy if exists card_variant_catalog_public_read on public.card_variant_catalog;
create policy card_variant_catalog_public_read on public.card_variant_catalog for select to anon,authenticated using(true);
drop policy if exists card_market_research_runs_public_read on public.card_market_research_runs;
create policy card_market_research_runs_public_read on public.card_market_research_runs for select to anon,authenticated using(true);
grant select on public.card_variant_catalog,public.card_market_research_runs to anon,authenticated;
revoke insert,update,delete on public.card_variant_catalog,public.card_market_research_runs from anon,authenticated;
