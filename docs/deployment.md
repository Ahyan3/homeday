# Deployment

Homeday runs on **Cloudflare Pages** (free plan, business use allowed) with **Supabase** (free plan) for data and photos. The same code also deploys to Vercel, where the site lives until the move.

Allow about 30 minutes.

## 1. Create the Cloudflare site

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) and open **Workers & Pages**.
2. Click **Create**, choose the **Pages** tab, then **Connect to Git**, and pick `Ahyan3/homeday`.
3. Use these build settings:
   - Framework preset: **None**
   - Build command: leave empty
   - Build output directory: `public`
4. Click **Save and Deploy**. The site appears at `https://<project>.pages.dev`.

Every push to `main` deploys automatically from now on.

## 2. Add the secrets

In the Cloudflare project, open **Settings → Variables and Secrets** and add these for **Production**, each as type **Secret**:

| Name | Where to get it |
| --- | --- |
| `HOMEDAY_DB_SECRET` | In Supabase's SQL editor: `select value from public.app_secrets where name = 'webhook';` |
| `PAYMONGO_SECRET_KEY` | PayMongo → Developers → API keys. Start with `sk_test_…` |
| `PAYMONGO_WEBHOOK_SECRET` | From the webhook you create in step 3 |

Then open **Deployments** and click **Retry deployment** on the latest one, so the secrets take effect.

## 3. Connect PayMongo

1. In PayMongo, open **Developers → Webhooks** and add the endpoint `https://<project>.pages.dev/api/paymongo-webhook`.
2. Tick the event `checkout_session.payment.paid`.
3. Copy the webhook's secret into Cloudflare as `PAYMONGO_WEBHOOK_SECRET`, then redeploy.

## 4. Test a payment

1. Open the site, make a timeline, and click **Buy** on the digital keepsake.
2. Pay with PayMongo's test details.
3. You should land on the thank-you page, and **Open the keepsake** should show it without the watermark within a minute.
4. In Supabase, check the order: `select reference, status, amount_total from public.orders order by created_at desc limit 5;`

## 5. Go live

1. Once PayMongo verifies your account, replace `PAYMONGO_SECRET_KEY` with the `sk_live_…` key.
2. Create a second webhook in PayMongo's live mode with the same URL and event, and put its secret in `PAYMONGO_WEBHOOK_SECRET`.
3. Redeploy, then make one real ₱699 purchase and refund it from PayMongo's dashboard.

## 6. Keep the database awake

Supabase's free plan pauses a database after 7 days without activity. The **Keep database awake** workflow in `.github/workflows/keepalive.yml` makes one small request every day at 11:17 am Philippine time. In GitHub, open **Actions**, enable workflows if asked, and run it once by hand to check it works.

## 6b. Turn on the weekly backup

Add the two backup secrets on GitHub and run the job once. See [operations](operations.md#weekly-backup).

## 7. Retire Vercel

Vercel's free Hobby plan is for non-commercial use only, so once Cloudflare works, delete or pause the Vercel project.

## Setting up a new database from scratch

1. Create a Supabase project.
2. Run the files in `supabase/migrations/` in order, in the SQL editor.
3. Run `supabase/seed/number_ones.sql` (it has three steps).
4. Update `SUPABASE_URL` and `SUPABASE_ANON` in `lib/shared.js` and `public/assets/core.js`, and the URL and key in `.github/workflows/keepalive.yml`.
