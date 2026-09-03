# Beautonomi Analytics Event Taxonomy

> Last updated: 2026-09-03

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

### Booking Flow (9 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `booking_start` | provider_id, service_ids | Web, Customer |
| `booking_hold_created` | hold_id, duration_minutes | Web, Customer |
| `checkout_start` | booking_id, total, payment_method | Web, Customer |
| `payment_initiated` | booking_id, method, amount | Web, Customer |
| `payment_success` | booking_id, amount, method | Web, Customer |
| `payment_failed` | booking_id, error | Web, Customer |
| `additional_charge_paid` | booking_id, charge_id, amount, currency, transaction_id | Web, Customer, Server |
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

### App lifecycle & attribution (4 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `app_open` | portal, cold_start, source | Customer, Provider |
| `page_view` | — | Web |
| `push_notification_opened` | notification_type, portal | Customer, Provider |
| `deep_link_opened` | host, path, source, portal | Customer, Provider |

### Server money events (9 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `wallet_topup` | amount, currency, transaction_id, wallet_id | Server |
| `gift_card_purchased` | amount, currency, transaction_id, gift_card_id | Server |
| `gift_card_redeemed` | amount, currency, transaction_id, gift_card_id | Server |
| `membership_purchased` | amount, currency, transaction_id, membership_id, plan_id | Server |
| `membership_renewed` | amount, currency, transaction_id, membership_id, plan_id | Server |
| `product_order_paid` | amount, currency, transaction_id, order_id, item_count | Server |
| `provider_subscription_paid` | amount, currency, transaction_id, subscription_id, provider_id | Server |
| `ads_budget_paid` | amount, currency, transaction_id, campaign_id, provider_id | Server |
| `apple_iap_verified` | amount, currency, transaction_id, product_id | Server |

### Client commerce funnel (12 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `payment_method_selected` | method | Web, Customer |
| `product_viewed` | product_id | Web, Customer |
| `add_to_cart` | product_id | Web, Customer |
| `remove_from_cart` | product_id | Web, Customer |
| `cart_viewed` | item_count | Web, Customer |
| `product_checkout_started` | item_count, total | Web, Customer |
| `product_order_placed` | order_id | Web, Customer |
| `product_return_requested` | order_id | Web, Customer |
| `shop_browsed` | — | Web, Customer |
| `gift_card_checkout_start` | amount | Web, Customer |
| `custom_request_created` | provider_id | Web, Customer |
| `share_provider` | provider_id, channel | Web, Customer |

### Provider growth (9 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `provider_onboarding_step_completed` | step, step_index, portal | Web, Provider |
| `provider_subscription_checkout_start` | plan_id, billing_cycle, portal | Web, Provider |
| `ads_campaign_checkout_start` | campaign_id, budget, currency, portal | Web, Provider |
| `ads_campaign_filter` | — | Web, Provider |
| `staff_invited` | staff_id | Web, Provider |
| `staff_invite_accepted` | staff_id, provider_id, portal | Web, Provider |
| `staff_created` | staff_id | Web, Provider |
| `staff_role_changed` | staff_id, role | Web, Provider |
| `permission_changed` | staff_id | Web, Provider |

### Provider operations (22 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `provider_calendar_action` | action | Web, Provider |
| `front_desk_view` | — | Web, Provider |
| `front_desk_status_change` | booking_id, status | Web, Provider |
| `walkin_created` | — | Web, Provider |
| `waitlist_add` | — | Web, Provider |
| `waitlist_notify` | — | Web, Provider |
| `payment_link_sent` | booking_id | Web, Provider |
| `mark_paid_clicked` | booking_id | Web, Provider |
| `yoco_terminal_recorded` | — | Web, Provider |
| `invoice_generated` | booking_id | Web, Provider |
| `explore_post_created` | post_id | Web, Provider |
| `explore_post_published` | post_id | Web, Provider |
| `explore_post_deleted` | post_id | Web, Provider |
| `marketing_automation_created` | — | Web, Provider |
| `marketing_automation_executed` | — | Web, Provider |
| `campaign_sent` | — | Web, Provider |
| `product_created` | product_id | Web, Provider |
| `product_updated` | product_id | Web, Provider |
| `product_order_fulfilled` | order_id | Web, Provider |
| `walk_in_sale_completed` | — | Web, Provider |
| `product_return_processed` | order_id | Web, Provider |
| `shipping_config_updated` | — | Web, Provider |

### At-home journey (3 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `provider_journey_started` | booking_id, eta_minutes, portal | Web, Provider |
| `provider_eta_updated` | booking_id, eta_minutes, previous_eta_minutes, running_late | Web, Provider |
| `provider_arrived` | booking_id, portal | Web, Provider |

### Support tickets (8 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `customer_support_tickets_view` | — | Web, Customer |
| `customer_support_ticket_detail_view` | — | Web, Customer |
| `customer_support_ticket_created` | — | Web, Customer |
| `customer_support_ticket_reply` | — | Web, Customer |
| `provider_support_tickets_view` | — | Web, Provider |
| `provider_support_ticket_detail_view` | — | Web, Provider |
| `provider_support_ticket_created` | — | Web, Provider |
| `provider_support_ticket_reply` | — | Web, Provider |

### Trust & Safety (6 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `safety_hub_view` | portal | Web, Customer, Provider |
| `safety_hub_nav` | portal | Web, Customer, Provider |
| `emergency_contact_saved` | portal | Web, Customer, Provider |
| `content_safety_toggle` | portal | Web, Customer, Provider |
| `content_report_submitted` | portal | Web, Customer, Provider |
| `user_report_submitted` | portal | Web, Customer, Provider |

### Web portal (7 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `session_start` | — | Web |
| `session_end` | — | Web |
| `search_view` | — | Web |
| `search_filters_applied` | — | Web |
| `search_result_impression` | provider_id, position | Web |
| `booking_details_completed` | — | Web |
| `refund_requested` | booking_id | Web |

### Admin portal (17 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `admin_dashboard_view` | — | Web |
| `provider_verified` | provider_id | Web |
| `provider_status_changed` | provider_id, status | Web |
| `impersonation_started` | — | Web |
| `impersonation_ended` | — | Web |
| `payout_approved` | — | Web |
| `payout_rejected` | — | Web |
| `refund_approved` | — | Web |
| `api_key_created` | — | Web |
| `api_key_updated` | — | Web |
| `api_key_disabled` | — | Web |
| `feature_flag_created` | — | Web |
| `feature_flag_updated` | — | Web |
| `explore_post_moderated` | post_id | Web |
| `user_report_resolved` | — | Web |
| `system_health_view` | — | Web |
| `monitoring_error_view` | — | Web |

### Market Routing (4 events)
| Event | Properties | Platforms |
|-------|-----------|-----------|
| `market_auto_switch_attempted` | from_host, to_host, source, confidence, country_code | Web, Customer, Provider |
| `market_auto_switch_suppressed` | from_host, to_host, reason, source, confidence, country_code | Web, Customer, Provider |
| `market_manual_switch` | from_host, to_host, reason, country_code | Web, Customer, Provider |
| `market_switch_declined` | host, reason, country_code | Web, Customer, Provider |

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

**Canonical constants:** Use event name constants from `@beautonomi/analytics` (see `packages/analytics/src/events.ts`) when integrating in new code so web and mobile stay aligned. Property keys (e.g. `provider_id`, `booking_id`, `post_id`) should match the tables above for funnel and provider ROI consistency.

For dashboard/query templates, see `docs/analytics/MARKET_ROUTING_DASHBOARD_SPEC.md`.
