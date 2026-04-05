# Domain-to-Tenant Routing Runbook

Practical rollout guide for multi-market domains on one production deployment.

## Target Topology

- `beautonomi.com` -> global entry tenant (market router)
- `beautonomi.co.za` -> ZA tenant (transactional market)
- `beautonomi.co.uk` -> UK tenant (transactional market)
- `beautonomi.us` or `beautonomi.com` (if you choose US on .com) -> US tenant

## Domain Mapping Matrix

| Hostname | Tenant slug | Role | Checkout allowed |
|---|---|---|---|
| `beautonomi.com` | `global` | global entry, market selection | No (recommended) |
| `www.beautonomi.com` | `global` | alias to global entry | No (recommended) |
| `beautonomi.co.za` | `za` | market storefront + booking | Yes |
| `www.beautonomi.co.za` | `za` | alias to ZA | Yes |
| `beautonomi.co.uk` | `uk` | market storefront + booking | Yes |
| `www.beautonomi.co.uk` | `uk` | alias to UK | Yes |

If you want `.com` to be US transactional instead, map `.com` to `us` and keep a separate global landing domain.

## Public UX Policy (Unsupported Geos)

Example: user from Russia opens `.com`:

1. Do not block auth/profile globally.
2. Resolve active tenant from host first (`global` on `.com`).
3. Use geo as a hint only, not auth scope.
4. Show:
   - "Not available in your country yet"
   - "Switch market"
   - "Join waitlist"
5. Enforce hard market/payment/compliance checks at booking/checkout.

Runtime controls:

- `SUPPORTED_MARKET_COUNTRIES` (e.g. `ZA,UK,US`)
- `RESTRICTED_COUNTRIES` (optional deny list)
- `NEXT_PUBLIC_GLOBAL_ENTRY_HOST` (global popup entry host)
- `NEXT_PUBLIC_DEFAULT_MARKET_HOST` (switch target host, e.g. `beautonomi.co.za`)

## Route Behavior Contract

| Surface | Rule |
|---|---|
| Home/Search/Provider profile | scoped by active tenant from hostname |
| Booking hold/create | tenant resolved from trusted host context |
| Checkout/payment | must run in transactional market tenant |
| Auth/login/account | global identity, tenant-aware data access |
| "My bookings" | can list cross-tenant owned rows, but mutate in booking tenant context |

## Vercel + DNS Setup (Single Deployment)

1. Add all hostnames to one Vercel project (Production Domains).
2. Configure DNS:
   - apex domain -> Vercel A/ALIAS target
   - `www` -> `cname.vercel-dns.com`
3. Wait for SSL issuance per domain.
4. Pick canonical policy:
   - apex preferred: `www` -> apex (308), or
   - `www` preferred: apex -> `www` (308)
5. Ensure same canonical policy is reflected in `tenant_domains.is_primary`.

## App/Backend Mapping Source of Truth

Use DB `tenant_domains` for hostname resolution (no hardcoded country switch in route handlers).

Suggested rows:

```sql
-- Example only
insert into tenant_domains (tenant_id, hostname, is_primary, is_active)
values
  ((select id from tenants where slug = 'global'), 'beautonomi.com', true, true),
  ((select id from tenants where slug = 'global'), 'www.beautonomi.com', false, true),
  ((select id from tenants where slug = 'za'), 'beautonomi.co.za', true, true),
  ((select id from tenants where slug = 'za'), 'www.beautonomi.co.za', false, true),
  ((select id from tenants where slug = 'uk'), 'beautonomi.co.uk', true, true),
  ((select id from tenants where slug = 'uk'), 'www.beautonomi.co.uk', false, true);
```

## Mobile Option B (Single Global Build)

- Keep one app build.
- Set `EXPO_PUBLIC_APP_URL` to canonical API entry (usually `.com`).
- Keep runtime `activeMarketHost` in app state.
- Send `x-forwarded-host: activeMarketHost` on API calls.
- Deep links update `activeMarketHost` from link host.

Recommended runtime precedence:

1. Deep link host
2. Explicit user market selection
3. Stored preferred market
4. Geo hint
5. Default global entry

## Hardening Before Full Multi-Market

- Remove permanent implicit ZA fallback for unknown hosts.
- Unknown host should fail closed (tenant unavailable), not silently route to ZA.
- Add alerting on tenant resolution failures by host.

Current code supports this with env:

- `STRICT_TENANT_HOST_RESOLUTION=true` (web API fail-closed on unknown host mappings)

## Launch Checklist (Per New Market)

- Tenant created and active (`tenants`)
- Hostnames mapped (`tenant_domains`)
- Domain verified and TLS active in Vercel
- Canonical redirects working
- Public config bundle/flags/content seeded for market
- Payment and webhook configs validated for market
- Mobile deep links and OAuth redirect allowlists updated
- Canary window passes SLO gates before full rollout
