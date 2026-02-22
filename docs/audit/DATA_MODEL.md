# Data Model Audit

> Generated: 2026-02-17 | Source: `beautonomi/supabase/migrations/`

## Overview

The database is managed through **229 sequential SQL migrations** in `beautonomi/supabase/migrations/`. The schema contains **80+ tables** spanning users, providers, bookings, payments, content, analytics, and gamification.

**Migration concerns:**
- Duplicate migration numbers: 079, 093, 117, 134, 186-190 (multiple files with same prefix)
- Gap at 206-215 — jumps from 205 to 216
- This will cause issues with sequential migration runners

---

## Core Entity Relationship Diagram (Text)

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  auth.    │     │              │     │   provider_  │
│  users    │────>│    users     │────>│   staff      │
│ (Supabase)│     │   (public)   │     │              │
└──────────┘     └──────┬───────┘     └──────┬───────┘
                        │                     │
                        │                     │
                   ┌────┴────┐          ┌─────┴──────┐
                   │providers│          │staff_shifts │
                   │         │          │staff_perms  │
                   └────┬────┘          └────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────┴────┐   ┌─────┴─────┐  ┌────┴─────┐
    │offerings│   │ provider_ │  │ bookings  │
    │(services│   │ locations │  │           │
    │ addons) │   │           │  └─────┬────┘
    └─────────┘   └───────────┘        │
                                  ┌────┴────┐
                                  │booking_ │
                                  │services │
                                  └─────────┘
