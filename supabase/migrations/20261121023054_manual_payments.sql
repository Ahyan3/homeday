-- Manual GCash/Maya payments, for before PayMongo is live: the buyer pays Homeday's QR code and
-- submits the wallet's reference number; the owner checks the wallet app and confirms or rejects
-- the order on /admin. A confirmed order unlocks the keepsake like a PayMongo payment.
alter table public.orders
  add column payer_name text,
  add column payer_ref text,
  add column reviewed_at timestamptz;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'underpaid', 'rejected'));
alter table public.orders add constraint orders_provider_check
  check (provider in ('stripe', 'paymongo', 'manual'));
-- one wallet reference number can only be used for one live order
create unique index orders_manual_ref_idx on public.orders (upper(payer_ref))
  where provider = 'manual' and status <> 'rejected';

-- where to tell the owner about new manual payments (used only once Resend is set up)
insert into public.app_secrets (name, value) values ('owner_email', 'ahyanromano02@gmail.com') on conflict (name) do nothing;

create or replace function public._admin_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_key, '') <> '' and exists (select 1 from public.app_secrets
    where name = 'admin_key_hash' and value = encode(extensions.digest(p_key, 'sha256'), 'hex'));
$$;

-- buyer: "I've paid ₱699 to your QR, here is the reference number"
create or replace function public.submit_manual_payment(p_id text, p_item text, p_name text, p_email text, p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.timelines; nm text := trim(coalesce(p_name, '')); em text := lower(trim(coalesce(p_email, '')));
        rf text := upper(regexp_replace(coalesce(p_ref, ''), '[\s-]', '', 'g')); refno text; site text; owner text;
begin
  select * into t from public.timelines where id = p_id;
  if not found then raise exception 'no timeline'; end if;
  if p_item not in ('digital', 'gift') then raise exception 'bad item'; end if;
  if char_length(nm) not between 2 and 80 then raise exception 'bad name'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'bad email'; end if;
  if rf !~ '^[A-Z0-9]{8,30}$' then raise exception 'bad reference'; end if;
  if exists (select 1 from public.orders where provider = 'manual' and status <> 'rejected' and upper(payer_ref) = rf) then
    raise exception 'reference used';
  end if;
  if (select count(*) from public.orders where provider = 'manual' and timeline_id = p_id and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.orders where provider = 'manual' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many';
  end if;
  refno := 'HD-' || p_id || '-' || p_item || '-' || public._rand_id(8);
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, provider, status, email, payer_name, payer_ref)
  values (refno, p_id, p_item, 69900, 'PHP', 'manual', 'pending', em, nm, rf);

  select value into site from public.app_secrets where name = 'site_url';
  select value into owner from public.app_secrets where name = 'owner_email';
  if owner is not null then
    perform public._send_email(owner, 'New GCash/Maya payment to check: ' || rf,
      public._email_shell('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:22px">Check a payment of ₱699</h1>'
        || '<p style="font-size:17px;line-height:1.5;margin:0 0 16px">' || public._esc(nm) || ' (' || public._esc(em) || ') says they paid. Reference: <b>' || rf || '</b>.</p>'
        || '<p style="margin:0"><a href="' || site || '/admin" style="color:#14302A">Confirm or reject it</a></p>', site || '/admin'), site || '/admin');
  end if;
  return jsonb_build_object('reference', refno);
end $$;

-- keepsake page: is a manual payment for this timeline waiting to be checked?
create or replace function public.manual_pending(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders where timeline_id = p_id and provider = 'manual' and status = 'pending');
$$;

-- owner: payments waiting to be checked, then the 30 most recent decisions
create or replace function public.admin_orders(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  return jsonb_build_object(
    'pending', coalesce((select jsonb_agg(x order by x.created_at) from (
      select o.id, o.created_at, o.item, o.expected_amount, o.payer_name, o.payer_ref, o.email, o.timeline_id, t.name as pet
      from public.orders o left join public.timelines t on t.id = o.timeline_id
      where o.provider = 'manual' and o.status = 'pending') x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by x.reviewed_at desc) from (
      select o.id, o.reviewed_at, o.status, o.item, o.payer_name, o.payer_ref, o.timeline_id, t.name as pet
      from public.orders o left join public.timelines t on t.id = o.timeline_id
      where o.provider = 'manual' and o.status <> 'pending' order by o.reviewed_at desc nulls last limit 30) x), '[]'::jsonb));
end $$;

-- owner: confirm (unlocks the keepsake) or reject a manual payment
create or replace function public.admin_review(p_key text, p_order bigint, p_ok boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.timelines; site text; link text;
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  select * into o from public.orders where id = p_order and provider = 'manual' for update;
  if not found then return 'unknown'; end if;
  if o.status <> 'pending' then return o.status; end if;
  update public.orders set status = case when p_ok then 'paid' else 'rejected' end,
    amount_total = case when p_ok then o.expected_amount end, paid_at = case when p_ok then now() end,
    livemode = true, reviewed_at = now()
  where id = o.id;
  if p_ok then
    select * into t from public.timelines where id = o.timeline_id;
    select value into site from public.app_secrets where name = 'site_url';
    link := site || '/keepsake/' || o.timeline_id;
    perform public._send_email(o.email, 'Your Homeday keepsake for ' || public._plain(t.name) || ' is ready',
      public._email_shell('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:24px">Payment received. Your keepsake is ready.</h1>'
        || '<p style="font-size:17px;line-height:1.5;margin:0 0 20px">Thank you. The poster and certificate for ' || public._esc(t.name) || ' are unlocked. Print them at home or save them as a PDF.</p>'
        || '<p style="margin:0"><a href="' || link || '" style="display:inline-block;background:#D3E24A;color:#14302A;border:1.5px solid #14302A;border-radius:999px;padding:11px 20px;font-family:Arial,sans-serif;font-weight:700;text-decoration:none">Open the keepsake</a></p>', site || '/help'), site || '/help');
  end if;
  return case when p_ok then 'paid' else 'rejected' end;
end $$;

revoke execute on function public._admin_ok(text), public.submit_manual_payment(text, text, text, text, text),
  public.manual_pending(text), public.admin_orders(text), public.admin_review(text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.submit_manual_payment(text, text, text, text, text), public.manual_pending(text),
  public.admin_orders(text), public.admin_review(text, bigint, boolean) to anon, authenticated;
