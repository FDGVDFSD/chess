-- Chess Arena v2 - Supabase schema upgrade
-- Safe to apply over the existing Chess Arena schema. Environment-specific owner
-- assignment is intentionally NOT stored in this public repository.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists format_ratings jsonb not null
  default '{"bullet":1000,"blitz":1000,"rapid":1000}'::jsonb;
alter table public.profiles add column if not exists streak integer not null default 1;
alter table public.profiles add column if not exists birth_year integer;
alter table public.profiles add column if not exists daily_challenge jsonb not null
  default '{"target":2,"completed":0,"lastDate":""}'::jsonb;
alter table public.profiles add column if not exists blocked_users text[] not null default '{}'::text[];
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists last_seen_at timestamptz not null default now();

-- Backfill Auth users that existed before the profile trigger was installed.
insert into public.profiles (id, username, email, role)
select
  u.id,
  'player_' || substr(replace(u.id::text, '-', ''), 1, 8),
  u.email,
  'user'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Prefer the username users originally chose when it is valid and unique.
update public.profiles p
set username = trim(u.raw_user_meta_data->>'username'),
    email = coalesce(u.email, p.email),
    birth_year = case
      when (u.raw_user_meta_data->>'birth_year') ~ '^[0-9]{4}$'
      then (u.raw_user_meta_data->>'birth_year')::integer
      else p.birth_year
    end,
    updated_at = now()
from auth.users u
where p.id = u.id
  and trim(coalesce(u.raw_user_meta_data->>'username','')) ~ '^[A-Za-z0-9_ ]{3,18}$'
  and not exists (
    select 1 from public.profiles p2
    where p2.id <> p.id
      and lower(p2.username) = lower(trim(u.raw_user_meta_data->>'username'))
  );

update public.profiles
set daily_challenge = jsonb_build_object(
  'target', coalesce((daily_challenge->>'target')::integer, 2),
  'completed', coalesce((daily_challenge->>'completed')::integer, 0),
  'lastDate', coalesce(nullif(daily_challenge->>'lastDate',''), to_char(current_date, 'YYYY-MM-DD'))
)
where daily_challenge->>'lastDate' is null or daily_challenge->>'lastDate' = '';

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate text;
begin
  candidate := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if candidate !~ '^[A-Za-z0-9_ ]{3,18}$' then
    candidate := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  if exists (select 1 from public.profiles where lower(username) = lower(candidate)) then
    candidate := left(candidate, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into public.profiles (
    id, username, email, role, birth_year, daily_challenge
  ) values (
    new.id,
    candidate,
    new.email,
    'user',
    case
      when (new.raw_user_meta_data->>'birth_year') ~ '^[0-9]{4}$'
      then (new.raw_user_meta_data->>'birth_year')::integer
      else null
    end,
    jsonb_build_object('target', 2, 'completed', 0, 'lastDate', to_char(current_date, 'YYYY-MM-DD'))
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

drop policy if exists profiles_self_edit on public.profiles;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);
create policy profiles_safe_self_update
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (settings, blocked_users, last_seen_at, updated_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Saved games / history
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='games' and column_name='white_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='games' and column_name='white_user_id'
  ) then
    alter table public.games rename column white_id to white_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='games' and column_name='black_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='games' and column_name='black_user_id'
  ) then
    alter table public.games rename column black_id to black_user_id;
  end if;
end $$;

alter table public.games alter column white_user_id drop not null;
alter table public.games alter column black_user_id drop not null;
alter table public.games add column if not exists white_username text not null default 'White';
alter table public.games add column if not exists black_username text not null default 'Black';
alter table public.games add column if not exists white_role text;
alter table public.games add column if not exists black_role text;
alter table public.games add column if not exists white_rating integer;
alter table public.games add column if not exists black_rating integer;
alter table public.games add column if not exists reason text not null default 'manual';
alter table public.games add column if not exists moves text[] not null default '{}'::text[];
alter table public.games add column if not exists final_fen text not null
  default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
