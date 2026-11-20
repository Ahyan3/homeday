# Security

## Reporting a problem

Email ahyanromano02@gmail.com with "Homeday security" in the subject. Please don't open a public issue for security problems.

## How secrets are handled

- **Never committed:** `HOMEDAY_DB_SECRET`, `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` live only in the host's encrypted settings, and locally in `.dev.vars` (ignored by git).
- **Public by design:** the Supabase URL and anon key in `lib/shared.js` and `public/assets/core.js`. The anon role can only call the functions listed in [docs/database.md](docs/database.md); every table is closed to it.
- **Edit keys:** stored only as SHA-256 hashes. A timeline's edit link is the only way to change it.
- **Payments:** the webhook verifies PayMongo's HMAC-SHA256 signature in constant time, and the database refuses to mark an order paid if the amount is below the price recorded at checkout.

## If a secret leaks

- `HOMEDAY_DB_SECRET`: `update public.app_secrets set value = encode(extensions.gen_random_bytes(24), 'hex') where name = 'webhook';` then put the new value on the host and redeploy.
- PayMongo keys: roll them in PayMongo → Developers, update the host, redeploy.