```

---

## Table Inventory

### Users & Authentication

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `auth.users` | Supabase auth system | id, email, phone, raw_user_meta_data | Source of truth for auth |
| `users` | Public user profiles | id (FK→auth.users), full_name, email, phone, role, avatar_url, status | Core user record |
| `user_profiles` | Extended user data | user_id (FK→users), bio, beauty_preferences, privacy_settings | 1:1 with users |
| `user_addresses` | User addresses | user_id, label, address, lat, lng, is_default | Many per user |
| `user_verifications` | ID verification docs | user_id, type, status, file_url, reviewed_by | KYC/verification |
| `user_devices` | Push notification tokens | user_id, device_token, platform | OneSignal registration |
| `user_wallets` | Virtual wallet balance | user_id, balance, currency | 1 per user |
| `wallet_transactions` | Wallet history | wallet_id, amount, type, reference | Topup/debit records |
| `notification_preferences` | Per-user notification settings | user_id, channel, enabled | |

### Providers

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `providers` | Business profiles | id, user_id (FK→users), business_name, slug, status, business_type, is_verified | Owner is a user |
| `provider_locations` | Physical locations | provider_id, name, address, lat, lng, is_primary | Many per provider |
| `provider_staff` | Team members | id, provider_id, user_id, role_id, status, display_name | FK to users + providers |
| `staff_roles` | Custom roles | id, provider_id, name, permissions | Provider-defined roles |
| `staff_permissions` | Per-staff overrides | staff_id, permission_key, granted | Fine-grained permissions |
| `staff_shifts` | Work schedules | staff_id, day_of_week, start_time, end_time | Recurring weekly |
| `staff_days_off` | Time off | staff_id, date, reason | One-time blocks |
| `time_cards` | Clock in/out | staff_id, clock_in, clock_out, duration_minutes | |
| `operating_hours` | Business hours | provider_id, day_of_week, open_time, close_time, is_closed | |
| `onboarding_drafts` | Provider signup progress | user_id, step, data (JSONB) | Multi-step onboarding |

### Services & Catalog

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `offerings` | Services, addons, variants | id, provider_id, name, type (service/addon/variant), price, duration_minutes, category_id, parent_id | Self-referencing for variants |
| `provider_categories` | Provider's service categories | id, provider_id, name, sort_order | Group offerings |
| `service_categories` | Platform-wide categories | id, name, slug, icon | Admin-managed |
| `global_service_categories` | Global category taxonomy | id, name, slug, description | Admin-managed |
| `products` | Retail products | id, provider_id, name, price, stock_quantity, sku, brand_id | Inventory items |
| `product_brands` | Product brands | id, provider_id, name | |
| `product_suppliers` | Suppliers | id, provider_id, name, email | |

### Bookings & Scheduling

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `bookings` | Appointment records | id, provider_id, customer_id, staff_id, status, start_time, end_time, total_amount, location_id, booking_type | Core transaction |
| `booking_services` | Line items per booking | booking_id, offering_id, price, duration_minutes | Many per booking |
| `booking_holds` | Temporary time holds | id, provider_id, customer_fingerprint, start_time, end_time, expires_at, status | 7-minute expiry |
| `booking_events` | Status change history | booking_id, event_type, old_status, new_status, created_at | Audit trail |
| `booking_audit_log` | Detailed audit | booking_id, action, actor_id, metadata | |
| `booking_additional_charges` | Post-booking charges | booking_id, description, amount, status, paid_at | Upsells |
| `time_blocks` | Blocked time slots | provider_id, staff_id, start_time, end_time, type, reason | Buffer/breaks |
| `availability_blocks` | Available windows | provider_id, staff_id, day_of_week, start_time, end_time | Custom availability |
| `recurring_appointments` | Recurring booking templates | provider_id, customer_id, pattern, next_occurrence | Auto-creates bookings |
| `group_booking_settings` | Group class config | provider_id, max_participants, enabled | |
| `group_booking_participants` | Participants in groups | booking_id, user_id, status | |
| `waitlist_entries` | Waitlist queue | provider_id, customer_id, service_id, preferred_date | |
| `waiting_room_entries` | Day-of waiting room | provider_id, customer_id, status, check_in_time | |

### Payments & Finance

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `transactions` | Payment records | id, booking_id, amount, currency, status, payment_method, paystack_reference | Core financial |
| `payment_methods` | Saved cards | user_id, last4, exp_month, exp_year, paystack_authorization_code | Tokenized |
| `payment_settings` | Provider payment config | provider_id, accepted_methods, currency | |
| `gift_cards` | Gift card records | id, code, balance, original_amount, purchaser_id, recipient_email | |
| `gift_card_orders` | Purchase records | id, gift_card_id, amount, payment_reference | |
| `promotions` | Promo codes | id, code, discount_type, discount_value, valid_from, valid_to, max_uses | |
| `invoices` | Provider invoices | id, provider_id, booking_id, amount, status, due_date | |
| `payouts` | Provider payouts | id, provider_id, amount, status, paystack_transfer_code | |
| `provider_subscriptions` | SaaS subscriptions | provider_id, plan_id, status, paystack_subscription_code, current_period_end | |
| `subscription_plans` | Plan definitions | id, name, price, interval, features (JSONB) | |
| `service_fees` | Platform fees per booking | booking_id, amount, percentage | |
| `tip_distributions` | Tip allocation | booking_id, staff_id, amount | |
| `vat_reports` | VAT summaries | provider_id, period, total_vat, status | |
| `pay_runs` | Staff payroll | provider_id, period_start, period_end, status | |
| `commission_settings` | Staff commission rules | provider_id, type, percentage | |
| `fee_configs` | Platform fee tiers | id, tier, percentage, flat_fee | Admin-managed |

### Messaging & Communication

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `conversations` | Chat threads | id, provider_id, customer_id, booking_id, status | |
| `messages` | Chat messages | id, conversation_id, sender_id, content, type, read_at | |
| `notifications` | In-app notifications | id, user_id, type, title, body, read_at | |
| `email_templates` | Email templates | id, slug, subject, body, variables | Admin-managed |
| `sms_templates` | SMS templates | id, slug, body, variables | Admin-managed |
| `notification_templates` | Push templates | id, type, title, body | Admin-managed |
| `broadcast_history` | Bulk sends | id, channel, audience, status | |

### Reviews & Social

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `reviews` | Customer reviews | id, booking_id, provider_id, customer_id, rating, comment, response | |
| `review_reports` | Flagged reviews | review_id, reporter_id, reason | |
| `explore_posts` | Social feed posts | id, author_id, content, media_urls, status | Provider or customer |
| `explore_comments` | Post comments | post_id, author_id, content | |
| `explore_saved` | Saved/bookmarked posts | post_id, user_id | |

### Loyalty & Gamification

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `loyalty_point_transactions` | Points ledger | user_id, points, type, reference_id | Earn/redeem |
| `loyalty_milestones` | Milestone definitions | id, name, points_required, reward | Admin-managed |
| `loyalty_rules` | Earning rules | id, action, points, conditions | Admin-managed |
| `provider_gamification` | Provider badge/points | provider_id, total_points, current_badge_id | |
| `gamification_badges` | Badge definitions | id, name, min_points, benefits | Admin-managed |
| `gamification_point_rules` | Provider earning rules | id, action, points | Admin-managed |

### Content & Configuration

| Table | Purpose |
|-------|---------|
| `platform_settings` | Global config (key-value JSONB) |
| `page_content` | CMS pages |
| `faqs` | FAQ entries |
| `footer_links` | Footer navigation |
| `footer_settings` | Footer config |
| `feature_flags` | Feature toggles |
| `countries` | Country list |
| `amplitude_integration_config` | Analytics config per environment |
| `mapbox_config` | Mapbox API config |
| `referral_settings` | Referral program config |
| `referral_faqs` | Referral FAQ entries |
| `cancellation_policies` | Provider cancellation rules |
| `cancellation_reasons` | Predefined reasons |
| `travel_fee_settings` | Per-provider travel fees |
| `distance_settings` | Max distance config |
| `service_zones` | Geographic service areas |
| `custom_fields` | Dynamic form fields |

### System & Audit

| Table | Purpose |
|-------|---------|
| `audit_logs` | System audit trail |
| `activity_logs` | User activity |
| `error_logs` | Error records |
| `api_keys` | Provider API keys |
| `webhook_endpoints` | Registered webhooks |
| `webhook_failures` | Failed webhook deliveries |
| `portal_tokens` | Passwordless booking management tokens |
| `support_tickets` | Help desk tickets |
| `support_ticket_messages` | Ticket messages |
| `user_reports` | User reports/flags |
| `disputes` | Payment disputes |

---

## Naming Conventions

**Mostly consistent:**
- Snake_case table names ✓
- UUID primary keys ✓
- `created_at` / `updated_at` timestamps ✓
- `*_id` foreign key naming ✓

**Inconsistencies:**
- `offerings` (services + addons + variants) vs `products` (retail) — the naming is non-obvious; `offerings` should perhaps be `services` with a `type` column
- `finance_transactions` vs `transactions` — unclear if both exist or if one superseded the other
- `time_blocks` vs `availability_blocks` — overlapping concepts
- `waitlist_entries` vs `waiting_room_entries` — different features but confusingly similar names

---

## Action Items

- [x] **HIGH:** Fix duplicate migration numbers (079, 093, 117, 134, 186-190) — Done: 9 duplicates renamed to 206-214, logged in `docs/data-model/MIGRATION_RENAMING_LOG.md`
- [x] **HIGH:** Audit missing RLS on financial tables — Done: Migration 230 adds RLS to all financial tables with proper policies
- [x] **MEDIUM:** Add missing indexes for common query patterns — Done: Migration 230 adds 14 performance indexes
- [x] **MEDIUM:** Clarify `offerings` vs `services` naming — Done: documented in `docs/data-model/OFFERINGS_EXPLAINED.md`
- [ ] **MEDIUM:** Investigate `handle_new_user` trigger bypass (migration 200) — Requires runtime investigation in Supabase dashboard
- [x] **LOW:** Document `time_blocks` vs `availability_blocks` difference — Done: documented in `docs/data-model/SCHEDULING_EXPLAINED.md`
- [x] **LOW:** Clean up migration gap at 206-215 — Done: gap filled by renamed duplicate migrations (206-214)
