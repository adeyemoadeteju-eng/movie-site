-- Make AniOrbit profiles private unless a member explicitly opts in.
alter table public.profiles alter column is_public set default false;
update public.profiles set is_public = false where is_public = true;

-- Keep automatically-created profiles private from the moment of sign-up.
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
  insert into public.profiles (id, username, display_name, is_public)
  values (new.id, generated_username, generated_username, false);
  return new;
end;
$$;
