create table public.user_cloud_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_cloud_saves_data_object check (
    jsonb_typeof(data) = 'object'
    and octet_length(data::text) <= 1048576
  )
);

comment on table public.user_cloud_saves is
  'Private per-user AniOrbit library and custom-list cloud sync data.';

alter table public.user_cloud_saves enable row level security;

revoke all on table public.user_cloud_saves from public, anon;
grant select, insert, update, delete on table public.user_cloud_saves to authenticated;

create policy "Users can read their own cloud saves"
  on public.user_cloud_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own cloud saves"
  on public.user_cloud_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own cloud saves"
  on public.user_cloud_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own cloud saves"
  on public.user_cloud_saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);
