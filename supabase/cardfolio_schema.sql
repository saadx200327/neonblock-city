-- Cardfolio MVP database schema
-- Run against a dedicated Supabase project before enabling cloud sync.
-- All user-owned tables use RLS. Public client writes to provider data are intentionally absent.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  base_currency text not null default 'USD' check (char_length(base_currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Other',
  subject text not null,
  year text,
  manufacturer text,
  brand text,
  set_name text,
  card_number text,
  parallel text,
  serial_number text,
  team text,
  league text,
  condition text not null default 'Raw — unknown',
  quantity integer not null default 1 check (quantity > 0 and quantity <= 999),
  cost_basis numeric(14,2) check (cost_basis is null or cost_basis >= 0),
  acquisition_source text,
  acquisition_date date,
  manual_value numeric(14,2) check (manual_value is null or manual_value >= 0),
  grading_company text,
  grade text,
  cert_number text,
  rookie boolean not null default false,
  autograph boolean not null default false,
  relic boolean not null default false,
  notes text,
  image_path text,
  tcgdex_card_id text,
  market_value numeric(14,2) check (market_value is null or market_value >= 0),
  valuation_source text,
  valuation_observed_at timestamptz,
  external_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_holdings_user_created_idx on public.card_holdings(user_id, created_at desc);
create index if not exists card_holdings_user_subject_idx on public.card_holdings(user_id, lower(subject));
create index if not exists card_holdings_user_category_idx on public.card_holdings(user_id, category);
create index if not exists card_holdings_tcgdex_idx on public.card_holdings(tcgdex_card_id) where tcgdex_card_id is not null;

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.card_holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  market_value numeric(14,2) not null check (market_value >= 0),
  quantity integer not null default 1 check (quantity > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  source text not null,
  observed_at timestamptz not null default now(),
  provenance_url text,
  raw_reference jsonb not null default '{}'::jsonb
);

create index if not exists price_snapshots_user_observed_idx on public.price_snapshots(user_id, observed_at desc);
create index if not exists price_snapshots_holding_observed_idx on public.price_snapshots(holding_id, observed_at desc);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Other',
  subject text not null,
  year text,
  manufacturer text,
  brand text,
  set_name text,
  card_number text,
  target_price numeric(14,2) check (target_price is null or target_price >= 0),
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists watchlist_user_idx on public.watchlist_items(user_id, created_at desc);

create table if not exists public.provider_status (
  provider text primary key,
  enabled boolean not null default false,
  mode text not null default 'disabled',
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.card_holdings enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.provider_status enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- Holdings
create policy "holdings_select_own" on public.card_holdings for select to authenticated using ((select auth.uid()) = user_id);
create policy "holdings_insert_own" on public.card_holdings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "holdings_update_own" on public.card_holdings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "holdings_delete_own" on public.card_holdings for delete to authenticated using ((select auth.uid()) = user_id);

-- Price snapshots are still private portfolio data in MVP.
create policy "snapshots_select_own" on public.price_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy "snapshots_insert_own" on public.price_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "snapshots_delete_own" on public.price_snapshots for delete to authenticated using ((select auth.uid()) = user_id);

-- Watchlist
create policy "watchlist_select_own" on public.watchlist_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlist_insert_own" on public.watchlist_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlist_update_own" on public.watchlist_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "watchlist_delete_own" on public.watchlist_items for delete to authenticated using ((select auth.uid()) = user_id);

-- provider_status is intentionally server/admin-only: RLS enabled, no anon/authenticated policies.

-- Private card image bucket. Object path must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 12582912, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "card_images_select_own" on storage.objects for select to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "card_images_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "card_images_update_own" on storage.objects for update to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "card_images_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Grants for the Data API. RLS still decides which rows are accessible.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.card_holdings to authenticated;
grant select, insert, delete on public.price_snapshots to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;
