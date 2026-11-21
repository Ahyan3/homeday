-- Orders remember their currency (PHP, or USD for overseas card buyers once dollar charging is on).
-- A payment only counts if it is in the order's currency and covers the price recorded at checkout.
update public.orders set currency = 'PHP' where currency is null or currency not in ('PHP', 'USD');
alter table public.orders alter column currency set default 'PHP';
alter table public.orders add constraint orders_currency_check check (currency in ('PHP', 'USD'));

create or replace function public.create_order(p_secret text, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cur text := upper(coalesce(p->>'currency', 'PHP'));
begin
  if not exists (select 1 from public.app_secrets where name = 'webhook' and value = p_secret) then raise exception 'denied'; end if;
  if cur not in ('PHP', 'USD') then raise exception 'bad currency'; end if;
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, shipping, provider, status)
  values (p->>'reference', (select id from public.timelines where id = p->>'timeline_id'), p->>'item',
          (p->>'amount')::int, cur, p->'shipping', 'paymongo', 'pending');
  return true;
end $$;

create or replace function public.mark_order_paid(p_secret text, p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if not exists (select 1 from public.app_secrets where name = 'webhook' and value = p_secret) then raise exception 'denied'; end if;
  select * into o from public.orders where reference = p->>'reference' for update;
  if not found then return 'unknown'; end if;
  if o.status = 'paid' then return 'already'; end if;
  if upper(coalesce(p->>'currency', 'PHP')) <> coalesce(o.currency, 'PHP')
     or coalesce((p->>'amount')::int, 0) < o.expected_amount then
    update public.orders set status = 'underpaid', amount_total = (p->>'amount')::int where id = o.id;
    return 'underpaid';
  end if;
  update public.orders set status = 'paid', amount_total = (p->>'amount')::int, email = p->>'email',
    payment_id = p->>'payment_id', stripe_session = coalesce(stripe_session, p->>'session'), paid_at = now(),
    livemode = (p->>'livemode')::boolean,
    shipping = coalesce(shipping, p->'billing')
  where id = o.id;
  return 'paid';
end $$;

revoke execute on function public.create_order(text, jsonb), public.mark_order_paid(text, jsonb) from public;
grant execute on function public.create_order(text, jsonb), public.mark_order_paid(text, jsonb) to anon, authenticated;
