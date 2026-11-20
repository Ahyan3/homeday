# Operations

Everyday tasks. SQL runs in Supabase → SQL editor.

## See recent orders

```sql
select created_at, reference, item, status, amount_total / 100.0 as pesos, email, timeline_id
from public.orders
order by created_at desc
limit 20;
```

`pending` means the buyer opened checkout but didn't pay. `underpaid` means PayMongo reported less than the price; check the payment in PayMongo before doing anything.

## Weekly numbers

```sql
select
  (select count(*) from public.timelines where created_at > now() - interval '7 days') as new_timelines,
  (select count(*) from public.guestbook where created_at > now() - interval '7 days') as guestbook_messages,
  (select count(*) from public.orders where status = 'paid' and paid_at > now() - interval '7 days') as sales,
  (select coalesce(sum(amount_total), 0) / 100.0 from public.orders where status = 'paid' and paid_at > now() - interval '7 days') as pesos;
```

## Refund a keepsake

1. Refund the payment in PayMongo's dashboard.
2. Lock the keepsake again:

```sql
update public.orders set status = 'refunded' where reference = 'HD-…';
```

## Unlock a keepsake by hand

If a payment went through but the webhook failed, find the order by its reference (in the PayMongo receipt) and run:

```sql
update public.orders set status = 'paid', paid_at = now() where reference = 'HD-…';
```

## Delete a timeline

When someone asks, as promised on the terms page (within 7 days):

```sql
delete from public.timelines where id = 'abcd2345';  -- guestbook messages go with it
```

Then delete its photos in Supabase → Storage → `photos` → the folder named in the timeline's `photos` list.

## Turn on prints and books

1. In `public/index.html`, remove `hidden` from the **Framed print** and **Memory book** rows.
2. Set `PRINTS_ENABLED` = `1` on the host and redeploy.
3. Shipping addresses arrive in `orders.shipping`. Fulfil with a local print shop after the payment clears.

## Change prices

Edit both, then deploy:

- `lib/shared.js`: what PayMongo charges, in centavos (₱699 = `69900`)
- `public/index.html` (and `public/keepsake.html` for the Buy button): what the page shows

## Change the owner details

Name and contact email are in `public/terms.html`, under "Who runs Homeday".
