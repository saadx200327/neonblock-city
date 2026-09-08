-- Cardfolio market freshness + research provenance hardening.
-- Adds explicit freshness/source fields without changing canonical pricing authority.

alter table public.canonical_cards
  add column if not exists last_market_check timestamptz,
  add column if not exists last_successful_valuation timestamptz,
  add column if not exists latest_comp_date timestamptz;

alter table public.card_market_research_runs
  add column if not exists source_count integer not null default 0,
  add column if not exists sources_checked text[] not null default '{}'::text[],
  add column if not exists methodology_version text not null default 'cardfolio-sold-v4';

alter table public.card_market_research_runs
  drop constraint if exists card_market_research_runs_source_count_check;
alter table public.card_market_research_runs
  add constraint card_market_research_runs_source_count_check check (source_count >= 0);

update public.canonical_cards c
set last_market_check = coalesce(c.last_market_check,c.last_researched_at,c.market_updated_at,c.updated_at),
    last_successful_valuation = case when c.current_price is not null then coalesce(c.last_successful_valuation,c.valuation_observed_at,c.market_updated_at) else c.last_successful_valuation end,
    latest_comp_date = coalesce(c.latest_comp_date,(
      select max(coalesce(o.sold_at,o.observed_at))
      from public.card_market_observations o
      where o.canonical_card_id=c.id
        and o.source_kind='sold'
        and o.exact_match=true
        and upper(coalesce(o.currency,'USD'))='USD'
        and o.price>0
    ));

create or replace function private.cardfolio_sync_research_freshness()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  update public.canonical_cards
  set last_market_check = greatest(coalesce(last_market_check,'epoch'::timestamptz),new.researched_at),
      last_successful_valuation = case
        when new.computed_price is not null then greatest(coalesce(last_successful_valuation,'epoch'::timestamptz),new.researched_at)
        else last_successful_valuation
      end,
      updated_at = greatest(coalesce(updated_at,new.researched_at),new.researched_at)
  where id=new.canonical_card_id;
  return new;
end $$;

revoke all on function private.cardfolio_sync_research_freshness() from public,anon,authenticated;

drop trigger if exists cardfolio_research_freshness on public.card_market_research_runs;
create trigger cardfolio_research_freshness
after insert or update of researched_at,computed_price on public.card_market_research_runs
for each row execute function private.cardfolio_sync_research_freshness();

create or replace function private.cardfolio_sync_latest_comp_date()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_when timestamptz;
begin
  if new.source_kind='sold' and new.exact_match=true and upper(coalesce(new.currency,'USD'))='USD' and new.price>0 then
    v_when:=coalesce(new.sold_at,new.observed_at,now());
    update public.canonical_cards
    set latest_comp_date=greatest(coalesce(latest_comp_date,'epoch'::timestamptz),v_when),updated_at=now()
    where id=new.canonical_card_id;
  end if;
  return new;
end $$;

revoke all on function private.cardfolio_sync_latest_comp_date() from public,anon,authenticated;

drop trigger if exists cardfolio_latest_comp_date on public.card_market_observations;
create trigger cardfolio_latest_comp_date
after insert or update of sold_at,observed_at,source_kind,exact_match,price,currency on public.card_market_observations
for each row execute function private.cardfolio_sync_latest_comp_date();

create index if not exists idx_card_market_research_runs_card_time
  on public.card_market_research_runs(canonical_card_id,researched_at desc);
