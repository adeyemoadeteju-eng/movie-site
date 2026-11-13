-- AniOrbit community foundation
-- Run this in Supabase SQL Editor. This migration intentionally stores no email,
-- real name, birth date, or location in public profile rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 24 and username ~ '^[a-zA-Z0-9_]+$'),
  display_name text not null default ''
    check (char_length(display_name) <= 40),
  avatar_path text,
  bio text not null default ''
    check (char_length(bio) <= 240),
  favorite_anime text
    check (favorite_anime is null or char_length(favorite_anime) <= 120),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anime_comments (
  id uuid primary key default gen_random_uuid(),
  anime_id text not null check (char_length(anime_id) between 1 and 80),
  episode_number integer check (episode_number is null or episode_number > 0),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anime_comments_anime_episode_created_idx
  on public.anime_comments (anime_id, episode_number, created_at desc);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.anime_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.anime_comments enable row level security;
alter table public.comment_likes enable row level security;

drop policy if exists "Public profiles are viewable" on public.profiles;
create policy "Public profiles are viewable"
  on public.profiles for select
  using (is_public or auth.uid() = id);

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Signed-in users read comments" on public.anime_comments;
create policy "Signed-in users read comments"
  on public.anime_comments for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users create comments" on public.anime_comments;
create policy "Signed-in users create comments"
  on public.anime_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authors update their own comments" on public.anime_comments;
create policy "Authors update their own comments"
  on public.anime_comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authors delete their own comments" on public.anime_comments;
create policy "Authors delete their own comments"
  on public.anime_comments for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Signed-in users read likes" on public.comment_likes;
create policy "Signed-in users read likes"
  on public.comment_likes for select
  to authenticated
  using (true);

drop policy if exists "Users like as themselves" on public.comment_likes;
create policy "Users like as themselves"
  on public.comment_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove their own likes" on public.comment_likes;
create policy "Users remove their own likes"
  on public.comment_likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Automatically create a pseudonymous profile after sign-up.
-- Username is generated from a random suffix; users can change it later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_username text;
begin
  generated_username := 'orbit_' || lower(substr(replace(new.id::text, '-', ''), 1, 12));
  insert into public.profiles (id, username, display_name)
  values (new.id, generated_username, generated_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Avatar storage: private by default; profile image URLs can be served via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Users read own avatar" on storage.objects;
create policy "Users read own avatar"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
