# Migration Renaming Log

> Date: 2026-02-17

## Summary

9 migration files had duplicate numbering. The second file in each duplicate pair was
renamed to the next available sequential number (206–214), filling the gap between
`205_provider_total_bookings_completed_only.sql` and `216_booking_holds.sql`.

No SQL content was modified — only filenames were changed.

## Renames

| Original Filename | New Filename | Reason |
|---|---|---|
| `079_provider_business_settings.sql` | `206_provider_business_settings.sql` | Duplicate migration number resolved (conflicted with `079_add_qr_code_support.sql`) |
| `093_paystack_subscriptions_and_features.sql` | `207_paystack_subscriptions_and_features.sql` | Duplicate migration number resolved (conflicted with `093_payment_gateway_fee_management.sql`) |
| `117_create_custom_fields.sql` | `208_create_custom_fields.sql` | Duplicate migration number resolved (conflicted with `117_create_booking_products.sql`) |
| `134_migrate_platform_service_fee_to_service_fee.sql` | `209_migrate_platform_service_fee_to_service_fee.sql` | Duplicate migration number resolved (conflicted with `134_calendar_syncs_table.sql`) |
| `186_fix_footer_business_links.sql` | `210_fix_footer_business_links.sql` | Duplicate migration number resolved (conflicted with `186_add_provider_mobile_services_toggle.sql`) |
| `187_remove_unwanted_footer_links.sql` | `211_remove_unwanted_footer_links.sql` | Duplicate migration number resolved (conflicted with `187_enhance_house_call_address_fields.sql`) |
| `188_remove_duplicate_pricing_link.sql` | `212_remove_duplicate_pricing_link.sql` | Duplicate migration number resolved (conflicted with `188_create_provider_gamification.sql`) |
| `189_backfill_provider_points_transactions.sql` | `213_backfill_provider_points_transactions.sql` | Duplicate migration number resolved (conflicted with `189_add_paystack_plan_codes_to_pricing_plans.sql`) |
| `190_add_mobile_ready_to_provider_staff.sql` | `214_add_mobile_ready_to_provider_staff.sql` | Duplicate migration number resolved (conflicted with `190_add_auto_approve_setting.sql`) |

## Numbering After Fix

The migration sequence around the renamed files now looks like:

```
...
205_provider_total_bookings_completed_only.sql
206_provider_business_settings.sql          ← was 079
207_paystack_subscriptions_and_features.sql ← was 093
208_create_custom_fields.sql                ← was 117
209_migrate_platform_service_fee_to_service_fee.sql ← was 134
210_fix_footer_business_links.sql           ← was 186
211_remove_unwanted_footer_links.sql        ← was 187
212_remove_duplicate_pricing_link.sql       ← was 188
213_backfill_provider_points_transactions.sql ← was 189
214_add_mobile_ready_to_provider_staff.sql  ← was 190
215 — (available)
216_booking_holds.sql
...
```
