-- Homeday reminders: one email a year, a week before each living pet's homeday.
-- Sending runs inside the database (pg_cron + pg_net + Resend), so it works on any host.
create extension if not exists pg_cron;

create table public.reminders (
  id bigint generated always as identity primary key,
  timeline_id text not null references public.timelines(id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token text not null unique,
  last_sent_year int,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (timeline_id, email)
);
alter table public.reminders enable row level security;
revoke all on public.reminders from anon, authenticated;

-- settings the sender reads; values left empty until a domain and a Resend key exist
insert into public.app_secrets (name, value) values ('site_url', 'https://homeday-eight.vercel.app') on conflict (name) do nothing;

create or replace function public._esc(t text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function public._ordinal(n int) returns text language sql immutable set search_path = '' as $$
  select n || case when n % 100 between 11 and 13 then 'th' when n % 10 = 1 then 'st' when n % 10 = 2 then 'nd' when n % 10 = 3 then 'rd' else 'th' end;
$$;

-- the homeday in a given year; 29 February falls on 1 March in other years
create or replace function public._homeday_in_year(home date, y int) returns date language plpgsql immutable set search_path = '' as $$
begin
  return make_date(y, extract(month from home)::int, extract(day from home)::int);
exception when others then
  return make_date(y, 3, 1);
end $$;

create or replace function public._next_homeday(home date, p_on date) returns date language plpgsql immutable set search_path = '' as $$
declare d date := public._homeday_in_year(home, extract(year from p_on)::int);
begin
  if d < p_on then d := public._homeday_in_year(home, extract(year from p_on)::int + 1); end if;
  return d;
end $$;

create or replace function public._today_ph() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- reminders whose homeday is 1 to 7 days after p_on and not yet emailed this year, soonest first.
-- Capped at 90 a day to stay under Resend's free limit of 100; the rest go out the next day.
create or replace function public.due_reminders(p_on date default null)
returns table (id bigint, email text, token text, timeline_id text, name text, homeday date, years int)
language sql stable security definer set search_path = '' as $$
  select r.id, r.email, r.token, t.id, t.name, h.d, (extract(year from h.d) - extract(year from t.home_date))::int
  from public.reminders r
  join public.timelines t on t.id = r.timeline_id
  cross join lateral (select public._next_homeday(t.home_date, coalesce(p_on, public._today_ph())) as d) h
  where r.unsubscribed_at is null
    and not t.memorial
    and h.d between coalesce(p_on, public._today_ph()) + 1 and coalesce(p_on, public._today_ph()) + 7
    and coalesce(r.last_sent_year, 0) < extract(year from h.d)
    and extract(year from h.d) > extract(year from t.home_date)
  order by h.d, r.id
  limit 90;
$$;

-- queues one email through Resend; does nothing (returns null) until the key and sender are set
create or replace function public._send_email(p_to text, p_subject text, p_html text, p_unsub_url text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare k text; f text;
begin
  select value into k from public.app_secrets where name = 'resend_api_key';
  select value into f from public.app_secrets where name = 'reminder_from';
  if k is null or k = '' or f is null or f = '' then return null; end if;
  return net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', f, 'to', jsonb_build_array(p_to), 'subject', p_subject, 'html', p_html,
                               'headers', jsonb_build_object('List-Unsubscribe', '<' || p_unsub_url || '>')),
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000);
end $$;

create or replace function public._email_shell(p_body text, p_unsub_url text) returns text
language sql immutable set search_path = '' as $$
  select '<div style="background:#E7ECE3;padding:24px 12px;font-family:Georgia,serif;color:#14302A">'
    || '<div style="max-width:520px;margin:0 auto;background:#F8FAF5;border:1.5px solid #14302A;border-radius:14px;padding:28px">'
    || '<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-weight:800;font-size:20px">Homeday</p>'
    || p_body
    || '<p style="margin:28px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#4A665B">You asked for homeday reminders. '
    || '<a href="' || p_unsub_url || '" style="color:#4A665B">Stop these emails</a>.</p>'
    || '</div></div>';
$$;

-- sends today's reminders; run daily by pg_cron
create or replace function public.send_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; site text; unsub text; n int := 0; body text;
begin
  if not exists (select 1 from public.app_secrets where name = 'resend_api_key' and value <> '') then return 0; end if;
  select value into site from public.app_secrets where name = 'site_url';
  for r in select * from public.due_reminders() loop
    unsub := site || '/unsubscribe?t=' || r.token;
    body := '<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:26px;line-height:1.15">'
      || public._esc(r.name) || '''s ' || public._ordinal(r.years) || ' homeday is on ' || to_char(r.homeday, 'FMDay, FMDD FMMonth') || '</h1>'
      || '<p style="font-size:17px;line-height:1.5;margin:0 0 20px">' || public._esc(r.name) || ' came home '
      || r.years || case when r.years = 1 then ' year' else ' years' end || ' ago. Worth a treat, and maybe a photo for the timeline.</p>'
      || '<p style="margin:0 0 16px"><a href="' || site || '/t/' || r.timeline_id || '" style="display:inline-block;background:#D3E24A;color:#14302A;border:1.5px solid #14302A;border-radius:999px;padding:11px 20px;font-family:Arial,sans-serif;font-weight:700;text-decoration:none">See '
      || public._esc(r.name) || '''s timeline</a></p>'
      || '<p style="font-size:15px;line-height:1.5;margin:0;color:#4A665B">A homeday idea: the printable poster and certificate make a good gift. '
      || '<a href="' || site || '/keepsake/' || r.timeline_id || '" style="color:#14302A">Have a look</a>.</p>';
    perform public._send_email(r.email, public._esc(r.name) || '''s ' || public._ordinal(r.years) || ' homeday is coming up', public._email_shell(body, unsub), unsub);
    update public.reminders set last_sent_year = extract(year from r.homeday)::int where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- owner signs up an email for a living pet's timeline; sends a short confirmation if email is switched on
create or replace function public.add_reminder(p_id text, p_key text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.timelines; tok text; site text; unsub text; nxt date; em text := lower(trim(p_email)); is_new boolean;
begin
  select * into t from public.timelines
  where id = p_id and edit_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  if not found then raise exception 'not owner'; end if;
  if t.memorial then raise exception 'memorial'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'bad email'; end if;
  if (select count(*) from public.reminders where timeline_id = p_id and unsubscribed_at is null and email <> em) >= 5 then
    raise exception 'too many';
  end if;
  insert into public.reminders (timeline_id, email, token) values (p_id, em, public._rand_id(24))
  on conflict (timeline_id, email) do update set unsubscribed_at = null
  returning token, (xmax = 0) into tok, is_new;

  nxt := public._next_homeday(t.home_date, public._today_ph() + 1);
  if is_new then
    select value into site from public.app_secrets where name = 'site_url';
    unsub := site || '/unsubscribe?t=' || tok;
    perform public._send_email(em, 'Homeday reminders for ' || public._esc(t.name) || ' are on',
      public._email_shell('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:24px">Reminders for '
        || public._esc(t.name) || ' are on</h1><p style="font-size:17px;line-height:1.5;margin:0">You''ll get one email a year, a week before '
        || public._esc(t.name) || '''s homeday. The next one is ' || to_char(nxt, 'FMDD FMMonth YYYY') || '.</p>', unsub), unsub);
  end if;
  return jsonb_build_object('next', nxt);
end $$;

create or replace function public.unsubscribe_reminder(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.reminders set unsubscribed_at = coalesce(unsubscribed_at, now()) where token = p_token;
  return case when found then 'done' else 'unknown' end;
end $$;

-- owner-only: which emails get reminders for this timeline
create or replace function public.reminder_emails(p_id text, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r.email order by r.created_at), '[]'::jsonb)
  from public.reminders r join public.timelines t on t.id = r.timeline_id
  where t.id = p_id and t.edit_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and r.unsubscribed_at is null;
$$;

revoke execute on function public._esc(text), public._ordinal(int), public._homeday_in_year(date, int), public._next_homeday(date, date),
  public._today_ph(), public.due_reminders(date), public._send_email(text, text, text, text), public._email_shell(text, text),
  public.send_due_reminders(), public.add_reminder(text, text, text), public.unsubscribe_reminder(text), public.reminder_emails(text, text)
  from public, anon, authenticated;
grant execute on function public.add_reminder(text, text, text), public.unsubscribe_reminder(text), public.reminder_emails(text, text)
  to anon, authenticated;

-- every day at 9:00 am Philippine time (01:00 UTC)
select cron.schedule('homeday-reminders', '0 1 * * *', $$select public.send_due_reminders()$$);
