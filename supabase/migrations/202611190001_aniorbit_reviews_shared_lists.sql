-- Reviews and shareable collections for AniOrbit.
-- All user-owned writes are restricted by RLS; anonymous access is explicitly revoked.

create table if not exists public.anime_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  anime_id text not null check (char_length(anime_id) between 1 and 80),
  anime_title text not null check (char_length(anime_title) between 1 and 180),
  score integer not null check (score between 1 and 10),
  title text not null default '' check (char_length(title) <= 100),
  content text not null check (char_length(content) between 1 and 3000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create index if not exists anime_reviews_anime_created_idx
  on public.anime_reviews(anime_id, created_at desc);

alter table public.anime_reviews enable row level security;
drop policy if exists "Signed-in members read anime reviews" on public.anime_reviews;
create policy "Signed-in members read anime reviews"
  on public.anime_reviews for select
  to authenticated
  using (true);

drop policy if exists "Members create their own anime reviews" on public.anime_reviews;
create policy "Members create their own anime reviews"
  on public.anime_reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Members update their own anime reviews" on public.anime_reviews;
create policy "Members update their own anime reviews"
  on public.anime_reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Members delete their own anime reviews" on public.anime_reviews;
create policy "Members delete their own anime reviews"
  on public.anime_reviews for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.anime_reviews from anon;
grant select, insert, delete on table public.anime_reviews to authenticated;
grant update (score, title, content, contains_spoilers, updated_at)
  on table public.anime_reviews to authenticated;

create table if not exists public.shared_anime_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 48),
  description text not null default '' check (char_length(description) <= 240),
  items jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(items) = 'array'
      and jsonb_array_length(items) <= 40
      and octet_length(items::text) <= 100000
    ),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_anime_lists_owner_created_idx
  on public.shared_anime_lists(owner_id, created_at desc);
create index if not exists shared_anime_lists_public_created_idx
  on public.shared_anime_lists(created_at desc)
  where is_public = true;

alter table public.shared_anime_lists enable row level security;
drop policy if exists "Members read public lists and their own lists" on public.shared_anime_lists;
create policy "Members read public lists and their own lists"
  on public.shared_anime_lists for select
  to authenticated
  using (is_public = true or owner_id = (select auth.uid()));

drop policy if exists "Members create their own shared lists" on public.shared_anime_lists;
create policy "Members create their own shared lists"
  on public.shared_anime_lists for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Members update their own shared lists" on public.shared_anime_lists;
create policy "Members update their own shared lists"
  on public.shared_anime_lists for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Members delete their own shared lists" on public.shared_anime_lists;
create policy "Members delete their own shared lists"
  on public.shared_anime_lists for delete
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.shared_anime_lists from anon;
grant select, insert, delete on table public.shared_anime_lists to authenticated;
grant update (name, description, items, is_public, updated_at)
  on table public.shared_anime_lists to authenticated;
