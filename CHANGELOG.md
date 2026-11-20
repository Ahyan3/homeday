# Changelog

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
