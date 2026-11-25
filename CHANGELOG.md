# Changelog

## 1.6.0: 25 November 2026

### Added
- Gallery of real timelines on the home page. Owners offer theirs from Share; nothing shows until it's approved on `/admin`, and owners can take it down any time.
- Visitor numbers on `/admin`: the last 14 days of visitors, people abroad, Taglish use, timelines saved, buy taps and payments. Daily totals only, with no cookies or IP addresses; Do Not Track is respected and `/admin` isn't counted.
- "Send feedback" box in the footer of the home and keepsake pages; messages appear on `/admin`.

### Changed
- Privacy, help and security pages describe the gallery and how visits are counted.
- The admin page copes with an empty gallery or stats answer instead of stopping.

## 1.5.0: 21 November 2026

### Added
- Taglish version of the site: home, timeline, sharing, guestbook, reminders, keepsake page and QR payments. A switch in the header changes language and is remembered; browsers set to Filipino start in Taglish.
- Test that every translation keeps its placeholders and that simple `H.t()` calls have a translation.

### Changed
- On phones the header keeps the language switch visible.
- The home page says "A keepsake costs money" instead of mentioning prints and books, which aren't on sale yet.

## 1.4.0: 21 November 2026

### Added
- Weekly encrypted backup: every Sunday a GitHub job copies all timelines, guestbook messages, orders, reminders and photos, encrypts them with a passphrase and keeps them for 90 days.
- `backup_export` database function, locked behind a backup key stored only as a hash.
- `scripts/backup-to-sql.mjs` and restore steps in `docs/operations.md`. Restores keep original ids and only add missing rows.

## 1.3.1: 21 November 2026

### Changed
- QR payments switched on, with GCash, Maya and GoTyme codes to choose from. Payments record which code was used.

## 1.3.0: 21 November 2026

### Added
- Payments by QR code (GCash, Maya or GoTyme, all QR Ph), checked by hand, for before PayMongo is live. Buyers pick a code, pay, and send the reference number; the owner confirms it on `/admin` and the keepsake unlocks. QR images are cropped to hide phone and account numbers.
- Admin page with an admin key stored only as a hash. Payments need two taps to confirm or reject.
- The keepsake page says when a payment is being checked, and unlocks by itself once it's confirmed.

### Changed
- Order emails no longer carry the reminder unsubscribe footer.
- Help, terms, privacy, refunds and security pages explain QR payments.

## 1.2.0: 21 November 2026

### Added
- Visitors outside the Philippines see prices in US dollars (US$12), with a switch between pesos and dollars. US visitors also see Fahrenheit, inches of rain and US-style dates.
- Dollar charging for overseas card buyers, off until `USD_CHARGING=1` (needs PayMongo's USD card acceptance). Orders now record their currency, and payments must match it.
- Help, Terms of service, Privacy policy, Refund policy and Security pages, a footer linking them on every page, and `/.well-known/security.txt`.
- Security headers on Vercel and Cloudflare: content security policy, HSTS, frame blocking, permissions policy. Timelines and keepsakes are marked `noindex` on Vercel too.

### Changed
- Fonts are served from the site instead of Google Fonts.
- Inline scripts moved into files so the content security policy can block injected scripts.

## 1.1.0: 21 November 2026

### Added
- Homeday reminders: timeline owners can get one email a year, a week before the homeday. Never sent for memorials. Sent daily from the database through Resend, with one-click unsubscribe. Switched off until a Resend key is set.
- Unsubscribe page.

### Fixed
- The share image was missing from the Vercel deployment, so shared links showed no picture.

### Removed
- The unused Stripe order function.

## 1.0.0: 21 November 2026

First full version, ready for the 5 December launch.

### Added
- Timelines from one date: milestones, human-years age, what's next, memorial mode.
- The day they came home: moon phase, NASA POWER weather, Billboard Hot 100 number one.
- Saving with share and edit links, photos (up to 12), guestbook with owner moderation.
- Printable keepsake (poster and certificate) unlocked after payment.
- PayMongo checkout in pesos (GCash, Maya, QR Ph, card) with signed webhook and amount check.
- Prints and books with a Philippine shipping form, switched off by default.
- Terms, privacy and refunds page; not-found page; share image.
- Cloudflare Pages support alongside Vercel, share previews with the pet's name, daily keep-awake job.
- Server tests and CI.

### Changed
- Weather moved from Open-Meteo to NASA POWER, and place lookup to OpenStreetMap, both free for business use.
- Payments moved from Stripe links to PayMongo, since Stripe doesn't accept Philippine businesses.
