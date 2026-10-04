# Staging release gate (booking unification)

Run these checks on a **Vercel Preview** deployment before merging booking unification to production.

## 1. Environment

- [ ] Preview env `SUPABASE_SERVICE_ROLE_KEY` is the real Supabase **service_role** JWT for the staging project (not the anon key).
- [ ] Redeploy preview after changing env vars.

## 2. Tenant resolution

```bash
curl -sS "https://<preview-host>/api/staging-deploy-meta" | jq .
```

Expect `tenant_resolution: "ok"` (or equivalent success field used by your meta route).

## 3. Public home

```bash
curl -sS -o /dev/null -w "%{http_code}" "https://<preview-host>/api/public/home"
```

Expect **200**.

## 4. Booking smoke (manual)

- [ ] `/book/<slug>?service=<id>` → lands on `/booking?slug=…`
- [ ] `/book/l/<code>` → resolves to `/booking?…`
- [ ] `/book/continue?hold_id=…` → `/booking?…&step=pay`
- [ ] Hold → gate (guest) → payment; Request Now visible when provider + flags allow
- [ ] `/booking?slug=…&embed=1` loads in iframe (CSP)

## 5. Automated helper (optional)

From repo root, with preview URL:

```bash
node apps/web/scripts/verify-preview-tenant.mjs "https://<preview-host>"
```

Exit code **0** = meta + public home checks passed.
