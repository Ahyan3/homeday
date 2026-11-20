-- PayMongo orders: an order is created as 'pending' when checkout opens, and the webhook marks it
-- 'paid' only if the amount paid covers the price recorded at checkout.

alter table public.orders alter column stripe_session drop not null;
alter table public.orders add column reference text unique,
  add column item text check (item in ('digital','gift','print','book')),
  add column expected_amount integer,
  add column provider text not null default 'stripe',
  add column payment_id text,
  add column paid_at timestamptz,
  add column livemode boolean;
alter table public.orders alter column status set default 'pending';

create or replace function public.create_order(p_secret text, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_secrets where name = 'webhook' and value = p_secret) then raise exception 'denied'; end if;
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, shipping, provider, status)
  values (p->>'reference', (select id from public.timelines where id = p->>'timeline_id'), p->>'item',
          (p->>'amount')::int, 'PHP', p->'shipping', 'paymongo', 'pending');
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
  if coalesce((p->>'amount')::int, 0) < o.expected_amount then
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
