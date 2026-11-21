# Database

Supabase Postgres holds six tables and a photo bucket. The browser never touches the tables: every table has row level security on, no policies, and no grants for `anon` or `authenticated`. Instead, the browser and the server call a small set of `SECURITY DEFINER` functions, each with `search_path = ''`.

## Tables

| Table | Holds |
| --- | --- |
| `timelines` | One row per saved timeline. The edit key is stored only as a SHA-256 hash |
| `guestbook` | Messages on a timeline; `hidden` when the owner removes one |
| `orders` | One row per checkout, with its currency (`PHP` or `USD`): `pending` → `paid` (or `underpaid` when the amount or currency is wrong) |
| `number_ones` | Billboard Hot 100 number one for every chart week since 1958 |
| `reminders` | Emails that get a homeday reminder, with an unsubscribe token and the last year one was sent |
| `app_secrets` | The server-to-database secret (`webhook`), the site address, and the email settings |

Storage bucket `photos` is public for reading by URL. Anyone may upload JPEG, PNG or WebP files up to 4 MB under `u/<random>/<random>.<ext>`; nobody can list or overwrite files.

## Functions the public may call

| Function | Who calls it | What it does |
| --- | --- | --- |
| `create_timeline(p)` | Browser | Saves a timeline; returns its id and edit key. Limited to 60 new timelines a minute site-wide |
| `update_timeline(id, key, p)` | Browser | Changes a timeline if the edit key matches |
| `get_timeline(id, key?)` | Browser, server | Returns a timeline, whether it's paid for, and whether the key is the owner's |
| `add_guestbook(id, author, message)` | Browser | Adds a message. Limited to 30 an hour per timeline |
| `get_guestbook(id)` | Browser | Lists visible messages |
| `hide_guestbook(id, key, entry)` | Browser | Hides a message if the edit key matches |
| `song_on(date)` | Browser | The number one in the chart week containing that date |
| `create_order(secret, p)` | Server | Records a pending order with its expected amount |
| `mark_order_paid(secret, p)` | Server | Marks an order paid, only if the amount covers the expected price. Repeat calls are harmless |
| `add_reminder(id, key, email)` | Browser | Turns on yearly reminders for a living pet, if the edit key matches. Up to 5 emails per timeline |
| `reminder_emails(id, key)` | Browser | Lists a timeline's reminder emails, for the owner only |
| `unsubscribe_reminder(token)` | Browser | Stops reminders from the link in an email |
| `submit_manual_payment(id, item, name, email, ref, wallet?)` | Browser | Records a QR code payment to check, and which QR (GCash, Maya or GoTyme) it was paid to. Each reference number once; 5 an hour per timeline, 60 an hour site-wide |
| `manual_pending(id)` | Browser | Whether a GCash/Maya payment for a timeline is waiting to be checked |
| `admin_orders(key)` / `admin_review(key, order, ok)` | Admin page | Lists payments to check, and confirms or rejects one. Need the admin key, stored only as a hash |

The functions that take `secret` refuse to run unless it matches `app_secrets.webhook`. That value lives only in the database and in the host's `HOMEDAY_DB_SECRET`.

Supabase's security advisor flags the public functions as "callable without signing in". That is intended: they are the site's API, and each one checks its own inputs.

## Migrations

Run in order from `supabase/migrations/`:

1. `20261120125633_homeday_core.sql`: tables, browser functions, photo bucket
2. `20261120130542_number_ones.sql`: song table and `song_on`
3. `20261120140017_paymongo_orders.sql`: pending orders and the amount check
4. `20261120182151_homeday_reminders.sql`: reminder emails and the daily job that sends them
5. `20261120182245_reminder_plain_subjects.sql`: plain-text email subjects
6. `20261120182334_drop_stripe_record_order.sql`: removes the unused Stripe function
7. `20261121021907_order_currency.sql`: orders store their currency; payments must match it
8. `20261121023054_manual_payments.sql`: GCash/Maya payments checked by hand, and the admin functions
9. `20261121023121_order_emails_plain.sql`: order emails without the reminder footer
10. `20261121024226_manual_payment_wallet.sql`: which QR code (GCash, Maya or GoTyme) a payment went to

After running them, set the admin key: see [operations](operations.md#take-qr-code-payments-by-hand).

Then load the songs with `supabase/seed/number_ones.sql`.

## Reminder emails

Every day at 9 am Philippine time, the `homeday-reminders` job (pg_cron) runs `send_due_reminders()`. It finds pets whose homeday is one to seven days away, skips memorials and anyone already emailed this year, and sends up to 90 emails through Resend with pg_net, which keeps it inside Resend's free limit of 100 a day. Pets who came home on 29 February get their reminder for 1 March in other years. Every email has a one-click unsubscribe link and header.

Nothing is sent until `resend_api_key` and `reminder_from` are set in `app_secrets`. See [operations](operations.md#switch-on-reminder-emails).
