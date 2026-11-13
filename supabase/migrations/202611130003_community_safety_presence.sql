-- AniOrbit community safety, pseudonymous author snapshots, reports, blocks and presence.
-- Run after migrations 202611130001 and 202611130002.

alter table public.profiles
  add column if not exists show_online boolean not null default false;

alter table public.anime_comments
  add column if not exists author_username text not null default 'member',
  add column if not exists author_avatar_path text,
  add column if not exists is_hidden boolean not null default false;

update public.anime_comments c
set author_username = p.username,
    author_avatar_path = p.avatar_path
from public.profiles p
where p.id = c.user_id;

create table if not exists public.community_moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.anime_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','hate','personal_information','spoiler','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create index if not exists comment_reports_status_created_idx
  on public.comment_reports(status, created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_community_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_moderators m
    where m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_community_moderator() to authenticated;

create or replace function public.maintain_anime_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if tg_op = 'INSERT' then
    select p.username, p.avatar_path
      into new.author_username, new.author_avatar_path
    from public.profiles p
    where p.id = new.user_id;

    if new.author_username is null then
      raise exception 'A profile is required before posting.';
    end if;

    -- Never let a client create a hidden comment or spoof its author label.
    new.is_hidden := false;

    -- Serialize per-user inserts so the short-window posting limit is reliable.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    select count(*) into recent_count
    from public.anime_comments c
    where c.user_id = new.user_id
      and c.created_at > now() - interval '5 minutes';

    if recent_count >= 5 then
      raise exception 'You are posting too quickly. Please wait a few minutes.';
    end if;
  else
    if new.user_id <> old.user_id
       or new.anime_id <> old.anime_id
       or new.episode_number is distinct from old.episode_number then
      raise exception 'Comment ownership and discussion location cannot be changed.';
    end if;

    -- Only a moderator can change visibility. Authors can still edit their text.
    if not public.is_community_moderator() then
      new.is_hidden := old.is_hidden;
    end if;
    new.author_username := old.author_username;
    new.author_avatar_path := old.author_avatar_path;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists maintain_anime_comment on public.anime_comments;
create trigger maintain_anime_comment
  before insert or update on public.anime_comments
  for each row execute function public.maintain_anime_comment();

alter table public.community_moderators enable row level security;
alter table public.comment_reports enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists "Members read visible comments" on public.anime_comments;
drop policy if exists "Signed-in users read comments" on public.anime_comments;
create policy "Members read visible comments"
  on public.anime_comments for select
  to authenticated
  using (
    (not is_hidden or public.is_community_moderator())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = anime_comments.user_id)
         or (b.blocker_id = anime_comments.user_id and b.blocked_id = auth.uid())
    )
  );

drop policy if exists "Moderators update comments" on public.anime_comments;
create policy "Moderators update comments"
  on public.anime_comments for update
  to authenticated
  using (public.is_community_moderator())
  with check (public.is_community_moderator());

drop policy if exists "Moderators delete comments" on public.anime_comments;
create policy "Moderators delete comments"
  on public.anime_comments for delete
  to authenticated
  using (public.is_community_moderator());

drop policy if exists "Members read comment likes" on public.comment_likes;
drop policy if exists "Signed-in users read likes" on public.comment_likes;
create policy "Members read comment likes"
  on public.comment_likes for select
  to authenticated
  using (
    exists (
      select 1 from public.anime_comments c
      where c.id = comment_likes.comment_id
        and (not c.is_hidden or public.is_community_moderator())
    )
  );

drop policy if exists "Members report comments" on public.comment_reports;
create policy "Members report comments"
  on public.comment_reports for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and exists (
      select 1 from public.anime_comments c
      where c.id = comment_reports.comment_id
        and c.user_id <> auth.uid()
        and not c.is_hidden
    )
  );

drop policy if exists "Moderators read reports" on public.comment_reports;
create policy "Moderators read reports"
  on public.comment_reports for select
  to authenticated
  using (public.is_community_moderator());

drop policy if exists "Moderators update reports" on public.comment_reports;
create policy "Moderators update reports"
  on public.comment_reports for update
  to authenticated
  using (public.is_community_moderator())
  with check (public.is_community_moderator());

drop policy if exists "Members manage their own blocks" on public.user_blocks;
create policy "Members manage their own blocks"
  on public.user_blocks for all
  to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id and blocked_id <> auth.uid());

drop policy if exists "Members can see their moderator status" on public.community_moderators;
create policy "Members can see their moderator status"
  on public.community_moderators for select
  to authenticated
  using (user_id = auth.uid());

-- Avatar images are visible only to signed-in members. Profile fields remain private
-- unless a member opts in; the storage policy exposes no email or other profile data.
drop policy if exists "Signed-in members read avatar images" on storage.objects;
create policy "Signed-in members read avatar images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

grant select, insert, update, delete on public.anime_comments to authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
grant select, insert, update on public.comment_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.community_moderators to authenticated;
