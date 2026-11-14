create table if not exists public.member_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint member_follows_no_self check (follower_id <> following_id)
);

create index if not exists member_follows_following_created_idx
  on public.member_follows(following_id, created_at desc);
create index if not exists member_follows_follower_created_idx
  on public.member_follows(follower_id, created_at desc);

alter table public.member_follows enable row level security;

drop policy if exists "Members read visible follow relationships" on public.member_follows;
create policy "Members read visible follow relationships"
  on public.member_follows for select
  to authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = member_follows.following_id and p.is_public = true
    )
  );

drop policy if exists "Members follow public profiles" on public.member_follows;
create policy "Members follow public profiles"
  on public.member_follows for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> following_id
    and exists (
      select 1 from public.profiles p
      where p.id = member_follows.following_id and p.is_public = true
    )
    and not public.is_blocked_relationship(following_id)
  );

drop policy if exists "Members unfollow from their account" on public.member_follows;
create policy "Members unfollow from their account"
  on public.member_follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

grant select, insert, delete on public.member_follows to authenticated;

create table if not exists public.member_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in ('started', 'watchlist', 'episode_watched')),
  activity_key text not null check (char_length(activity_key) between 1 and 180),
  anime_id text not null check (char_length(anime_id) between 1 and 80),
  anime_title text not null check (char_length(anime_title) between 1 and 180),
  anime_image text not null default '' check (char_length(anime_image) <= 2048),
  detail text not null default '' check (char_length(detail) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, activity_key)
);

create index if not exists member_activity_feed_idx
  on public.member_activity(user_id, created_at desc);

alter table public.member_activity enable row level security;

drop policy if exists "Members read public activity" on public.member_activity;
create policy "Members read public activity"
  on public.member_activity for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.profiles p
        where p.id = member_activity.user_id and p.is_public = true
      )
      and not public.is_blocked_relationship(user_id)
    )
  );

drop policy if exists "Members add their own activity" on public.member_activity;
create policy "Members add their own activity"
  on public.member_activity for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and activity_type in ('started', 'watchlist', 'episode_watched')
  );

grant select, insert on public.member_activity to authenticated;

create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in ('new_follower', 'comment_liked')),
  reference_id text,
  episode_number integer check (episode_number is null or episode_number > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists member_notifications_inbox_idx
  on public.member_notifications(recipient_id, created_at desc);
create index if not exists member_notifications_unread_idx
  on public.member_notifications(recipient_id, read_at)
  where read_at is null;

alter table public.member_notifications enable row level security;

drop policy if exists "Members read their notifications" on public.member_notifications;
create policy "Members read their notifications"
  on public.member_notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists "Members mark their notifications read" on public.member_notifications;
create policy "Members mark their notifications read"
  on public.member_notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "Members delete their notifications" on public.member_notifications;
create policy "Members delete their notifications"
  on public.member_notifications for delete
  to authenticated
  using (recipient_id = (select auth.uid()));

grant select, delete on public.member_notifications to authenticated;
grant update (read_at) on public.member_notifications to authenticated;

create or replace function public.notify_member_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.member_notifications(recipient_id, actor_id, notification_type)
  values (new.following_id, new.follower_id, 'new_follower');
  return new;
end;
$fn$;

drop trigger if exists member_follow_notification on public.member_follows;
create trigger member_follow_notification
  after insert on public.member_follows
  for each row execute function public.notify_member_follow();

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target_user uuid;
  target_anime text;
  target_episode integer;
begin
  select c.user_id, c.anime_id, c.episode_number
    into target_user, target_anime, target_episode
  from public.anime_comments c
  where c.id = new.comment_id;

  if target_user is not null
     and target_user <> new.user_id
     and not public.is_blocked_relationship(target_user) then
    insert into public.member_notifications(
      recipient_id, actor_id, notification_type, reference_id, episode_number
    )
    values (target_user, new.user_id, 'comment_liked', target_anime, target_episode);
  end if;
  return new;
end;
$fn$;

drop trigger if exists comment_like_notification on public.comment_likes;
create trigger comment_like_notification
  after insert on public.comment_likes
  for each row execute function public.notify_comment_like();

revoke all on function public.notify_member_follow() from public, anon, authenticated;
revoke all on function public.notify_comment_like() from public, anon, authenticated;
