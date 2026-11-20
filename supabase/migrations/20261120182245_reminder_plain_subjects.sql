-- Email subjects are plain text: use the pet's name as typed (line breaks removed), not HTML-escaped.
create or replace function public._plain(t text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(t, ''), '[\r\n\t]+', ' ', 'g');
$$;
revoke execute on function public._plain(text) from public, anon, authenticated;

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
    perform public._send_email(r.email, public._plain(r.name) || '''s ' || public._ordinal(r.years) || ' homeday is coming up', public._email_shell(body, unsub), unsub);
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
    perform public._send_email(em, 'Homeday reminders for ' || public._plain(t.name) || ' are on',
      public._email_shell('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:24px">Reminders for '
        || public._esc(t.name) || ' are on</h1><p style="font-size:17px;line-height:1.5;margin:0">You''ll get one email a year, a week before '
        || public._esc(t.name) || '''s homeday. The next one is ' || to_char(nxt, 'FMDD FMMonth YYYY') || '.</p>', unsub), unsub);
  end if;
  return jsonb_build_object('next', nxt);
end $$;

revoke execute on function public.send_due_reminders() from public, anon, authenticated;
revoke execute on function public.add_reminder(text, text, text) from public;
grant execute on function public.add_reminder(text, text, text) to anon, authenticated;
