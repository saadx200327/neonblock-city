-- Cardfolio shared-card market model.
-- Applied to Supabase production on 2026-09-06. Browser clients may read canonical
-- market data, but only authenticated users may resolve an identity; market prices
-- and observations remain server/automation writable only.

create table if not exists public.canonical_cards (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  category text not null default 'Other',
  subject text not null,
  year text,
  manufacturer text,
  brand text,
  set_name text,
  card_number text,
  parallel text,
  team text,
  league text,
  rookie boolean not null default false,
  autograph boolean not null default false,
  relic boolean not null default false,
  serial_denominator integer,
  grading_company text,
  grade text,
  language text,
  edition text,
  metadata jsonb not null default '{}'::jsonb,
  current_price numeric,
  currency text not null default 'USD',
  valuation_status text not null default 'pending_price' check (valuation_status in ('pending_price','priced','insufficient_data','stale','error')),
  valuation_method text,
  valuation_confidence numeric check (valuation_confidence is null or (valuation_confidence between 0 and 1)),
  valuation_sample_size integer not null default 0 check (valuation_sample_size >= 0),
  valuation_low numeric,
  valuation_high numeric,
  valuation_source_summary text,
  valuation_observed_at timestamptz,
  market_updated_at timestamptz,
  analyst_bull text,
  analyst_base text,
  analyst_bear text,
  analyst_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_market_observations (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id uuid not null references public.canonical_cards(id) on delete cascade,
  marketplace text not null,
  source_kind text not null check (source_kind in ('sold','active','auction','catalog','indexed','manual')),
  title text,
  price numeric not null check (price >= 0),
  currency text not null default 'USD',
  condition text,
  external_id text,
  provenance_url text,
  sold_at timestamptz,
  observed_at timestamptz not null default now(),
  exact_match boolean not null default false,
  match_score numeric check (match_score is null or (match_score between 0 and 1)),
  raw_reference jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.canonical_price_history (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id uuid not null references public.canonical_cards(id) on delete cascade,
  market_price numeric not null check (market_price >= 0),
  currency text not null default 'USD',
  low numeric,
  high numeric,
  sample_size integer not null default 0 check (sample_size >= 0),
  confidence numeric check (confidence is null or (confidence between 0 and 1)),
  method text,
  source_summary text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.card_holdings
  add column if not exists canonical_card_id uuid references public.canonical_cards(id) on delete set null,
  add column if not exists valuation_status text not null default 'pending_price',
  add column if not exists display_name text;

create index if not exists card_holdings_canonical_card_idx on public.card_holdings(canonical_card_id);
create index if not exists card_market_observations_card_time_idx on public.card_market_observations(canonical_card_id, observed_at desc);
create index if not exists canonical_price_history_card_time_idx on public.canonical_price_history(canonical_card_id, observed_at asc);

create or replace function public.cardfolio_identity_key(
  p_category text,p_subject text,p_year text,p_manufacturer text,p_brand text,p_set_name text,
  p_card_number text,p_parallel text,p_autograph boolean,p_relic boolean,p_serial_number text,
  p_grading_company text,p_grade text,p_language text default null,p_edition text default null
) returns text language sql immutable set search_path=public as $$
  select concat_ws('|',
    lower(regexp_replace(trim(coalesce(p_category,'Other')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_subject,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_year,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_manufacturer,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_brand,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_set_name,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_card_number,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_parallel,'')), '\s+', ' ', 'g')),
    case when coalesce(p_autograph,false) then 'auto' else 'noauto' end,
    case when coalesce(p_relic,false) then 'relic' else 'norelic' end,
    lower(coalesce(nullif(regexp_replace(split_part(coalesce(p_serial_number,''),'/',2),'[^0-9]','','g'),''),'unnum')),
    lower(regexp_replace(trim(coalesce(p_grading_company,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_grade,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_language,'')), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(coalesce(p_edition,'')), '\s+', ' ', 'g'))
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
  v_card_number text := nullif(left(trim(coalesce(p_identity->>'card_number','')),50),'');
  v_parallel text := nullif(left(trim(coalesce(p_identity->>'parallel','')),120),'');
  v_team text := nullif(left(trim(coalesce(p_identity->>'team','')),100),'');
  v_league text := nullif(left(trim(coalesce(p_identity->>'league','')),80),'');
  v_serial text := nullif(left(trim(coalesce(p_identity->>'serial_number','')),40),'');
  v_grading_company text := nullif(left(trim(coalesce(p_identity->>'grading_company','')),40),'');
  v_grade text := nullif(left(trim(coalesce(p_identity->>'grade','')),20),'');
  v_language text := nullif(left(trim(coalesce(p_identity->>'language','')),40),'');
  v_edition text := nullif(left(trim(coalesce(p_identity->>'edition','')),80),'');
  v_key text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(v_subject) < 2 then raise exception 'subject is required'; end if;
  v_key := public.cardfolio_identity_key(v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_card_number,v_parallel,coalesce((p_identity->>'autograph')::boolean,false),coalesce((p_identity->>'relic')::boolean,false),v_serial,v_grading_company,v_grade,v_language,v_edition);
  insert into public.canonical_cards(identity_key,category,subject,year,manufacturer,brand,set_name,card_number,parallel,team,league,rookie,autograph,relic,serial_denominator,grading_company,grade,language,edition,metadata)
  values(v_key,v_category,v_subject,v_year,v_manufacturer,v_brand,v_set_name,v_card_number,v_parallel,v_team,v_league,coalesce((p_identity->>'rookie')::boolean,false),coalesce((p_identity->>'autograph')::boolean,false),coalesce((p_identity->>'relic')::boolean,false),nullif(regexp_replace(split_part(coalesce(v_serial,''),'/',2),'[^0-9]','','g'),'')::integer,v_grading_company,v_grade,v_language,v_edition,jsonb_build_object('created_from_user_scan',true))
  on conflict(identity_key) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.resolve_canonical_card(jsonb) from public;
grant execute on function public.resolve_canonical_card(jsonb) to authenticated;

create or replace function public.cardfolio_propagate_canonical_price()
returns trigger language plpgsql security definer set search_path=public as $$
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

drop trigger if exists canonical_price_propagation on public.canonical_cards;
create trigger canonical_price_propagation after update of current_price,valuation_status on public.canonical_cards for each row execute function public.cardfolio_propagate_canonical_price();

alter table public.canonical_cards enable row level security;
alter table public.card_market_observations enable row level security;
alter table public.canonical_price_history enable row level security;

drop policy if exists canonical_cards_public_read on public.canonical_cards;
create policy canonical_cards_public_read on public.canonical_cards for select to anon,authenticated using(true);
drop policy if exists card_market_observations_public_read on public.card_market_observations;
create policy card_market_observations_public_read on public.card_market_observations for select to anon,authenticated using(true);
drop policy if exists canonical_price_history_public_read on public.canonical_price_history;
create policy canonical_price_history_public_read on public.canonical_price_history for select to anon,authenticated using(true);

grant select on public.canonical_cards,public.card_market_observations,public.canonical_price_history to anon,authenticated;
revoke insert,update,delete on public.canonical_cards,public.card_market_observations,public.canonical_price_history from anon,authenticated;
