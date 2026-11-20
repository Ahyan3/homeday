-- Homeday core: timelines, guestbook, orders, and the only functions the public site may call.
-- Tables are closed to the public (RLS on, no policies, grants revoked); everything goes through
-- SECURITY DEFINER functions with fixed search_path.

create extension if not exists pgcrypto with schema extensions;

create table public.timelines (
  id text primary key,
  name text not null check (char_length(name) between 1 and 24),
  kind text not null check (kind in ('dog','cat','rabbit','bird','pet')),
  home_date date not null,
  birth_date date,
  city text check (char_length(city) <= 60),
  lat double precision, lon double precision,
  memorial boolean not null default false,
  passed_date date,
  photos text[] not null default '{}' check (cardinality(photos) <= 12),
  edit_key_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (birth_date is null or birth_date <= home_date),
  check (not memorial or (passed_date is not null and passed_date >= home_date))
);

create table public.guestbook (
  id bigint generated always as identity primary key,
  timeline_id text not null references public.timelines(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 40),
  message text not null check (char_length(message) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index guestbook_timeline_idx on public.guestbook(timeline_id, created_at);

create table public.orders (
  id bigint generated always as identity primary key,
  stripe_session text not null unique,
  timeline_id text references public.timelines(id) on delete set null,
  payment_link text,
  amount_total integer,
  currency text,
  email text,
  shipping jsonb,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
create index orders_timeline_idx on public.orders(timeline_id);

create table public.app_secrets (name text primary key, value text not null);

alter table public.timelines enable row level security;
alter table public.guestbook enable row level security;
alter table public.orders enable row level security;
alter table public.app_secrets enable row level security;
revoke all on public.timelines, public.guestbook, public.orders, public.app_secrets from anon, authenticated;

-- helpers
create or replace function public._rand_id(n int) returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(b, i) % 31), 1), '')
  from (select extensions.gen_random_bytes(n) b) x, generate_series(0, n - 1) i;
$$;

create or replace function public._clean_photos(p jsonb) returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(v), '{}') from (
    select v from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) v
    where v ~ '^u/[a-z0-9]{6,40}/[a-z0-9]{6,40}\.(jpg|png|webp)$' limit 12) s;
$$;

create or replace function public.create_timeline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_key text;
begin
  if (select count(*) from public.timelines where created_at > now() - interval '1 minute') > 60 then
    raise exception 'busy';
  end if;
  v_key := public._rand_id(24);
  loop
    v_id := public._rand_id(8);
    exit when not exists (select 1 from public.timelines where id = v_id);
  end loop;
  insert into public.timelines (id, name, kind, home_date, birth_date, city, lat, lon, memorial, passed_date, photos, edit_key_hash)
  values (v_id, left(trim(p->>'name'), 24), p->>'kind', (p->>'home_date')::date, nullif(p->>'birth_date','')::date,
          nullif(left(trim(coalesce(p->>'city','')), 60), ''), (p->>'lat')::float8, (p->>'lon')::float8,
          coalesce((p->>'memorial')::boolean, false), nullif(p->>'passed_date','')::date,
          public._clean_photos(p->'photos'), encode(extensions.digest(v_key, 'sha256'), 'hex'));
  return jsonb_build_object('id', v_id, 'key', v_key);
end $$;

create or replace function public.update_timeline(p_id text, p_key text, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.timelines set
    name = left(trim(p->>'name'), 24), kind = p->>'kind', home_date = (p->>'home_date')::date,
    birth_date = nullif(p->>'birth_date','')::date, city = nullif(left(trim(coalesce(p->>'city','')), 60), ''),
    lat = (p->>'lat')::float8, lon = (p->>'lon')::float8,
    memorial = coalesce((p->>'memorial')::boolean, false), passed_date = nullif(p->>'passed_date','')::date,
    photos = public._clean_photos(p->'photos'), updated_at = now()
  where id = p_id and edit_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.get_timeline(p_id text, p_key text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'home_date', t.home_date, 'birth_date', t.birth_date,
    'city', t.city, 'lat', t.lat, 'lon', t.lon, 'memorial', t.memorial, 'passed_date', t.passed_date, 'photos', to_jsonb(t.photos),
    'paid', exists (select 1 from public.orders o where o.timeline_id = t.id and o.status = 'paid'),
    'owner', p_key is not null and t.edit_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex'))
  from public.timelines t where t.id = p_id;
$$;

create or replace function public.add_guestbook(p_id text, p_author text, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.guestbook;
begin
  if not exists (select 1 from public.timelines where id = p_id) then raise exception 'not found'; end if;
  if (select count(*) from public.guestbook where timeline_id = p_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'busy';
  end if;
  insert into public.guestbook (timeline_id, author, message) values (p_id, left(trim(p_author), 40), left(trim(p_message), 500)) returning * into r;
  return jsonb_build_object('id', r.id, 'author', r.author, 'message', r.message, 'created_at', r.created_at);
end $$;

create or replace function public.get_guestbook(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'author', author, 'message', message, 'created_at', created_at) order by created_at), '[]'::jsonb)
  from public.guestbook where timeline_id = p_id and not hidden;
$$;

create or replace function public.hide_guestbook(p_id text, p_key text, p_entry bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.guestbook g set hidden = true from public.timelines t
  where g.id = p_entry and g.timeline_id = p_id and t.id = p_id and t.edit_key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.record_order(p_secret text, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'webhook' and value = p_secret) then raise exception 'denied'; end if;
  insert into public.orders (stripe_session, timeline_id, payment_link, amount_total, currency, email, shipping)
  values (p->>'session', (select id from public.timelines where id = p->>'timeline_id'), p->>'payment_link',
          (p->>'amount_total')::int, p->>'currency', p->>'email', p->'shipping')
  on conflict (stripe_session) do nothing;
  return true;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_timeline(jsonb), public.update_timeline(text, text, jsonb), public.get_timeline(text, text),
  public.add_guestbook(text, text, text), public.get_guestbook(text), public.hide_guestbook(text, text, bigint),
  public.record_order(text, jsonb) to anon, authenticated;

-- The server-to-database secret. Read it once with:
--   select value from public.app_secrets where name = 'webhook';
-- and store it as HOMEDAY_DB_SECRET on the host. Never commit the value.
insert into public.app_secrets (name, value) values ('webhook', encode(extensions.gen_random_bytes(24), 'hex'));

-- photos: public read by URL, anonymous upload of small images under u/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 4194304, array['image/jpeg','image/png','image/webp']);
create policy "anon upload photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos' and name ~ '^u/[a-z0-9]{6,40}/[a-z0-9]{6,40}\.(jpg|png|webp)$');