alter table public.games add column if not exists time_control jsonb;
alter table public.games add column if not exists started_at timestamptz not null default now();
alter table public.games add column if not exists duration_ms bigint not null default 0;

drop policy if exists games_participant_insert on public.games;
drop policy if exists games_read on public.games;
drop policy if exists games_participant_read on public.games;
create policy games_participant_read
  on public.games for select
  to authenticated
  using (
    (select auth.uid()) = white_user_id
    or (select auth.uid()) = black_user_id
  );

revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='reporter_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='reporter_user_id'
  ) then
    alter table public.reports rename column reporter_id to reporter_user_id;
  end if;
end $$;

alter table public.reports add column if not exists reporter_username text not null default 'Player';

create or replace function public.set_reporter_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.reporter_user_id := auth.uid();
  select username into new.reporter_username
  from public.profiles
  where id = auth.uid();
  return new;
end;
$$;
revoke all on function public.set_reporter_identity() from public, anon, authenticated;

drop trigger if exists reports_set_identity on public.reports;
create trigger reports_set_identity
before insert on public.reports
for each row execute function public.set_reporter_identity();

drop policy if exists reports_owner_update on public.reports;
drop policy if exists reports_read on public.reports;
drop policy if exists reports_self_insert on public.reports;
create policy reports_self_read
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = reporter_user_id);
create policy reports_self_insert
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = reporter_user_id);

revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_user_id, reporter_username, target, reason, details)
  on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Announcements and audit
-- ---------------------------------------------------------------------------
drop policy if exists announcements_owner_delete on public.announcements;
drop policy if exists announcements_owner_update on public.announcements;
drop policy if exists announcements_owner_write on public.announcements;
drop policy if exists announcements_read on public.announcements;
create policy announcements_public_read
  on public.announcements for select
  to anon, authenticated
  using (active = true);

revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;

drop policy if exists audit_owner_read on public.audit_logs;
revoke all on public.audit_logs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Online games
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='room_code'
  ) then
    alter table public.online_games rename column code to room_code;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='white_player'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='white_user_id'
  ) then
    alter table public.online_games rename column white_player to white_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='black_player'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='black_user_id'
  ) then
    alter table public.online_games rename column black_player to black_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='white_seconds_remaining'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='white_ms_remaining'
  ) then
    alter table public.online_games rename column white_seconds_remaining to white_ms_remaining;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='black_seconds_remaining'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='black_ms_remaining'
  ) then
    alter table public.online_games rename column black_seconds_remaining to black_ms_remaining;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='last_move_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='online_games' and column_name='turn_started_at'
  ) then
    alter table public.online_games rename column last_move_at to turn_started_at;
  end if;
end $$;

alter table public.online_games alter column white_user_id drop not null;
alter table public.online_games alter column black_user_id drop not null;

alter table public.online_games drop constraint if exists online_games_status_check;
update public.online_games
set status = 'complete'
where status in ('finished', 'cancelled');
alter table public.online_games
  add constraint online_games_status_check
  check (status in ('waiting','active','complete'));

update public.online_games
set fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
where fen = 'startpos';
alter table public.online_games alter column fen
  set default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

update public.online_games
set white_ms_remaining = white_ms_remaining * 1000
where white_ms_remaining between 1 and 7200;
update public.online_games
set black_ms_remaining = black_ms_remaining * 1000
where black_ms_remaining between 1 and 7200;
alter table public.online_games alter column white_ms_remaining set default 300000;
alter table public.online_games alter column black_ms_remaining set default 300000;

alter table public.online_games add column if not exists white_username text not null default 'White';
alter table public.online_games add column if not exists black_username text not null default 'Waiting for player...';
alter table public.online_games add column if not exists white_role text;
alter table public.online_games add column if not exists black_role text;
alter table public.online_games add column if not exists white_rating integer;
alter table public.online_games add column if not exists black_rating integer;
alter table public.online_games add column if not exists moves text[] not null default '{}'::text[];
alter table public.online_games add column if not exists last_move jsonb;
alter table public.online_games add column if not exists reason text;
alter table public.online_games add column if not exists draw_offer_from text
  check (draw_offer_from is null or draw_offer_from in ('white','black'));
