-- Gallery: owners can offer their timeline as an example on the home page. Nothing shows until the
-- site owner approves it on /admin, and the timeline owner can take it down at any time.
alter table public.timelines
  add column gallery text check (gallery in ('pending', 'shown', 'declined')),
  add column gallery_at timestamptz;

create or replace function public.gallery_status(p_id text, p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(t.gallery, 'none') from public.timelines t
  where t.id = p_id and t.edit_key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex');
$$;

create or replace function public.set_gallery(p_id text, p_key text, p_on boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.timelines;
begin
  select * into t from public.timelines
  where id = p_id and edit_key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') for update;
  if not found then raise exception 'not owner'; end if;
  if not p_on then
    update public.timelines set gallery = null, gallery_at = null where id = p_id;
    return 'none';
  end if;
  if t.gallery = 'shown' then return 'shown'; end if;
  update public.timelines set gallery = 'pending', gallery_at = now() where id = p_id;
  return 'pending';
end $$;

-- public: approved timelines for the home page, newest approval first
create or replace function public.gallery_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select t.id, t.name, t.kind, t.home_date, t.memorial, t.passed_date, t.photos[1] as photo
    from public.timelines t where t.gallery = 'shown'
    order by t.gallery_at desc limit 12) x;
$$;

-- Feedback from the "Send feedback" box, read on /admin.
create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 2 and 1000),
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  page text check (char_length(page) <= 200),
  lang text check (lang in ('en', 'tl'))
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

create or replace function public.send_feedback(p_message text, p_email text, p_page text, p_lang text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare m text := trim(coalesce(p_message, '')); em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if char_length(m) not between 2 and 1000 then raise exception 'bad message'; end if;
  if em is not null and (em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254) then raise exception 'bad email'; end if;
  if (select count(*) from public.feedback where created_at > now() - interval '1 hour') >= 60 then raise exception 'too many'; end if;
  insert into public.feedback (message, email, page, lang)
  values (m, em, left(coalesce(p_page, ''), 200), case when p_lang in ('en', 'tl') then p_lang end);
  return true;
end $$;

-- owner: gallery requests, what's shown, and recent feedback
create or replace function public.admin_inbox(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  return jsonb_build_object(
    'gallery_pending', coalesce((select jsonb_agg(x order by x.gallery_at) from (
      select t.id, t.name, t.memorial, t.gallery_at, t.photos[1] as photo, cardinality(t.photos) as photo_count
      from public.timelines t where t.gallery = 'pending') x), '[]'::jsonb),
    'gallery_shown', coalesce((select jsonb_agg(x order by x.gallery_at desc) from (
      select t.id, t.name, t.gallery_at from public.timelines t where t.gallery = 'shown') x), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select f.id, f.created_at, f.message, f.email, f.page, f.lang from public.feedback f
      order by f.created_at desc limit 50) x), '[]'::jsonb));
end $$;

create or replace function public.admin_gallery(p_key text, p_id text, p_show boolean) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  update public.timelines set gallery = case when p_show then 'shown' else 'declined' end, gallery_at = now()
  where id = p_id and gallery in ('pending', 'shown');
  return case when found then (case when p_show then 'shown' else 'declined' end) else 'unknown' end;
end $$;

create or replace function public.admin_feedback_delete(p_key text, p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  delete from public.feedback where id = p_id;
  return found;
end $$;

revoke execute on function public.gallery_status(text, text), public.set_gallery(text, text, boolean), public.gallery_list(),
  public.send_feedback(text, text, text, text), public.admin_inbox(text), public.admin_gallery(text, text, boolean),
  public.admin_feedback_delete(text, bigint) from public, anon, authenticated;
grant execute on function public.gallery_status(text, text), public.set_gallery(text, text, boolean), public.gallery_list(),
  public.send_feedback(text, text, text, text), public.admin_inbox(text), public.admin_gallery(text, text, boolean),
  public.admin_feedback_delete(text, bigint) to anon, authenticated;
