# Database

Supabase Postgres holds four tables and a photo bucket. The browser never touches the tables: every table has row level security on, no policies, and no grants for `anon` or `authenticated`. Instead, the browser and the server call a small set of `SECURITY DEFINER` functions, each with `search_path = ''`.

## Tables

| Table | Holds |
| --- | --- |
| `timelines` | One row per saved timeline. The edit key is stored only as a SHA-256 hash |
| `guestbook` | Messages on a timeline; `hidden` when the owner removes one |
| `orders` | One row per checkout: `pending` → `paid` (or `underpaid`) |
| `number_ones` | Billboard Hot 100 number one for every chart week since 1958 |
| `app_secrets` | The server-to-database secret (`webhook`) |

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
| `record_order(secret, p)` | Unused | Left from the first, Stripe-based version |

The functions that take `secret` refuse to run unless it matches `app_secrets.webhook`. That value lives only in the database and in the host's `HOMEDAY_DB_SECRET`.

Supabase's security advisor flags the public functions as "callable without signing in". That is intended: they are the site's API, and each one checks its own inputs.

## Migrations

Run in order from `supabase/migrations/`:

1. `20261120125633_homeday_core.sql`: tables, browser functions, photo bucket
2. `20261120130542_number_ones.sql`: song table and `song_on`
3. `20261120140017_paymongo_orders.sql`: pending orders and the amount check

Then load the songs with `supabase/seed/number_ones.sql`.
