-- Loads every Billboard Hot 100 number one since August 1958 into public.number_ones.
-- Source: github.com/utdata/rwd-billboard-data (chart history, about 20 MB of CSV).
-- Run in two steps in the Supabase SQL editor, because pg_net fetches in the background.

-- Step 1: fetch the CSV. Note the id it returns.
select net.http_get('https://raw.githubusercontent.com/utdata/rwd-billboard-data/main/data-out/hot-100-current.csv',
                    timeout_milliseconds := 60000);

-- Step 2: after about 20 seconds, parse the weeks where the song was at number 1.
-- Replace :id with the id from step 1.
with lines as (
  select l from net._http_response r, regexp_split_to_table(r.content, E'\n') l
  where r.id = :id and l ~ '^\d{4}-\d{2}-\d{2},1,'
), m as (
  select regexp_match(l, '^(\d{4}-\d{2}-\d{2}),1,("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),') x from lines
), u as (
  select x[1]::date wk,
    case when x[2] like '"%' then replace(substr(x[2], 2, length(x[2]) - 2), '""', '"') else x[2] end t,
    case when x[3] like '"%' then replace(substr(x[3], 2, length(x[3]) - 2), '""', '"') else x[3] end a
  from m where x is not null
)
insert into public.number_ones (week, title, artist)
select wk, t, a from u
on conflict (week) do update set title = excluded.title, artist = excluded.artist;

-- Step 3: tidy up the 20 MB response.
delete from net._http_response;

-- Check: expect about 3,560 rows from 1958-08-04, and "Sucker" by Jonas Brothers for 2019-03-16.
select count(*), min(week), max(week), public.song_on('2019-03-16') from public.number_ones;
