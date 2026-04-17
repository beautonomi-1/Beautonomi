# Runbook — Secret rotation

Covers the full fleet of secrets managed outside Supabase Auth. This is our
answer to F1 (Paystack sandbox leak) and the gitleaks CI guardrail.

## Inventory

| Secret                              | Owner       | Rotation cadence |
| ----------------------------------- | ----------- | ---------------- |
| `SUPABASE_SERVICE_ROLE_KEY`         | Platform    | Yearly + on incident |
| `SUPABASE_JWT_SECRET`               | Platform    | Yearly + on incident |
| `PAYSTACK_SECRET_KEY`               | Finance     | Quarterly       |
| `PAYSTACK_WEBHOOK_SECRET`           | Finance     | Quarterly       |
| `YOCO_SECRET_KEY`                   | Finance     | Quarterly       |
| `YOCO_WEBHOOK_SECRET`               | Finance     | Quarterly       |
| `ONESIGNAL_REST_API_KEY`            | Growth      | Yearly          |
| `TWILIO_AUTH_TOKEN`                 | Platform    | Yearly          |
| `WASENDER_API_KEY`                  | Platform    | Yearly          |
| `UPSTASH_REDIS_REST_TOKEN`          | Platform    | Yearly          |
| `SENTRY_AUTH_TOKEN`                 | Platform    | Yearly          |
| `CRON_SECRET`                       | Platform    | Quarterly       |
| `MAPBOX_ACCESS_TOKEN` (server-side) | Growth      | Yearly          |

All keys live in **Vercel env (prod/preview/dev)** and mirror to
`.env.local.example` (names only, never values). Anything embedded in a SQL
migration must use `current_setting('app.<key>', true)` — see
migration `403_seed_za_paystack_test_keys.sql`.

## Rotation procedure (generic)

1. Generate the replacement secret in the upstream provider console.
2. Add it to Vercel env under the same key **plus** a `_NEXT` suffix where
   the runtime supports dual verification (Paystack/Yoco webhooks, CRON).
3. Re-deploy. Verify both versions work for a configurable grace period (24h
   default).
4. Promote `_NEXT` to the canonical env var and delete the old value.
5. Revoke the old secret in the upstream provider.
6. If the secret is used by mobile apps, cut an EAS build.
7. Add an entry to `docs/SECURITY/ROTATION_LOG.md` with:
   - Who rotated it
   - When
   - Why (scheduled / incident)
   - Any side effects observed

## Incident rotation (secret exposed)

Follow the generic procedure but collapse the grace window to the minimum
required to verify traffic. Additionally:

1. Immediately revoke the exposed secret in the provider console. Do not wait
   for the new deploy.
2. Run `tooling/audit/check-migrations.mjs` + `gitleaks` locally to confirm
   no committed secret remains.
3. File an incident report in `docs/SECURITY/INCIDENTS/`.
4. Audit all webhook/API traffic during the exposure window for abuse.
5. If downstream data may have been tampered with, restore from the nightly
   Supabase backup and replay webhooks using
   `docs/PLAYBOOKS/webhook-replay.md`.

## Preventing future leaks

- `gitleaks` runs in CI on every PR + main push (see `.github/workflows/ci.yml`).
- Custom rules in `.gitleaks.toml` cover Paystack / Yoco / Supabase JWT shapes.
- Migrations must not embed literal keys — use `current_setting()` as above.
- `docs/SECURITY/PRE_COMMIT.md` (TODO) will add a local pre-commit hook
  invoking `gitleaks --staged`.
