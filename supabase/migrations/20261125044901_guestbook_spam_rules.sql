-- Guestbook spam protection, enforced in the database so it also stops bots that skip the website:
--  * no links: web addresses and bare domains are refused (pet guestbooks don't need them)
--  * the same message can't be posted more than 3 times in a day across all timelines
--  * at most 30 messages an hour per timeline, and 300 an hour across the whole site
--  * p_hp is a hidden "website" field people never see; if it's filled in, the message is quietly
--    dropped and the caller is told it worked, so the bot learns nothing
drop function if exists public.add_guestbook(text, text, text);
create function public.add_guestbook(p_id text, p_author text, p_message text, p_hp text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.guestbook; a text := left(trim(coalesce(p_author, '')), 40); m text := left(trim(coalesce(p_message, '')), 500);
begin
  if not exists (select 1 from public.timelines where id = p_id) then raise exception 'not found'; end if;
  if coalesce(p_hp, '') <> '' then
    return jsonb_build_object('id', 0, 'author', a, 'message', m, 'created_at', now());
  end if;
  if a = '' or m = '' then raise exception 'empty'; end if;
  if m ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ph|io|co|xyz|info|biz|ru|top|site|online|shop|link|app|me|ly|gg)\M)'
     or a ~* '(https?://|www\.|\.(com|net|org|ph|io|xyz)\M)' then
    raise exception 'links';
  end if;
  if (select count(*) from public.guestbook where timeline_id = p_id and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.guestbook where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'busy';
  end if;
  if (select count(*) from public.guestbook where lower(message) = lower(m) and created_at > now() - interval '1 day') >= 3 then
    raise exception 'duplicate';
  end if;
  insert into public.guestbook (timeline_id, author, message) values (p_id, a, m) returning * into r;
  return jsonb_build_object('id', r.id, 'author', r.author, 'message', r.message, 'created_at', r.created_at);
end $$;
revoke execute on function public.add_guestbook(text, text, text, text) from public;
grant execute on function public.add_guestbook(text, text, text, text) to anon, authenticated;
