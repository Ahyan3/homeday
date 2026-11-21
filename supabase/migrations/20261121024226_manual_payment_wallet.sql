-- Buyers pick which of the owner's QR codes they paid (GCash, Maya or GoTyme), so the owner knows
-- which app to check. All three are QR Ph codes, so any bank or e-wallet app can pay any of them.
alter table public.orders add column payer_wallet text check (payer_wallet in ('gcash', 'maya', 'gotyme'));

drop function public.submit_manual_payment(text, text, text, text, text);
create function public.submit_manual_payment(p_id text, p_item text, p_name text, p_email text, p_ref text, p_wallet text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.timelines; nm text := trim(coalesce(p_name, '')); em text := lower(trim(coalesce(p_email, '')));
        rf text := upper(regexp_replace(coalesce(p_ref, ''), '[\s-]', '', 'g')); wl text := lower(nullif(trim(coalesce(p_wallet, '')), ''));
        refno text; site text; owner text;
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
  refno := 'HD-' || p_id || '-' || p_item || '-' || public._rand_id(8);
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, provider, status, email, payer_name, payer_ref, payer_wallet)
  values (refno, p_id, p_item, 69900, 'PHP', 'manual', 'pending', em, nm, rf, wl);

  select value into site from public.app_secrets where name = 'site_url';
  select value into owner from public.app_secrets where name = 'owner_email';
  perform public._send_email(owner, 'Check a ₱699 payment in ' || label || ' app: ' || rf,
    public._order_email('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:22px">Check a payment of ₱699</h1>'
      || '<p style="font-size:17px;line-height:1.5;margin:0 0 16px">' || public._esc(nm) || ' (' || public._esc(em) || ') says they paid your '
      || label || ' QR code for ' || public._esc(t.name) || '''s keepsake. Reference number: <b>' || rf || '</b>.</p>'
      || '<p style="margin:0"><a href="' || site || '/admin" style="color:#14302A">Confirm or reject it</a></p>'), null);
  return jsonb_build_object('reference', refno);
end $$;

create or replace function public.admin_orders(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  return jsonb_build_object(
    'pending', coalesce((select jsonb_agg(x order by x.created_at) from (
      select o.id, o.created_at, o.item, o.expected_amount, o.payer_name, o.payer_ref, o.payer_wallet, o.email, o.timeline_id, t.name as pet
      from public.orders o left join public.timelines t on t.id = o.timeline_id
      where o.provider = 'manual' and o.status = 'pending') x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by x.reviewed_at desc) from (
      select o.id, o.reviewed_at, o.status, o.item, o.payer_name, o.payer_ref, o.payer_wallet, o.timeline_id, t.name as pet
      from public.orders o left join public.timelines t on t.id = o.timeline_id
      where o.provider = 'manual' and o.status <> 'pending' order by o.reviewed_at desc nulls last limit 30) x), '[]'::jsonb));
end $$;

revoke execute on function public.submit_manual_payment(text, text, text, text, text, text) from public;
grant execute on function public.submit_manual_payment(text, text, text, text, text, text) to anon, authenticated;
