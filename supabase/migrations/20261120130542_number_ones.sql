-- Billboard Hot 100 number ones, one row per chart week (1958 onward), and the lookup the site calls.
-- The rows themselves are loaded by supabase/seed/number_ones.sql.

create extension if not exists pg_net with schema extensions;
create table public.number_ones (week date primary key, title text not null, artist text not null);
alter table public.number_ones enable row level security;
revoke all on public.number_ones from anon, authenticated;

create or replace function public.song_on(p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title', title, 'artist', artist, 'week', week)
  from public.number_ones where week >= p_date and week <= p_date + 7 order by week limit 1;
$$;
revoke execute on function public.song_on(date) from public;
grant execute on function public.song_on(date) to anon, authenticated;
