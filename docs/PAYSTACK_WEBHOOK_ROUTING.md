# Paystack webhook routing (multi-tenant)

**Status:** Operational guidance — align new integrations with tenant-scoped payment handling.

## Which URL to use

| Route | Purpose |
|--------|---------|
| **`/api/payments/webhook`** (preferred) | Primary path: resolves tenant from **Host** / forwarded headers, ties events to `payment_webhook_events` with `resolvePaymentWebhookTenantId` (`apps/web/src/lib/payment/resolve-payment-webhook-tenant.ts`), and uses tenant-derived Paystack secrets where applicable. |
| **`/api/webhooks/paystack`** (legacy) | Backward compatibility and idempotency ledger (`payment_provider_data` / duplicate handling). Keep configured in Paystack until all environments use the primary route. |

Configure Paystack dashboards to point at the **same** public base URL your `tenant_domains` expect (per environment). Unknown hosts with `STRICT_TENANT_HOST_RESOLUTION=true` should fail closed per rollout policy.

## Related code

- Tenant resolution for webhooks: `apps/web/src/lib/payment/resolve-payment-webhook-tenant.ts`
- Region / secrets: `apps/web/src/lib/payments/paystack-server.ts`, `docs/REGION_ROLLOUT_CHECKLIST.md` § Money paths

Update this file when adding a third webhook entrypoint or changing URL structure.
