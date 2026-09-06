-- Cardfolio Supabase schema
-- Apply to a dedicated Cardfolio project. Every user-owned table is protected by RLS.

create extension if not exists pgcrypto;

create table if not exists public.card_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  subject text not null check (char_length(subject) between 1 and 120),
  year text,
  manufacturer text,
  brand text,
  set_name text,
  card_number text,
  parallel text,
  serial_number text,
  team text,
  league text,
  condition text,
  quantity integer not null default 1 check (quantity between 1 and 999),
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
  notes text check (notes is null or char_length(notes) <= 1000),
  image_path text,
  tcgdex_card_id text,
  market_value numeric(14,2) check (market_value is null or market_value >= 0),
  valuation_source text,
  valuation_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_holdings_user_created_idx on public.card_holdings(user_id, created_at desc);
create index if not exists card_holdings_user_category_idx on public.card_holdings(user_id, category);
create index if not exists card_holdings_user_subject_idx on public.card_holdings(user_id, lower(subject));
create index if not exists card_holdings_user_grader_idx on public.card_holdings(user_id, grading_company) where grading_company is not null;

alter table public.card_holdings enable row level security;

drop policy if exists "holdings_select_own" on public.card_holdings;
create policy "holdings_select_own" on public.card_holdings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "holdings_insert_own" on public.card_holdings;
create policy "holdings_insert_own" on public.card_holdings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "holdings_update_own" on public.card_holdings;
create policy "holdings_update_own" on public.card_holdings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "holdings_delete_own" on public.card_holdings;
create policy "holdings_delete_own" on public.card_holdings for delete to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.card_holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  market_value numeric(14,2) not null check (market_value >= 0),
  quantity integer not null default 1 check (quantity between 1 and 999),
  currency text not null default 'USD' check (char_length(currency) = 3),
  source text not null check (char_length(source) between 1 and 180),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists price_snapshots_user_observed_idx on public.price_snapshots(user_id, observed_at desc);
create index if not exists price_snapshots_holding_observed_idx on public.price_snapshots(holding_id, observed_at desc);

alter table public.price_snapshots enable row level security;

drop policy if exists "snapshots_select_own" on public.price_snapshots;
create policy "snapshots_select_own" on public.price_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "snapshots_insert_own" on public.price_snapshots;
create policy "snapshots_insert_own" on public.price_snapshots for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.card_holdings h
    where h.id = holding_id and h.user_id = (select auth.uid())
  )
);

drop policy if exists "snapshots_delete_own" on public.price_snapshots;
create policy "snapshots_delete_own" on public.price_snapshots for delete to authenticated
using ((select auth.uid()) = user_id);

-- Private card image bucket. Images are accessed with short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object names must be: <auth.uid()>/<random-file>.jpg

drop policy if exists "card_images_select_own" on storage.objects;
create policy "card_images_select_own" on storage.objects for select to authenticated
using (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "card_images_insert_own" on storage.objects;
create policy "card_images_insert_own" on storage.objects for insert to authenticated
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "card_images_update_own" on storage.objects;
create policy "card_images_update_own" on storage.objects for update to authenticated
using (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "card_images_delete_own" on storage.objects;
create policy "card_images_delete_own" on storage.objects for delete to authenticated
using (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Explicit grants for Data API access; RLS still determines which rows are reachable.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.card_holdings to authenticated;
grant select, insert, delete on public.price_snapshots to authenticated;
