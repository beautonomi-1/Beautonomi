# Region secrets and KMS (operational runbook)

**Scope:** `public.region_secrets` (migration **377**), consumed by `getPaystackSecretKey` in `apps/web/src/lib/payments/paystack-server.ts`.

## Current state (repo)

- Rows are keyed by `(region_id, key)` with `value_encrypted` column name implying encryption; **application code treats the value as the secret string** to pass to Paystack (see NOTE in `paystack-server.ts`).
- Secrets are read with the **service role** only; they are **not** exposed in config-bundle or public APIs.
- **Do not** log secret values, webhook signing material, or `PAYSTACK_SECRET_KEY` in application logs.

## Target state (when you adopt envelope encryption or cloud KMS)

1. **Choose a strategy**
   - **Envelope encryption:** app holds a data-key; `value_encrypted` stores ciphertext + IV metadata (JSON or binary-safe text).
   - **Cloud KMS:** AWS KMS / GCP KMS / Azure Key Vault — store key id in env; decrypt at runtime only inside server routes.

2. **Migration path**
   - Add a column or convention, e.g. `encryption_version` or prefix `enc:v2:` on `value_encrypted`.
   - Rotate per region: decrypt legacy plaintext in a one-off admin script, re-encrypt with KMS, update row.
   - Keep Paystack verify/init paths unchanged; only `getPaystackSecretKey` decrypts.

3. **Rotation**
   - Paystack dashboard: roll secret → update `region_secrets` for `paystack_secret_key` → verify webhooks and init in staging → prod.
   - Prefer **dual-active** window only if Paystack supports overlapping keys; otherwise short maintenance window.

4. **Access control**
   - Limit Supabase dashboard access to `region_secrets`; use RLS/service policies so only `service_role` reads (app already uses admin client).

5. **Related docs**
   - `docs/PAYSTACK_WEBHOOK_ROUTING.md` — webhook URL and tenant resolution.
   - `docs/PAYMENTS_SUBSCRIPTIONS_ROLLOUT.md` — payment feature flags and rollout.
