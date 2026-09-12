-- Cardfolio Community v1
-- Public social resources are opt-in. Private card_holdings remain protected by their existing owner-only RLS.

create table if not exists public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Collector' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.social_profiles(user_id) on delete cascade,
  holding_id uuid references public.card_holdings(id) on delete set null,
  card_name text not null check (char_length(card_name) between 1 and 180),
  category text not null default 'Other' check (char_length(category) between 1 and 60),
  value_usd numeric(14,2) check (value_usd is null or value_usd >= 0),
  card_image_url text check (card_image_url is null or char_length(card_image_url) <= 1200),
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.social_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references public.social_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references public.social_profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.social_follows (
  follower_id uuid not null references public.social_profiles(user_id) on delete cascade,
  following_id uuid not null references public.social_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists social_posts_created_at_idx on public.social_posts(created_at desc);
create index if not exists social_posts_user_id_idx on public.social_posts(user_id, created_at desc);
create index if not exists social_likes_post_id_idx on public.social_likes(post_id);
create index if not exists social_comments_post_id_idx on public.social_comments(post_id, created_at);
create index if not exists social_follows_following_id_idx on public.social_follows(following_id);

alter table public.social_profiles enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_follows enable row level security;

drop policy if exists social_profiles_public_read on public.social_profiles;
create policy social_profiles_public_read on public.social_profiles for select to anon, authenticated using (true);
drop policy if exists social_profiles_insert_own on public.social_profiles;
create policy social_profiles_insert_own on public.social_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists social_profiles_update_own on public.social_profiles;
create policy social_profiles_update_own on public.social_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists social_profiles_delete_own on public.social_profiles;
create policy social_profiles_delete_own on public.social_profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_posts_public_read on public.social_posts;
create policy social_posts_public_read on public.social_posts for select to anon, authenticated using (true);
drop policy if exists social_posts_insert_own on public.social_posts;
create policy social_posts_insert_own on public.social_posts for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (
    holding_id is null
    or exists (
      select 1 from public.card_holdings h
      where h.id = holding_id and h.user_id = (select auth.uid())
    )
  )
);
drop policy if exists social_posts_update_own on public.social_posts;
create policy social_posts_update_own on public.social_posts for update to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id
  and (
    holding_id is null
    or exists (
      select 1 from public.card_holdings h
      where h.id = holding_id and h.user_id = (select auth.uid())
    )
  )
);
drop policy if exists social_posts_delete_own on public.social_posts;
create policy social_posts_delete_own on public.social_posts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_likes_public_read on public.social_likes;
create policy social_likes_public_read on public.social_likes for select to anon, authenticated using (true);
drop policy if exists social_likes_insert_own on public.social_likes;
create policy social_likes_insert_own on public.social_likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists social_likes_delete_own on public.social_likes;
create policy social_likes_delete_own on public.social_likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_comments_public_read on public.social_comments;
create policy social_comments_public_read on public.social_comments for select to anon, authenticated using (true);
drop policy if exists social_comments_insert_own on public.social_comments;
create policy social_comments_insert_own on public.social_comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists social_comments_update_own on public.social_comments;
create policy social_comments_update_own on public.social_comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists social_comments_delete_own on public.social_comments;
create policy social_comments_delete_own on public.social_comments for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_follows_public_read on public.social_follows;
create policy social_follows_public_read on public.social_follows for select to anon, authenticated using (true);
drop policy if exists social_follows_insert_own on public.social_follows;
create policy social_follows_insert_own on public.social_follows for insert to authenticated with check ((select auth.uid()) = follower_id and follower_id <> following_id);
drop policy if exists social_follows_delete_own on public.social_follows;
create policy social_follows_delete_own on public.social_follows for delete to authenticated using ((select auth.uid()) = follower_id);

grant select on public.social_profiles, public.social_posts, public.social_likes, public.social_comments, public.social_follows to anon, authenticated;
grant insert, update, delete on public.social_profiles, public.social_posts, public.social_comments to authenticated;
grant insert, delete on public.social_likes, public.social_follows to authenticated;
