-- Price test: while it's on, half of browsers see the digital keepsake (and gift) at ₱399 instead of ₱699.
-- The owner starts and stops it on /admin; the database decides what's charged, so a visitor can't pick
-- the lower price while the test is off. Results compare visitors, buy taps, payments and pesos per variant.
alter table public.orders add column price_variant text check (price_variant in ('a', 'b'));

create table public.price_test_daily (
  day date not null,
  variant text not null check (variant in ('a', 'b')),
  event text not null check (event in ('visitor', 'buy_click', 'pay_open')),
  n int not null default 0,
  primary key (day, variant, event)
);
alter table public.price_test_daily enable row level security;
revoke all on public.price_test_daily from anon, authenticated;

insert into public.app_secrets (name, value) values ('price_test', 'off') on conflict (name) do nothing;

create or replace function public._price_test_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'on' from public.app_secrets where name = 'price_test'), false);
$$;

create or replace function public.site_flags() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('price_test', public._price_test_on());
$$;

-- the 5-argument counter also records the price variant while the test runs
create or replace function public.hit(p_event text, p_page text, p_region text, p_lang text, p_variant text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.hit(p_event, p_page, p_region, p_lang);
  if public._price_test_on() and p_variant in ('a', 'b') and p_event in ('visitor', 'buy_click', 'pay_open') and p_region = 'PH' then
    insert into public.price_test_daily (day, variant, event, n) values ((now() at time zone 'Asia/Manila')::date, p_variant, p_event, 1)
    on conflict (day, variant, event) do update set n = public.price_test_daily.n + 1 where public.price_test_daily.n < 1000000;
  end if;
end $$;

-- the price a variant pays, in centavos
create or replace function public.price_for(p_item text, p_variant text) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_item in ('digital', 'gift') and p_variant = 'b' and public._price_test_on() then 39900
              when p_item in ('digital', 'gift') then 69900 end;
$$;

create function public.submit_manual_payment(p_id text, p_item text, p_name text, p_email text, p_ref text, p_wallet text, p_variant text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.timelines; nm text := trim(coalesce(p_name, '')); em text := lower(trim(coalesce(p_email, '')));
        rf text := upper(regexp_replace(coalesce(p_ref, ''), '[\s-]', '', 'g')); wl text := lower(nullif(trim(coalesce(p_wallet, '')), ''));
        refno text; site text; owner text; amount int; pv text;
        label text := case lower(coalesce(p_wallet, '')) when 'gcash' then 'GCash' when 'maya' then 'Maya' when 'gotyme' then 'GoTyme' else 'your' end;
begin
  select * into t from public.timelines where id = p_id;
  if not found then raise exception 'no timeline'; end if;
  if p_item not in ('digital', 'gift') then raise exception 'bad item'; end if;
  if char_length(nm) not between 2 and 80 then raise exception 'bad name'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'bad email'; end if;
  if rf !~ '^[A-Z0-9]{8,30}$' then raise exception 'bad reference'; end if;
  if wl is not null and wl not in ('gcash', 'maya', 'gotyme') then raise exception 'bad wallet'; end if;
  if exists (select 1 from public.orders where provider = 'manual' and status <> 'rejected' and upper(payer_ref) = rf) then
    raise exception 'reference used';
  end if;
  if (select count(*) from public.orders where provider = 'manual' and timeline_id = p_id and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.orders where provider = 'manual' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many';
  end if;
  pv := case when public._price_test_on() and p_variant in ('a', 'b') then p_variant end;
  amount := public.price_for(p_item, coalesce(pv, 'a'));
  refno := 'HD-' || p_id || '-' || p_item || '-' || public._rand_id(8);
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, provider, status, email, payer_name, payer_ref, payer_wallet, price_variant)
  values (refno, p_id, p_item, amount, 'PHP', 'manual', 'pending', em, nm, rf, wl, pv);

  select value into site from public.app_secrets where name = 'site_url';
  select value into owner from public.app_secrets where name = 'owner_email';
  perform public._send_email(owner, 'Check a ₱' || (amount / 100) || ' payment in ' || label || ' app: ' || rf,
    public._order_email('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:22px">Check a payment of ₱' || (amount / 100) || '</h1>'
      || '<p style="font-size:17px;line-height:1.5;margin:0 0 16px">' || public._esc(nm) || ' (' || public._esc(em) || ') says they paid your '
      || label || ' QR code for ' || public._esc(t.name) || '''s keepsake. Reference number: <b>' || rf || '</b>.</p>'
      || '<p style="margin:0"><a href="' || site || '/admin" style="color:#14302A">Confirm or reject it</a></p>'), null);
  return jsonb_build_object('reference', refno, 'amount', amount);
end $$;

-- owner: results since the test started, and the on/off switch
create or replace function public.admin_price_test(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := coalesce((select nullif(value, '')::timestamptz from public.app_secrets where name = 'price_test_started_at'), now());
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  return jsonb_build_object('on', public._price_test_on(), 'started_at', since,
    'variants', (select jsonb_agg(x order by x.variant) from (
      select v.variant, case v.variant when 'a' then 69900 else 39900 end as price,
        coalesce((select sum(n) from public.price_test_daily d where d.variant = v.variant and d.event = 'visitor' and d.day >= (since at time zone 'Asia/Manila')::date), 0) as visitors,
        coalesce((select sum(n) from public.price_test_daily d where d.variant = v.variant and d.event = 'buy_click' and d.day >= (since at time zone 'Asia/Manila')::date), 0) as buy_clicks,
        (select count(*) from public.orders o where o.price_variant = v.variant and o.created_at >= since) as orders,
        (select count(*) from public.orders o where o.price_variant = v.variant and o.status = 'paid' and o.created_at >= since) as paid,
        (select coalesce(sum(o.amount_total), 0) from public.orders o where o.price_variant = v.variant and o.status = 'paid' and o.created_at >= since) as revenue_centavos
      from (values ('a'), ('b')) v(variant)) x));
end $$;

create or replace function public.admin_set_price_test(p_key text, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  insert into public.app_secrets (name, value) values ('price_test', case when p_on then 'on' else 'off' end)
  on conflict (name) do update set value = excluded.value;
  if p_on then
    insert into public.app_secrets (name, value) values ('price_test_started_at', now()::text)
    on conflict (name) do update set value = excluded.value;
  end if;
  return p_on;
end $$;

revoke execute on function public._price_test_on(), public.site_flags(), public.hit(text, text, text, text, text), public.price_for(text, text),
  public.submit_manual_payment(text, text, text, text, text, text, text), public.admin_price_test(text), public.admin_set_price_test(text, boolean)
  from public, anon, authenticated;
grant execute on function public.site_flags(), public.hit(text, text, text, text, text), public.price_for(text, text),
  public.submit_manual_payment(text, text, text, text, text, text, text), public.admin_price_test(text), public.admin_set_price_test(text, boolean)
  to anon, authenticated;
