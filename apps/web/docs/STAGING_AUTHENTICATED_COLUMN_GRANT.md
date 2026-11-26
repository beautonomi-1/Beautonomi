# Staging walkthrough — authenticated private column grant

Deploy `apps/web` **before** applying migration `10300_authenticated_provider_private_column_select.sql` on the environment.

Push migration to staging only after deploy:

```bash
supabase db push --remote=<staging-ref> --include-all
```

Do **not** use `scripts/supabase-push-staging.ps1` (linked project).

## Checklist

Use one login that is both a customer and owner of two branches.

- [ ] Save and reload profile, business, business details, billing, and payment settings
- [ ] Salon dashboard and usage summary; appointment settings, tips, booking link
- [ ] Reply to a review; rate customer; leave review as customer; gift-card settings
- [ ] Load both branches (including mobile base); save one location
- [ ] Team, staff pay, clock-in with PIN, client list
- [ ] Wishlist, book, pay at another salon; recently viewed; block salon; account status; signed-in search
- [ ] Client list, create client, client conversations; guest checkout; on-demand accept; custom offer quote/accept; test payment / Paystack webhook
- [ ] Cart, orders, returns; product sale; VAT report; tax rate; Paystack terminal request
- [ ] Customer booking, messages (customer + salon), upload, mark read; inbox thread shows salon phone
- [ ] Custom requests; cancel membership and recurring series; courier quote and book shipment
- [ ] Personal data export includes owned salon bookings
- [ ] `/provider` as customer owner and as staff (no redirect to onboarding)
- [ ] Provider API with staff account still `customer` role (bearer + cookie)
- [ ] Upgrade freelancer (`subscription_plan_id`)
- [ ] Admin dashboard counts, analytics export, featured city, previous-software count
- [ ] Partner profile `noindex` when opted out; salon lead duplicate; admin referrer search

## Post-check

- [ ] Signed-in user still sees listing columns for another active salon
- [ ] Direct DB/API read of deny-list columns as `authenticated` fails
- [ ] Public profile still returns location phone for confirmed booking context
- [ ] Owner can still save salon phone on own row