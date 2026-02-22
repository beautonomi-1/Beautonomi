# Beautonomi Analytics Event Taxonomy

> Last updated: 2026-02-17

## Naming Convention

All events follow `{object}_{action}` in lowercase snake_case.

Examples:
- `booking_start` (not `startBooking` or `BookingStarted`)
- `provider_profile_view` (not `viewProviderProfile`)

## Event Categories

### Authentication (4 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `signup_start` | method | Web, Customer, Provider |
| `signup_complete` | method, role | Web, Customer, Provider |
| `login_success` | method | Web, Customer, Provider |
| `logout` | — | Web, Customer, Provider |

### Browsing & Discovery (7 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `home_view` | referrer | Web, Customer |
| `category_view` | category_id, category_name | Web, Customer |
| `search_performed` | query, filters, results_count | Web, Customer |
| `search_result_clicked` | provider_id, position | Web, Customer |
| `provider_profile_view` | provider_id, source | Web, Customer |
| `service_selected` | service_id, provider_id, price | Web, Customer |
| `wishlist_toggle` | provider_id, action (add/remove) | Web, Customer |

### Booking Flow (8 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `booking_start` | provider_id, service_ids | Web, Customer |
| `booking_hold_created` | hold_id, duration_minutes | Web, Customer |
| `checkout_start` | booking_id, total, payment_method | Web, Customer |
| `payment_initiated` | booking_id, method, amount | Web, Customer |
| `payment_success` | booking_id, amount, method | Web, Customer |
| `payment_failed` | booking_id, error | Web, Customer |
| `booking_confirmed` | booking_id, total, services_count | Web, Customer |
| `booking_cancelled` | booking_id, reason | Web, Customer |

### Retention & Loyalty (5 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `booking_rescheduled` | booking_id, new_date | Web, Customer |
| `review_submitted` | booking_id, provider_id, rating | Web, Customer |
| `loyalty_points_earned` | points, action | Web, Customer |
| `loyalty_redeemed` | points, discount_amount | Web, Customer |
| `referral_shared` | channel | Web, Customer |

### Explore Feed (5 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `explore_feed_view` | — | Web, Customer |
| `explore_post_impression` | post_id, position | Web, Customer |
| `explore_post_click` | post_id | Web, Customer |
| `explore_post_save` | post_id | Web, Customer |
| `explore_post_unsave` | post_id | Web, Customer |

### Provider Dashboard (10 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `provider_dashboard_view` | — | Web, Provider |
| `provider_booking_accepted` | booking_id | Web, Provider |
| `provider_booking_rejected` | booking_id, reason | Web, Provider |
| `provider_booking_completed` | booking_id | Web, Provider |
| `provider_calendar_view` | date_range | Web, Provider |
| `provider_staff_created` | staff_id, role | Web, Provider |
| `provider_service_created` | service_id, price | Web, Provider |
| `provider_payout_requested` | amount | Web, Provider |
| `provider_settings_updated` | setting_key | Web, Provider |
| `provider_analytics_view` | — | Web, Provider |

### Messaging (2 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `message_thread_open` | thread_id, participant_type | Web, Customer, Provider |
| `message_sent` | thread_id, message_type | Web, Customer, Provider |

## User Properties (Identify)

### All Users
| Property | Type | Description |
|----------|------|-------------|
| user_id | string | Supabase auth UID |
| role | string | customer, provider_owner, provider_staff, superadmin |
| country | string | User's country |
| city | string | User's city |
| device_type | string | mobile, desktop, tablet |

### Customers
| Property | Type | Description |
|----------|------|-------------|
| lifetime_bookings | number | Total completed bookings |
| last_booking_date | string | ISO date of last booking |
| favorite_categories | string[] | Most booked categories |
| loyalty_points | number | Current loyalty balance |
| membership_plan_id | string | Active membership plan |

### Providers
| Property | Type | Description |
|----------|------|-------------|
| provider_id | string | Provider UUID |
| provider_status | string | active, pending, suspended |
| business_type | string | salon, spa, freelancer, etc. |
| subscription_tier | string | free, pro, enterprise |
| locations_count | number | Number of locations |
| staff_count | number | Number of staff members |
| total_revenue | number | Lifetime revenue |

## Implementation Files

| Platform | File |
|----------|------|
| Web (Browser SDK) | `apps/web/src/lib/analytics/amplitude/types.ts` |
| Customer Mobile | `apps/customer/src/lib/analytics.ts` |
| Provider Mobile | `apps/provider/src/lib/analytics.ts` |
| Web (Server SDK) | `apps/web/src/lib/analytics/amplitude/server.ts` |
