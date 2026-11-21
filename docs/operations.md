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

Change all three, then deploy:

- `lib/shared.js`: what PayMongo charges. `PRICES` in centavos (₱699 = `69900`), `USD_PRICES` in US cents (US$12 = `1200`)
- `public/assets/core.js`, `H.PRICES`: what visitors see, in pesos and in dollars
- The fallback text in `public/index.html` and `public/keepsake.html`, shown for a moment before the scripts load

## Take GCash or Maya payments by hand

Until PayMongo is live, buyers can pay by scanning your GCash or Maya QR code. They send the reference number from their receipt, and you confirm it on the admin page. Confirming unlocks their keepsake and, once Resend is set up, emails them the link. When `PAYMONGO_SECRET_KEY` is set, the site switches to PayMongo checkout by itself.

**Turn it on:** save your QR code as `public/assets/pay/qr.png`, set `H.MANUAL_PAY.on` to `true` in `public/assets/core.js` (and `account` to the name buyers should see, such as `"Ryan R. · GCash"`), then deploy.

**Every day (lunch break and evening):**

1. Open `/admin` on your phone. The first time, paste your admin key; the browser remembers it.
2. For each payment, open GCash or Maya and find the reference number in your transactions. Check the amount is ₱699.
3. Tap **Received, unlock it** twice. If you can't find the payment, tap **Not in my account** twice and email the buyer.

The site promises buyers an answer within a day. Each reference number can only be used once, and each timeline can send at most 5 payments an hour.

**Change the admin key:** make a long random key, then in the Supabase SQL editor run
`update public.app_secrets set value = encode(extensions.digest('YOUR-NEW-KEY', 'sha256'), 'hex') where name = 'admin_key_hash';`
Only its hash is stored, so a lost key can't be recovered, only replaced.

## Charge overseas buyers in US dollars

Visitors outside the Philippines already see US$12. Until this is switched on, their card is charged ₱699 and the page says so.

1. Email PayMongo support and ask them to turn on **USD card acceptance** for your account.
2. When they confirm, add `USD_CHARGING` = `1` to the host's environment variables and redeploy.
3. Buy one keepsake from abroad (or with a VPN) in test mode and check the order shows `USD` and `1200` in `orders`.

Orders store their currency, and a payment only unlocks a keepsake if its currency and amount match the order.

## Change the owner details

The name and contact email appear on the help, terms, privacy, refunds and security pages, in their footers, in `public/keepsake.html`, `thanks.html`, `404.html` and `unsubscribe.html`, and in `public/.well-known/security.txt`. Search the `public/` folder for the old email and replace it everywhere.

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

