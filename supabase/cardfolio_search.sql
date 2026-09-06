-- Cardfolio portfolio/watchlist search migration.
-- Mirrors the migration already applied to the dedicated Cardfolio Supabase project.

alter table public.card_holdings
add column if not exists fts tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(subject,'')), 'A') ||
  setweight(to_tsvector('simple', coalesce(year,'') || ' ' || coalesce(manufacturer,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(set_name,'') || ' ' || coalesce(card_number,'') || ' ' || coalesce(parallel,'') || ' ' || coalesce(team,'') || ' ' || coalesce(league,'') || ' ' || coalesce(grading_company,'') || ' ' || coalesce(grade,'')), 'B')
) stored;
create index if not exists card_holdings_fts_idx on public.card_holdings using gin (fts);

alter table public.watchlist_items
add column if not exists fts tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(subject,'')), 'A') ||
  setweight(to_tsvector('simple', coalesce(year,'') || ' ' || coalesce(manufacturer,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(set_name,'') || ' ' || coalesce(card_number,'')), 'B')
) stored;
create index if not exists watchlist_items_fts_idx on public.watchlist_items using gin (fts);

create or replace function public.search_my_holdings(search_text text, max_rows integer default 50)
returns setof public.card_holdings
language sql
stable
security invoker
set search_path = public
as $$
  select h.*
  from public.card_holdings h
  where h.user_id = (select auth.uid())
    and (nullif(trim(search_text),'') is null or h.fts @@ websearch_to_tsquery('simple', search_text))
  order by
    case when nullif(trim(search_text),'') is null then 0 else ts_rank_cd(h.fts, websearch_to_tsquery('simple', search_text)) end desc,
    h.created_at desc
  limit least(greatest(coalesce(max_rows,50),1),100);
$$;

revoke all on function public.search_my_holdings(text, integer) from public;
revoke execute on function public.search_my_holdings(text, integer) from anon;
grant execute on function public.search_my_holdings(text, integer) to authenticated;