alter table public.online_games add column if not exists time_control jsonb not null
  default '{"id":"blitz-5","name":"5+0 Blitz","category":"blitz","initialSec":300,"incSec":0}'::jsonb;
alter table public.online_games add column if not exists updated_at timestamptz not null default now();
alter table public.online_games add column if not exists turn_started_at timestamptz;

drop policy if exists "players can create games" on public.online_games;
drop policy if exists "players can read their games" on public.online_games;
drop policy if exists "players can update their games" on public.online_games;
drop policy if exists online_games_participant_read on public.online_games;
create policy online_games_participant_read
  on public.online_games for select
  to authenticated
  using (
    (select auth.uid()) = white_user_id
    or (select auth.uid()) = black_user_id
  );

revoke all on public.online_games from anon, authenticated;
grant select on public.online_games to authenticated;

-- Old client-write move table is retained only for audit/compatibility.
revoke all on public.online_game_moves from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Matchmaking
-- ---------------------------------------------------------------------------
alter table public.matchmaking_queue add column if not exists username text not null default 'Player';
alter table public.matchmaking_queue add column if not exists preferred_color text not null default 'white'
  check (preferred_color in ('white','black'));
alter table public.matchmaking_queue add column if not exists time_control_id text not null default 'blitz-5';
alter table public.matchmaking_queue add column if not exists time_control jsonb not null
  default '{"id":"blitz-5","name":"5+0 Blitz","category":"blitz","initialSec":300,"incSec":0}'::jsonb;
alter table public.matchmaking_queue add column if not exists matched_game_id uuid
  references public.online_games(id) on delete set null;
alter table public.matchmaking_queue add column if not exists updated_at timestamptz not null default now();

drop policy if exists "users manage own matchmaking entry" on public.matchmaking_queue;
drop policy if exists matchmaking_self_read on public.matchmaking_queue;
create policy matchmaking_self_read
  on public.matchmaking_queue for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.matchmaking_queue from anon, authenticated;
grant select on public.matchmaking_queue to authenticated;

-- ---------------------------------------------------------------------------
-- Safe RPCs used directly by the browser
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
  username text,
  role text,
  rating integer,
  format_ratings jsonb,
  puzzle_rating integer,
  wins integer,
  losses integer,
  draws integer,
  games_played integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    p.username,
    p.role,
    p.rating,
    p.format_ratings,
    p.puzzle_rating,
    p.wins,
    p.losses,
    p.draws,
    p.wins + p.losses + p.draws
  from public.profiles p
  where p.is_banned = false
  order by p.rating desc, p.wins desc, p.username asc;
$$;
revoke all on function public.get_leaderboard() from public, anon;
grant execute on function public.get_leaderboard() to authenticated;

create or replace function public.apply_puzzle_result(p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_profile public.profiles;
  delta integer := case when p_success then 15 else -10 end;
  xp_gain integer := case when p_success then 25 else 0 end;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set
    puzzle_rating = greatest(100, puzzle_rating + delta),
    xp = xp + xp_gain,
    level = floor((xp + xp_gain) / 100.0)::integer + 1,
    updated_at = now()
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found';
  end if;

  insert into public.puzzle_solves (user_id, puzzle_id, success, rating_delta, xp_delta)
  values (auth.uid(), null, p_success, delta, xp_gain);

  return to_jsonb(updated_profile);
end;
$$;
revoke all on function public.apply_puzzle_result(boolean) from public, anon;
grant execute on function public.apply_puzzle_result(boolean) to authenticated;

-- Retire old browser-authoritative matchmaking/game RPCs.
drop function if exists public.create_friend_game();
drop function if exists public.join_friend_game(text);
drop function if exists public.join_random_match(integer);

-- Realtime subscriptions for authoritative online state.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='online_games'
  ) then
    alter publication supabase_realtime add table public.online_games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='matchmaking_queue'
  ) then
    alter publication supabase_realtime add table public.matchmaking_queue;
  end if;
end $$;
