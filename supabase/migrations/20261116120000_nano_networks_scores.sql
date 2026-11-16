-- Nano Networks: one online leaderboard per map (Classic mode).
-- Same pattern as Helpdesk Survivors' scores table: players sign in with
-- Google, pick a name once in the shared public.players table, and the
-- stamp trigger fills in who posted and their name, so a client can only
-- post a score for itself.

create table if not exists public.nn_scores (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  name text not null check (char_length(name) between 1 and 16),
  map text not null check (map in ('florida-region', 'coast-to-coast', 'campus')),
  score int not null check (score between 0 and 1000000),
  days numeric(6, 1) not null check (days between 0 and 2000),
  seed text not null check (char_length(seed) between 1 and 40),
  version text check (char_length(version) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists nn_scores_board on public.nn_scores (map, score desc, created_at);
create index if not exists nn_scores_user on public.nn_scores (user_id);
alter table public.nn_scores enable row level security;
create policy "anyone can read" on public.nn_scores for select using (true);
create policy "players can add" on public.nn_scores for insert to authenticated with check (true);

create or replace function public.nn_scores_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where user_id = auth.uid();
  if not found then raise exception 'Pick a leaderboard name first.'; end if;
  if p.banned then raise exception 'This account can''t post scores.'; end if;
  if (select count(*) from public.nn_scores where created_at > now() - interval '1 minute') >= 30
    or (select count(*) from public.nn_scores
        where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Too many scores right now. Try again in a minute.';
  end if;
  new.user_id := auth.uid();
  new.name := p.name;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.nn_scores_stamp() from public, anon, authenticated;
create or replace trigger nn_scores_stamp before insert on public.nn_scores
  for each row execute function public.nn_scores_stamp();

-- Each player's best run on a map, ranked.
create or replace function public.nn_leaderboard(p_map text, p_limit int default 20)
returns table (rank bigint, name text, score int, days numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.user_id) s.name, s.score, s.days, s.created_at
    from public.nn_scores s
    join public.players pl on pl.user_id = s.user_id
    where s.map = p_map and not pl.banned
    order by s.user_id, s.score desc, s.days desc, s.created_at
  )
  select rank() over (order by score desc), name, score, days, created_at
  from best order by score desc, created_at limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.nn_leaderboard(text, int) to anon, authenticated;

-- The signed-in player's best on a map and where it ranks.
create or replace function public.nn_my_best(p_map text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select score, days from public.nn_scores
    where user_id = auth.uid() and map = p_map
    order by score desc, days desc limit 1
  )
  select case when not exists (select 1 from mine) then null else jsonb_build_object(
    'score', (select score from mine),
    'days', (select days from mine),
    'rank', 1 + (select count(*) from (
      select max(s.score) as best from public.nn_scores s
      join public.players pl on pl.user_id = s.user_id
      where s.map = p_map and s.user_id <> auth.uid() and not pl.banned
      group by s.user_id
    ) b where b.best > (select score from mine))
  ) end;
$$;
revoke execute on function public.nn_my_best(text) from public, anon;
grant execute on function public.nn_my_best(text) to authenticated;

-- Renaming in any game renames your Nano Networks scores too.
create or replace function public.players_rename_nn_scores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.nn_scores set name = new.name where user_id = new.user_id;
  end if;
  return new;
end $$;
revoke execute on function public.players_rename_nn_scores() from public, anon, authenticated;
create or replace trigger players_rename_nn_scores after update of name on public.players
  for each row execute function public.players_rename_nn_scores();
