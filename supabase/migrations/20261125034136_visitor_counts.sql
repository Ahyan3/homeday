-- Visitor numbers without tracking anyone: the site only adds 1 to a daily counter. No IP address,
-- browser, cookie or visitor id is stored; a counter row is (day, what happened, page kind, PH or abroad,
-- language). "visitor" is counted once per browser per day using a date kept in that browser.
create table public.stats_daily (
  day date not null,
  event text not null check (event in ('visitor', 'view', 'save', 'buy_click', 'pay_open', 'share_open', 'remind_on', 'gallery_offer', 'feedback')),
  page text not null check (page in ('home', 'timeline', 'keepsake', 'other')),
  region text not null check (region in ('PH', 'abroad')),
  lang text not null check (lang in ('en', 'tl')),
  n int not null default 0,
  primary key (day, event, page, region, lang)
);
alter table public.stats_daily enable row level security;
revoke all on public.stats_daily from anon, authenticated;

create or replace function public.hit(p_event text, p_page text, p_region text, p_lang text) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_event not in ('visitor', 'view', 'save', 'buy_click', 'pay_open', 'share_open', 'remind_on', 'gallery_offer', 'feedback')
     or p_page not in ('home', 'timeline', 'keepsake', 'other') or p_region not in ('PH', 'abroad') or p_lang not in ('en', 'tl') then
    return;  -- ignore anything unexpected instead of erroring
  end if;
  insert into public.stats_daily (day, event, page, region, lang, n) values (d, p_event, p_page, p_region, p_lang, 1)
  on conflict (day, event, page, region, lang) do update set n = public.stats_daily.n + 1
  where public.stats_daily.n < 1000000;  -- a ceiling, so a script can't make the numbers absurd
end $$;

-- owner: the last 14 days (Philippine time), with timelines saved and orders from their own tables
create or replace function public.admin_stats(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  return jsonb_build_object(
    'days', (select jsonb_agg(x order by x.day desc) from (
      select g.day::date as day,
        coalesce((select sum(n) from public.stats_daily s where s.day = g.day and s.event = 'visitor'), 0) as visitors,
        coalesce((select sum(n) from public.stats_daily s where s.day = g.day and s.event = 'visitor' and s.region = 'abroad'), 0) as abroad,
        coalesce((select sum(n) from public.stats_daily s where s.day = g.day and s.event = 'visitor' and s.lang = 'tl'), 0) as taglish,
        coalesce((select sum(n) from public.stats_daily s where s.day = g.day and s.event = 'view'), 0) as views,
        (select count(*) from public.timelines t where (t.created_at at time zone 'Asia/Manila')::date = g.day) as saved,
        coalesce((select sum(n) from public.stats_daily s where s.day = g.day and s.event = 'buy_click'), 0) as buy_clicks,
        (select count(*) from public.orders o where (o.created_at at time zone 'Asia/Manila')::date = g.day) as orders,
        (select count(*) from public.orders o where o.status = 'paid' and (o.paid_at at time zone 'Asia/Manila')::date = g.day) as paid,
        coalesce((select sum(o.amount_total) from public.orders o where o.status = 'paid' and o.currency = 'PHP' and (o.paid_at at time zone 'Asia/Manila')::date = g.day), 0) as paid_php_centavos
      from generate_series(today - 13, today, interval '1 day') g(day)) x),
    'all_time', jsonb_build_object(
      'timelines', (select count(*) from public.timelines),
      'paid', (select count(*) from public.orders where status = 'paid'),
      'paid_php_centavos', (select coalesce(sum(amount_total), 0) from public.orders where status = 'paid' and currency = 'PHP'),
      'reminders', (select count(*) from public.reminders where unsubscribed_at is null),
      'gallery', (select count(*) from public.timelines where gallery = 'shown')));
end $$;

revoke execute on function public.hit(text, text, text, text), public.admin_stats(text) from public, anon, authenticated;
grant execute on function public.hit(text, text, text, text), public.admin_stats(text) to anon, authenticated;
