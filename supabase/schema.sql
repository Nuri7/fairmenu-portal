-- FairMenu portal — accounts + favorites schema.
-- Run this in the Supabase SQL editor after creating the project.
-- Auth (email/password) is handled by Supabase's built-in auth.users.

-- 1. Profiles: one row per user, auto-created on signup.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile read"  on public.profiles;
drop policy if exists "own profile write" on public.profiles;
create policy "own profile read"  on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for update using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

-- Auto-insert a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Favorites: (user, shop) pairs. shop_id is the portal's café id (text).
create table if not exists public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  shop_id    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

alter table public.favorites enable row level security;

drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
