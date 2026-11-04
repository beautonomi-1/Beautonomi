# Money path migration baseline (Phase 0)

Repo-local source of truth for superseding functions. **Before applying new migrations in staging/production**, confirm with:

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT pg_get_functiondef('public.create_finance_ledger_from_payment'::regproc);
SELECT pg_get_functiondef('public.create_finance_ledger_from_booking_refund'::regproc);
SELECT pg_get_functiondef('public._shadow_replay_finance_tx_row'::regproc);
SELECT pg_get_functiondef('public.list_online_booking_payments_missing_ledger'::regproc);
```

## Latest migration files in repo (numeric prefix)

Highest seen: `10105_money_path_integrity_rpcs.sql`. New money-path migrations use prefix **10102_** and later.

| Migration | Purpose |
|-----------|---------|
| `10102_money_path_vat_foundation.sql` | ZA tax rate, provider overrides, snapshots, payout index split, `resolve_tax_rate` inclusive default |
| `10103_money_path_refund_tax_balance.sql` | Refund trigger: tax in penny-balance + `vat_held_for_provider_amount` on tax refunds |
| `10104_money_path_payment_residual_tax.sql` | Payment trigger: tax in deposit residual base + flagged tax metadata |
| `10105_money_path_integrity_rpcs.sql` | Integrity RPCs, `finance_integrity_repairs`, extended missing-ledger RPC |
| `10106_money_path_shadow_gl_vat_held.sql` | Shadow GL: provider-held VAT → provider payable |

## Functions to supersede (repo latest body)

| Function | Latest file in repo |
|----------|---------------------|
| `create_finance_ledger_from_payment` | `1027_provider_portal_till_no_platform_fee.sql` |
| `create_finance_ledger_from_booking_refund` | `669_refund_ratio_use_gross_total.sql` |
| `_shadow_replay_finance_tx_row` | `870_ledger_consistency_followups.sql` (also check `977_gateway_fee_delta_and_adjustment.sql` for caller) |
| `list_online_booking_payments_missing_ledger` | `1038_reconcile_and_stale_refund_hardening.sql` |
| `resolve_tax_rate` | `493_tax_rates.sql` |
| `insert_payout_request_guarded` | `948_payout_request_fraud_hold.sql` |

Apply new `CREATE OR REPLACE` starting from the **database** body if it differs from these files.
