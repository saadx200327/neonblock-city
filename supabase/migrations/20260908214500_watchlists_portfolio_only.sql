create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 240),
  icon text not null default '☆' check (char_length(icon) between 1 and 8),
  accent text not null default 'blue' check (accent in ('blue','violet','green','amber','rose','slate')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;

drop policy if exists watchlists_select_own on public.watchlists;
create policy watchlists_select_own on public.watchlists for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists watchlists_insert_own on public.watchlists;
create policy watchlists_insert_own on public.watchlists for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists watchlists_update_own on public.watchlists;
create policy watchlists_update_own on public.watchlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists watchlists_delete_own on public.watchlists;
create policy watchlists_delete_own on public.watchlists for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.watchlist_items add column if not exists watchlist_id uuid references public.watchlists(id) on delete cascade;
alter table public.watchlist_items add column if not exists holding_id uuid references public.card_holdings(id) on delete cascade;
create unique index if not exists watchlist_items_list_holding_uidx on public.watchlist_items(watchlist_id, holding_id) where watchlist_id is not null and holding_id is not null;
create index if not exists watchlist_items_holding_idx on public.watchlist_items(holding_id) where holding_id is not null;
create index if not exists watchlist_items_watchlist_idx on public.watchlist_items(watchlist_id) where watchlist_id is not null;

drop policy if exists watchlist_insert_own on public.watchlist_items;
create policy watchlist_insert_own on public.watchlist_items for insert to authenticated with check (
  (select auth.uid()) = user_id
  and holding_id is not null
  and watchlist_id is not null
  and exists (select 1 from public.card_holdings h where h.id = holding_id and h.user_id = (select auth.uid()))
  and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid()))
);

drop policy if exists watchlist_update_own on public.watchlist_items;
create policy watchlist_update_own on public.watchlist_items for update to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id
  and holding_id is not null
  and watchlist_id is not null
  and exists (select 1 from public.card_holdings h where h.id = holding_id and h.user_id = (select auth.uid()))
  and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid()))
);
