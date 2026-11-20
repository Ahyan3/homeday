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

## Switch on reminder emails

Sign-ups already work; emails go out once these are set. You need your own domain first, because Resend only sends to other people from a verified domain.

1. Create a free account at [resend.com](https://resend.com) (100 emails a day, 3,000 a month).
2. In Resend, add your domain and put the DNS records it shows into your domain's DNS. Wait until it says **Verified**.
3. Create an API key with **Sending access** only.
4. In Supabase, open **SQL Editor** and run, with your own values:

```sql
insert into public.app_secrets (name, value) values
  ('resend_api_key', 're_your_key_here'),
  ('reminder_from', 'Homeday <hello@yourdomain.com>')
on conflict (name) do update set value = excluded.value;
```

5. Check tomorrow's queue with `select * from public.due_reminders();`, and after 9 am see what was sent in Resend's **Emails** page.

To pause emails, run `delete from public.app_secrets where name = 'resend_api_key';`.

## Change the site address

When the site moves (to Cloudflare, or to your own domain), update the address used in email links:

```sql
update public.app_secrets set value = 'https://yourdomain.com' where name = 'site_url';
```

