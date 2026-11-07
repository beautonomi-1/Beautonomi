# Learning Center fact ledger

Every factual claim in seeded Learning Center articles (navigation paths, labels, rules, numbers) should trace to a row here. When product code changes, search this file for the source path to find the articles that need updating, then run `node scripts/verify-learning-content.mjs`.

**Type** column:
- **Hardcoded** — value lives in code; articles may state it exactly.
- **DB** — configurable per platform, tenant, or provider; articles must describe it as "set by the platform/provider" and never state a fixed number.
- **Flag** — only shown when a feature flag is enabled; articles must say "where enabled for your account" / "where available".

## Core navigation

| Fact | Source | Type | Slugs |
|---|---|---|---|
| Customer app tabs: Home, Search, Bookings, Cart, Chats, Profile; Shop, Explore, Saved, Support tickets are hidden tabs | `apps/customer/app/(app)/(tabs)/_layout.tsx` 302-368 | Hardcoded | getting-started-overview, customer-mobile-app, account-profile-overview |
| Explore has no bottom-bar icon; reached from the Home header | `apps/customer/app/(app)/(tabs)/_layout.tsx` 363 (comment) | Hardcoded | getting-started-overview |
| Customer web account routes `/account-settings/{personal-info, profile-details, preferences, login-and-security, identity-verification, addresses, privacy-and-sharing, wishlists, wallet, payments, loyalty, referrals, reviews, messages, notifications, bookings, orders, returns, safety, blocked-users, content-and-safety}` | `apps/web/src/app/account-settings/*` | Hardcoded | account-profile-overview, payments-customer-overview, wallet-gift-cards-coupons-overview, loyalty-rewards-overview, reviews-ratings-overview, messaging-providers-overview, at-home-services-overview |
| Help routes `/help`, `/help/submit-ticket`, `/help/my-tickets` | `apps/web/src/app/help/*`; provider sidebar bottom items `apps/web/src/components/provider/ProviderSidebar.tsx` 161-165 | Hardcoded | troubleshooting-faq-overview, support-tickets-disputes-overview, getting-started-overview |
| Provider app tabs: Dashboard, Clients, Chats, Bookings, More (Sales, Settings hidden) | `apps/provider/app/(app)/(tabs)/_layout.tsx` 346-407; labels `en.json` `provider.dashboard/clients/chats/bookings`, `common.more` | Hardcoded | provider-mobile-app, clients-crm-overview, getting-started-overview |
| More quick actions: Bookings, Express booking, Front Desk, Custom requests, Catalogue, Buy ads, Memberships, Card machines, Paystack Terminal, Subscription, Payouts, Bank accounts | `apps/provider/app/(app)/(tabs)/more/index.tsx` 222-234; labels `en.json` `provider.mobile.screens.moreTab.qa*` | Hardcoded | provider-mobile-more-navigation |
| More sections and items (Grow your business, Operations, E-commerce, Business, Engagement, Settings) | `apps/provider/app/(app)/(tabs)/more/index.tsx` 140-218; labels `en.json` `provider.mobile.screens.moreTab.*` (3465-3531) | Hardcoded | provider-mobile-more-navigation and every provider overview "Where to find it" |
| Card machines hidden unless PayCloud enabled; Yoco hidden unless `payment_yoco`; Paystack Terminal hidden unless `payment_paystack_virtual_terminal` | `more/index.tsx` 241-243, 853-857, 1120-1125 | Flag | provider-mobile-more-navigation, provider-mobile-finance-yoco-payouts |
| More → Payment setup lists Payout bank accounts, Yoco payments (`payment_yoco`), Card machines (`payment_paycloud`), Paystack Terminal (`payment_paystack_virtual_terminal`), Gift cards, Terminal Shop | `apps/provider/app/(app)/(tabs)/more/payment-setup.tsx` 14-60; `en.json` `provider.mobile.screens.paymentSetup.*` 3592-3609 | Flag | provider-mobile-app, provider-mobile-finance-yoco-payouts, provider-web-yoco-payments, request-payout, payouts-earnings-overview |
| Engagement hub links Chats, Marketing hub, Support tickets, Reviews | `apps/provider/app/(app)/(tabs)/more/engagement-hub.tsx` 117-180 | Hardcoded | reviews-management-overview, marketing-automations-overview |
| Provider web sidebar sections/items and hrefs (Main, Operations, Schedule, Resources & Forms, Orders, E-Commerce, Business, Team & Marketing; bottom Help & support, My tickets, Settings) | `apps/web/src/components/provider/ProviderSidebar.tsx` 72-165; labels `en.json` `web.provider.sidebar.*` 32613-32692 | Hardcoded | provider-web-portal and every provider overview |
| Web sidebar Card machines (`payment_paycloud`), Yoco (`payment_yoco`, `/provider/settings/sales/yoco-integration`), Paystack Terminal (`payment_paystack_virtual_terminal`), Sales (unified POS flag) | `ProviderSidebar.tsx` 129-134 | Flag | provider-web-portal, provider-web-yoco-payments |
| Payout accounts at `/provider/settings/payout-accounts` (sidebar "Bank Accounts") | `ProviderSidebar.tsx` 131 | Hardcoded | payouts-earnings-overview, request-payout |
| Booking links sidebar item → `/provider/express-booking` | `ProviderSidebar.tsx` 156 | Hardcoded | online-booking-links-overview |
| On-demand acceptance toggle on `/provider/settings/appointment-activity/online-booking` (`on_demand_accept_enabled`); incoming request screen `apps/provider/app/(app)/on-demand/incoming/[id].tsx` | `apps/web/src/app/provider/settings/appointment-activity/online-booking/page.tsx` 37, 647-661 | DB | on-demand-requests-overview |
| Provider push notifications delivered by OneSignal | `apps/provider/src/lib/onesignal-client.ts` | Hardcoded | integrations-overview |
| Integration settings pages: calendar-integration, integrations/email, integrations/twilio, marketing-integrations | `apps/web/src/app/provider/settings/*` | Hardcoded | integrations-overview |

## Money and refunds

| Fact | Source | Type | Slugs |
|---|---|---|---|
| Automatic cancellation refunds are credited to the customer's Beautonomi wallet (store credit) | `apps/web/src/lib/bookings/refund-processing.ts` 98-125 | Hardcoded | payments-customer-overview, policies-overview, support-tickets-disputes-overview, troubleshooting-faq-overview, canceling-your-booking, refunds-and-cancellation-fees, if-provider-cancels |
| Bank refund of wallet funds is a customer request reviewed by finance (`/account-settings/wallet/bank-refund`; app `account-settings/wallet-bank-refund.tsx`) | `supabase/migrations/1009_cancellation_phase5b_learning_templates.sql` (wallet_bank_refund_* templates) | Hardcoded | payments-customer-overview, wallet-gift-cards-coupons-overview, support-tickets-disputes-overview |
| Effective policy = booking snapshot merged with live policy, always the more customer-friendly value | `apps/web/src/lib/bookings/effective-cancellation-policy.ts` 15-50 | Hardcoded | policies-overview, canceling-your-booking |
| In-person payments carry no cancellation fee and are returned by the provider | `1009_cancellation_phase5b_learning_templates.sql` (resolveCancellationOutcome copy) | Hardcoded | policies-overview, payments-checkout-provider-overview |
| Payout balance includes walk-ins paid via Paystack; excludes walk-ins paid directly (cash, Yoco, etc.) | `apps/web/src/app/api/provider/finance/route.ts` 232-253 | Hardcoded | payouts-earnings-overview, understanding-earnings, walk-in-addons-payout, payments-checkout-provider-overview |
| Platform-held (payoutable) tenders are paystack, stripe, flutterwave, wallet, gift_card; available = earnings − hold window − completed payouts − pending/processing requests − open disputes | `apps/web/src/lib/provider/available-payout-balance.ts` 16-31, 89-95, 525-546 | Hardcoded (hold days DB) | payouts-earnings-overview, understanding-earnings, payments-checkout-provider-overview, provider-payout-rails-available-balance |
| Platform service fee is customer-paid at checkout, not deducted from provider; commission only when `payouts.commission_enabled` | migrations `1025`, `1027` 112-127; `resolve-commission-percentage.ts` 33-38 | DB | payouts-earnings-overview, understanding-earnings, provider-platform-fees-commission |
| Paystack Terminal payments become payoutable after manual allocation to a sale and holds | `en.json` 28159 | Flag | payments-checkout-provider-overview, walk-in-addons-payout, understanding-earnings, provider-paystack-terminal |
| Payout request blocked by new-account cooling-off, review hold, negative balance, currency mismatch | `apps/web/src/app/api/provider/payouts/route.ts` 166-172, 220-252, 309-335 | Hardcoded (cooling-off hours DB) | request-payout, provider-payout-accounts-cooling-off |
| Admin refunds and product-return refunds credit the customer wallet | `apps/web/src/app/api/admin/refunds/route.ts` 61-62, 327 | Hardcoded | providers-bookings-runbook, ecommerce-runbook, disputes-refund-ops-overview, money-path-refunds-vat-runbook |
| Provider subscription: More quick action "Subscription" or Settings & account → Account → Subscription & plan; web `/provider/subscription`; iPhone billed via App Store | `more/index.tsx` 222-234; `en.json` 3542, 11104; `apps/provider/src/lib/iap/platform.ts` | Hardcoded | provider-web-subscription-plan, provider-subscription-billing-ios |
| Card machine payments settle to the provider's own bank account | `supabase/migrations/813_terminal_merchant_learning_content.sql` (card-machines-faq) | Hardcoded | payments-checkout-provider-overview, understanding-earnings |
| Minimum payout and hold days come from `platform_settings` (fallbacks 100 and 0) | `apps/web/src/app/api/provider/payouts/route.ts` 185-186; `apps/web/src/app/api/provider/finance/route.ts` 425-426 | DB | payouts-earnings-overview, request-payout |
| Request payout gated by permission, payout destination, and minimum | `more/index.tsx` 290-397 | Hardcoded | request-payout |
| Payout rail is Paystack or Stripe (Stripe Connect onboarding) per market | `more/index.tsx` 270-273, 382-386 | DB | request-payout |
| Next payout date shown from `/api/provider/payouts/next-date` | `more/index.tsx` 274, 398 | DB | request-payout |
| Commission % from `platform_settings.payouts` + `providers.commission_override`, snapshotted on bookings | `apps/web/src/lib/**/resolve-commission-percentage*.ts` | DB | (never state a number) |
| Subscription prices from `subscription_plans` / pricing CMS | `apps/web/src/lib/**/published-pricing-plans.ts` | DB | pricing-subscriptions-overview |
| iOS provider subscription via StoreKit (`POST /api/provider/iap/verify`) | `apps/provider/src/lib/iap/apple-iap.ts` 1-9 | Hardcoded | pricing-subscriptions-overview |

## Bookings lifecycle

| Fact | Source | Type | Slugs |
|---|---|---|---|
| Running late: from 30 minutes before start until appointment end; delays 10/15/20/30/45 min; one report per 15 minutes | `apps/web/src/lib/bookings/lifecycle-running-late.ts` 4-6, 24-74 | Hardcoded | managing-bookings-overview |
| Running late not allowed once checked in / in progress / completed / cancelled / no-show; house calls only while confirmed or provider on the way | `lifecycle-running-late.ts` 28-41 | Hardcoded | managing-bookings-overview |
| Waiting for close-out, expired pending requests, Book again shown on booking detail | `apps/customer/app/(app)/booking-detail.tsx` (~182-225 lifecycle_hint, ~184-194 isExpiredPendingBooking, ~1737 can_report_running_late) | Hardcoded | managing-bookings-overview |
| Confirmed visits are never auto no-show / auto-cancelled; Needs close-out queue; Running behind bulk notify | `supabase/migrations/888_learning_center_booking_lifecycle.sql` (product copy shipped with the lifecycle feature) | Hardcoded | calendar-scheduling-overview |
| Online requests await confirmation by default; released and refunded if not confirmed; reminders 30 minutes after request and before expiry | `888_learning_center_booking_lifecycle.sql` | DB (provider setting) | online-booking-links-overview |

## Reviews, accounts, notifications

| Fact | Source | Type | Slugs |
|---|---|---|---|
| Customers can edit a review for 24 hours | `apps/web/src/lib/reviews/review-edit-window.ts` 2 | Hardcoded | reviews-ratings-overview, reviews-management-overview |
| Notification channels: push, email, SMS, WhatsApp, live activities | `apps/web/src/lib/notifications/channel-types.ts` | Hardcoded | notifications-messaging-overview |
| Customer and provider preference sections | `apps/web/src/lib/notifications/notification-preferences-defaults.ts` 18-86 | Hardcoded | notifications-messaging-overview |
| Social login (Google, Apple) on customer app | `apps/customer/app/(auth)/login.tsx` | Hardcoded | getting-started-overview |
| Learning articles are English-only (no locale column; English FTS) | `supabase/migrations/304_learning_center_tables.sql` 24-58 | Hardcoded | — |

## Customer coverage (migration 10127)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Customer app bottom tabs are Home, Search, Bookings, Cart, Chats, Profile (`customer.home`, `customer.searchShort`, `customer.bookingsShort`, `customer.cart`, `customer.messagesShort`, `customer.profile`); Saved and Explore are hidden routes | `apps/customer/app/(app)/(tabs)/_layout.tsx` 302-369 | Hardcoded | wishlists-and-saved, explore-feed-posts-videos-collections |
| Profile quick actions Bookings, Orders, Wallet, Saved (`customer.profileTab.quickActions.*`); Saved → `/(app)/(tabs)/saved` | `apps/customer/app/(app)/(tabs)/profile.tsx` | Hardcoded | wishlists-and-saved, return-a-product |
| Profile Settings items Account settings, Payment methods, Notifications (opens inbox `/(app)/notifications`), Language & region (`/account-settings/preferences`), Privacy & sharing; Support items Safety & parental controls, Help centre | `apps/customer/app/(app)/(tabs)/profile.tsx`; `en.json` `customer.mobile.screens.profileTab.*` | Hardcoded | notification-preferences-customer, change-your-language, safety-tools-customer, gift-cards-buy-send-claim |
| Profile "Invite friends" banner only when referral programme enabled | `apps/customer/app/(app)/(tabs)/profile.tsx` | DB (`referral_settings`) | refer-friends-referrals |
| App Account settings groups: Account (…Privacy & sharing), Trust & Safety (Safety & parental controls, Age assurance & date of birth, Emergency contact, Parental controls — content & safety `contentSafetyTitle`, Blocked users), Bookings & Activity (Product orders, Returns & refunds → `/(app)/my-returns`, Custom requests, My reviews), Payments & Rewards (Wallet, Referrals), Preferences (Notifications, Language & region, Saved & wishlists) | `apps/customer/app/(app)/account-settings/index.tsx` 49-108; `en.json` `customer.accountSettings.*` | Hardcoded | all 10127 slugs |
| Web Account hub cards and routes: Wallet, Returns & Refunds, Product Orders, Notifications, Global preferences, Privacy & sharing, Safety & parental controls, Blocked users, content-and-safety, Referral credit & coupon, My Reviews, Wishlists & Recently Viewed, Custom Requests | `apps/web/src/app/account-settings/components/account-hub-grid.tsx` 49-80; `en.json` `web.accountSettings.*` | Hardcoded | all 10127 slugs |
| Delete account: app Privacy & sharing → "Delete account" (`customer.mobile.screens.privacySharing.deleteAccountSectionTitle` / `deleteAccountCta`) | `apps/customer/app/(app)/account-settings/privacy-and-sharing.tsx` | Hardcoded | delete-your-account |
| Delete flow: password or "Send verification code" + OTP for passwordless; optional Reason; type DELETE; "Delete account permanently" → confirm "Delete permanently"; signed out; suggests Login & security → Deactivate account | `apps/customer/app/(app)/account-settings/delete-account.tsx` | Hardcoded | delete-your-account |
| Web: Privacy & sharing → Advanced → "Request permanent account deletion…" → "Permanently delete account" | `apps/web/src/app/account-settings/privacy-and-sharing/*` | Hardcoded | delete-your-account |
| Grace period 30 days (`ACCOUNT_DELETION_GRACE_DAYS`) only when env `ACCOUNT_DELETION_GRACE_ENABLED`; otherwise immediate erase; cancel via email link or support, not by logging in | `apps/web/src/lib/account/account-deletion-config.ts` | Hardcoded value, env-gated | delete-your-account |
| Deletion revokes Apple Sign-In | `apps/web/src/app/api/me/delete-account/route.ts` | Hardcoded | delete-your-account |
| Web gift card purchase gated by `gift_cards` flag + online card checkout; off → "Gift cards are currently unavailable" | `apps/web/src/app/gift-card/purchase/*` | Flag | gift-cards-buy-send-claim |
| Web purchase: Choose a design, Amount per card (template denominations or custom min–max), Bulk purchase (qty 1–1000), recipient email/name, Personal message (max 500), Send later; login required | `apps/web/src/app/gift-card/purchase/*` (strings hardcoded English, no i18n) | DB (designs, denominations, limits) | gift-cards-buy-send-claim |
| App entry "Buy gift card" on Payment methods → Gift cards (`customer.paymentsScreen.buyGiftCard`); provider profile tab "Giftcard" | `apps/customer/app/(app)/account-settings/payments.tsx`; provider profile tabs | Hardcoded | gift-cards-buy-send-claim |
| App "Buy Gift Card": presets 100–5000, custom amount, qty 1–10, "For myself" / "Send as a gift", Send later, "Pay with card"; recipient emailed, auto-appears in wallet if they have an account | `apps/customer/app/(app)/gift-card-purchase*.tsx` | Hardcoded | gift-cards-buy-send-claim |
| Redeem: app Wallet → "Top Up Option" → "Gift Card"; web Wallet → "Top up / Redeem Gift Card" → "Redeem Gift Card"; pending card "A gift card is waiting" / "Add to wallet" | `apps/customer/app/(app)/account-settings/wallet.tsx`; `apps/web/src/app/account-settings/wallet/*` | Hardcoded | gift-cards-buy-send-claim |
| Redeem adds full balance; rejects inactive, zero-balance, expired, currency mismatch | `apps/web/src/app/api/me/wallet/redeem-gift-card/route.ts` | Hardcoded | gift-cards-buy-send-claim |
| Checkout payment method "Gift card" + "Gift card code" (`checkout.giftCard`, `checkout.giftCardCode`) | `en.json`; checkout screens | Flag (`gift_cards` on web) | gift-cards-buy-send-claim, custom-requests-and-offers |
| Referrals page: code, link, Copy Link, Share, stats Total Referrals / Successful / earned; disabled banner | `apps/customer/app/(app)/account-settings/referrals.tsx` 103-159; `en.json` `customer.referral.*`, `web.accountSettings.referrals.*` | Hardcoded labels | refer-friends-referrals |
| Reward amount from `referral_settings`; FAQ from `referral_faqs` with i18n fallback | `apps/web/src/app/api/me/referrals/*` | DB | refer-friends-referrals |
| Reward = referrer wallet credit (`wallet_credit_admin`) + loyalty points (`append_loyalty_ledger_entry`) on referred user's first eligible booking | `apps/web/src/app/api/me/referrals/track/route.ts` 25-27, 252-295; migration 996 | DB (amounts) | refer-friends-referrals |
| Qualifying booking = paid / partially paid (or confirmed zero-total) | `apps/web/src/lib/referrals/booking-qualifies-for-referral.ts`; used at `track/route.ts` 62 | Hardcoded | refer-friends-referrals |
| One referral per person; first attribution wins | `apps/web/src/app/api/me/referrals/attach/route.ts` | Hardcoded | refer-friends-referrals |
| Cancellation refunds credited to wallet; in-person payments returned by provider | `apps/web/src/lib/bookings/refund-processing.ts` 90-125 | Hardcoded | wallet-bank-refund |
| Bank refund pages: web `/account-settings/wallet/bank-refund`, app `account-settings/wallet-bank-refund.tsx`; entry "Request a bank refund" (web) / "Wallet help" (app) only when enabled and eligible/open | `apps/web/src/app/account-settings/wallet/bank-refund/BankRefundPageClient.tsx`; `apps/customer/app/(app)/account-settings/wallet-bank-refund.tsx` | DB | wallet-bank-refund |
| Flow: "Keep it on Beautonomi" → "Request a bank refund instead"; "Eligible for bank refund"; only Beautonomi card-payment refunds eligible (top-ups, gift cards, promo credit stay); amount min/max; fee + "You receive"; bank account / "Add a bank account"; "Submit request"; held while reviewed; EFT in N business days | same files; `en.json` bank refund keys | Hardcoded labels, DB values | wallet-bank-refund |
| enabled, min_amount, max_amount_per_request, fee_type/fee_value, sla_business_days, help_text | `apps/web/src/lib/wallet-bank-refunds/settings.ts` (`finance.wallet_bank_refunds`) | DB | wallet-bank-refund |
| One open request; "Cancel request" while pending; statuses pending/approved/paid/rejected/cancelled | `apps/web/src/lib/wallet-bank-refunds/*`; `BankRefundPageClient.tsx` | Hardcoded | wallet-bank-refund |
| Safety hub "Safety & parental controls" (`/(app)/safety`, web `/account-settings/safety`); not an emergency service; "Call 112" (South Africa) | `apps/customer/app/(app)/safety/index.tsx`; `apps/web/src/app/account-settings/safety/*` | Hardcoded | safety-tools-customer |
| "Contact trust & safety" opens ticket (category `safety_emergency`); "Report harassment or a user" | same files | Hardcoded | safety-tools-customer |
| Emergency contact fields Contact name, Relationship, Phone number, Email (optional); shared only during help requests / urgent tickets; web in Personal info | `apps/customer/app/(app)/account-settings/emergency-contact.tsx`; web personal-info | Hardcoded | safety-tools-customer |
| Booking "Safety / Get help" → "Request help" (`SafetyPanicButton`) gated by `modules.safety.enabled` + `safety.panic.enabled` | `apps/customer/src/components/**/SafetyPanicButton.tsx` | Flag | safety-tools-customer |
| Under 13 cannot use the app; 13–17 stricter defaults / Managed settings; unknown age → add date of birth | age assurance screens; `en.json` `customer.mobile.screens.contentSafety.*` | Hardcoded | safety-tools-customer, blocked-users-content-safety |
| Six content toggles: Restricted mode, Hide social feed, Disable comments & likes, Disable direct messaging, Sensitive content filter, Require device authentication | `apps/customer/src/lib/safety/safety-settings-client.ts` (`SAFETY_SETTING_KEYS`); `en.json` `customer.mobile.screens.contentSafety.*` | Hardcoded | blocked-users-content-safety |
| Block from chat header menu and Explore "More options"; confirm text "won't be able to message you and their content will be hidden from your feed"; Blocked users → "Unblock" | chat screen header menu; Explore post menu; `account-settings/blocked-users.tsx` | Hardcoded | blocked-users-content-safety, explore-feed-posts-videos-collections |
| Saved tabs Providers / Posts / Products (`customer.mobile.components.savedTab`); "New board"; Home header heart (`homeTab.savedA11y`) | `apps/customer/app/(app)/(tabs)/saved.tsx`; Home header | Hardcoded | wishlists-and-saved |
| Web wishlists page: boards, saved posts/providers/products, "New wishlist"; recently viewed at `/account-settings/wishlists/recently-viewed` | `apps/web/src/app/account-settings/wishlists/*` | Hardcoded | wishlists-and-saved |
| Return window 14 days from `delivered_at`; eligible statuses delivered / ready_for_collection | `apps/web/src/lib/ecommerce/product-return-eligibility.ts` (`PRODUCT_RETURN_WINDOW_DAYS`) | Hardcoded | return-a-product |
| "Request Return / Refund" (`productOrderDetail.requestReturnCta`); 7 reasons; "Additional Details (optional)"; "Submit Return Request"; 8 statuses; cancel when Pending; escalate when Rejected | order detail screens (app + web); returns screens `/(app)/my-returns`, `/account-settings/returns` | Hardcoded | return-a-product |
| Provider resolves with refund_method `store_credit` (default, wallet) or `cash` | `apps/web/src/app/api/provider/returns/[id]/route.ts` | Hardcoded | return-a-product |
| Custom request entry: provider profile "Custom request" tab → "Start your request" | provider profile screen | Hardcoded | custom-requests-and-offers |
| Form: description ≥10 chars, optional category, budget, duration, Where? At salon / At home (address), preferred slot, up to 6 photos (JPEG/PNG/WebP/GIF, 5 MB) | custom request screen (app + web) | Hardcoded | custom-requests-and-offers |
| Nothing booked until offer paid; requests close after 7 days | `packages/utils/src/custom-requests/constants.ts` (`CUSTOM_REQUEST_SUBMIT_EXPIRY_DAYS`) | Hardcoded | custom-requests-and-offers |
| Web offer actions "Accept & Pay", "Request changes", "Decline offer", "Cancel request"; checkout `/checkout/custom-offer/[id]`; app "Pay custom offer" with wallet, gift card code, loyalty points, deposit where offered | `apps/web/src/app/account-settings/custom-requests/*`; app pay-custom-offer screen | Hardcoded (deposit is provider-set) | custom-requests-and-offers |
| Offers can expire (`customer_custom_offer_expired`) | notification templates | Hardcoded | custom-requests-and-offers |
| Explore gated by `explore.enabled`; hidden for under 13 and when hide_social_feed on; hidden copy "Explore is turned off" | `apps/customer/src/lib/safety/explore-visibility.ts` | Flag | explore-feed-posts-videos-collections |
| Explore entry: Home header (app), site header `/explore` (web); Like, Comment, Save, Share; "Book this look"; "View Profile"; boards (`explore-collection/[id]`); saved `/explore/saved` | Explore screens app + web | Hardcoded | explore-feed-posts-videos-collections |
| Group "Who pays?": "I'll pay for everyone" / "Split payment"; hint about guests paying via link | `apps/customer/app/(app)/book-checkout.tsx`; `en.json` | Hardcoded | group-booking-invites-split-payment |
| Split only when provider opted in (`providers.group_split_payment_enabled`, default false) and card payment | `book-checkout.tsx` 2066-2071; migrations 1034, 1036 | DB (provider) | group-booking-invites-split-payment |
| Guest link by email/SMS, in-app if account; `/group-invite/{token}` with sign-in | `apps/web/src/lib/**/group-booking-notifications.ts` | Hardcoded | group-booking-invites-split-payment |
| Invite actions "Accept invite", "Your share", "Pay my share", "Cancel my spot"; too-late error; invalid/expired link | group invite screen; `en.json` | Hardcoded | group-booking-invites-split-payment |
| Organiser statuses Share paid / Share unpaid / Spot cancelled; Re-send invite, Remove guest, Reschedule session (organiser only), Resend pay link; removed organiser-paid guest credit → organiser wallet | group booking detail screen; `group-guest-refunds.ts` | Hardcoded | group-booking-invites-split-payment |
| Review edit/delete window 24h after posting; later admin only | `apps/web/src/lib/reviews/review-edit-window.ts` (`REVIEW_EDIT_WINDOW_MS`); `apps/web/src/app/api/bookings/[id]/review/route.ts` | Hardcoded | edit-or-delete-your-review |
| App My reviews → "Edit" → review-write (no delete); web My Reviews edit icon → "Edit Review" → "Save Changes", bin → delete confirm; "Provider reply" | `apps/customer/app/(app)/account-settings/reviews.tsx`; `apps/web/src/app/account-settings/reviews/*` | Hardcoded | edit-or-delete-your-review |
| Notification prefs: app sections Offers and updates, Account, Messages, Push notifications; web tabs Offers and updates / Account, "Edit" modal Email/SMS/WhatsApp/Browser, "Unsubscribe from all marketing emails", "View inbox" | `apps/customer/app/(app)/account-settings/notifications.tsx`; `apps/web/src/app/account-settings/notifications/*`; `en.json` `customer.mobile.screens.notificationPreferences.*` | Hardcoded | notification-preferences-customer |
| Marketing topics off unless consented; section keys inspiration_and_offers … messages | `apps/web/src/lib/notifications/notification-preferences-defaults.ts` | Hardcoded | notification-preferences-customer |
| Customer and provider apps use the same 28 bundled locales as the web. Unknown codes fall back to English. Arabic still asks for a restart so right-to-left layout can apply. | `packages/i18n/src/language-registry.ts` (`REVIEWED_UI_LANGUAGE_CODES`, `coerceMobileUiLanguage`); customer and provider language settings and signup | Hardcoded | change-your-language |
| Web "Global preferences" → "Preferred language" → "Edit"; 28 bundled locales (af … zu); Arabic RTL; app may show "Restart required" | `apps/web/src/app/account-settings/preferences/*`; `packages/i18n/src/locales/*.json` | Hardcoded | change-your-language |

### Not confirmed (omitted from articles)

- Trusted contacts or trip/appointment sharing: no customer feature found.
- Provider must respond to a return within 2 business days: only in app policy copy, not enforced in code.
- Return shipping labels or courier collection for returns: not stated.
- Any fixed referral reward amount: DB-configured, so not stated.
- Where a guest's own split-share payment is refunded: code (`group-guest-refunds.ts`, `refund_method 'original'`) and i18n say it goes to the card, which conflicts with the wallet-refund rule; destination omitted.
- 24–48 hour review time for harassment reports: i18n copy only, not stated.
- Whether a deletion grace period is enabled in production: env-dependent, so described conditionally.


## Provider money and policy coverage (migration 10129)

Evidence for every factual claim in `supabase/migrations/10129_learning_center_provider_money_coverage.sql`.
`en.json` = `packages/i18n/src/locales/en.json`. Line numbers are as of this migration.

**Type** — *Hardcoded*: value or behaviour fixed in code/copy, may be stated exactly. *DB-configurable*: value lives in `platform_settings`, feature flags, plans or tax tables, so articles describe it without fixed numbers.

### Navigation and labels

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| More tab sections "Grow your business", "Business", "Settings"; Business items Money, Billing, Team & pay, Payment setup | `apps/provider/app/(app)/(tabs)/more/index.tsx:183-194`; en.json:3466-3471, 3494-3501 | Hardcoded | all |
| More → Settings items "Travel fees", "Cancellation policies & fees" | `more/index.tsx:203-218`; en.json:3520-3523 | Hardcoded | provider-cancellation-policy-presets, provider-travel-fees-tiered, provider-reschedule-cancellation-settlement |
| More → Grow your business → "Promo codes" | `more/index.tsx:133-165`; en.json:3476 | Hardcoded | provider-gift-cards-promo-codes |
| More quick actions "Paystack Terminal", "Subscription", "Payouts", "Bank accounts" | `more/index.tsx:222-234`; en.json:3541-3544 | Hardcoded | provider-paystack-terminal, provider-subscription-billing-ios, provider-payout-accounts-cooling-off |
| Paystack Terminal quick action hidden unless `payment_paystack_virtual_terminal` | `more/index.tsx:241, 853-857` | Feature flag (DB) | provider-paystack-terminal |
| Payment setup / card machines / Paystack Terminal need Edit settings; Billing needs owner, manage_finance or edit_settings | `more/index.tsx` filtering (see 241, 853-857) | Hardcoded (permission) | provider-payout-accounts-cooling-off, provider-paystack-terminal, provider-subscription-billing-ios |
| Payout card: "Provider payouts", "All-time available to withdraw", "Min {{amount}}", "Complete Stripe Connect payout setup first" | en.json:3545-3550 | Hardcoded copy | provider-payout-rails-available-balance |
| Payment setup items: Payout bank accounts, Yoco payments (flag), Card machines (PayCloud flag), Paystack Terminal (flag), Gift cards, Terminal Shop | `more/payment-setup.tsx:69-81`; en.json:30587-30589, provider.mobile.screens.paymentSetup | Hardcoded + flags | provider-payout-accounts-cooling-off, provider-paystack-terminal, provider-gift-cards-promo-codes |
| Money hub tabs Overview, Ledger, Sales, Payouts | `more/money.tsx` | Hardcoded | provider-payout-rails-available-balance, provider-platform-fees-commission, provider-reschedule-cancellation-settlement |
| Billing hub tabs Plan, Invoices, Bills paid, VAT | `more/billing.tsx` | Hardcoded | provider-subscription-billing-ios, provider-taxes-vat |
| Team & pay tabs Payroll, Team totals, My earnings (owner/manage_payroll); staff see only My earnings; freelancer message | `more/team-pay.tsx`; en.json:11661-11667 | Hardcoded | provider-payroll-pay-runs |
| Settings & account → Sales: Payout accounts, Paystack Terminal, Receipt sequencing, Receipt template, Taxes, Travel fees, Tips, Tips distribution, Gift cards; Team → Commissions; Clients → Cancellation policies; Account → Subscription & plan | `more/settings-account-hub.tsx:110-127`; en.json:11036-11104 | Hardcoded (+ flags for terminals/Yoco) | all |
| App Yoco item is "Yoco integration" under Settings & account → Sales, flag `payment_yoco` | `settings-account-hub.tsx:110-127`; en.json (settingsAccountHub.itemYoco) | Feature flag (DB) | provider-paystack-terminal |
| Web sidebar Business: Finance `/provider/finance`, Bank Accounts `/provider/settings/payout-accounts`, Paystack Terminal (flag), Subscription `/provider/subscription`; Team & Marketing: Payroll `/provider/team/payroll`, My Earnings | `apps/web/src/components/provider/ProviderSidebar.tsx:126-142`; en.json:32660-32690 | Hardcoded + flags | provider-payout-accounts-cooling-off, provider-payout-rails-available-balance, provider-platform-fees-commission, provider-subscription-billing-ios, provider-payroll-pay-runs, provider-paystack-terminal |
| Web Settings categories and URLs (Clients → Cancellation Policies; Appointment Activity → Billing details and invoices, House calls & travel; Sales → Payout center `/provider/payouts`, Payout Accounts, Subscription & plan, Paystack Terminal, Receipt Sequencing, Receipt Template, Taxes, Travel Fees, Tips, Tips Distribution `/provider/settings/tips/distribution`, Gift Cards, Yoco Integration (flag); Team → Payroll, Commissions) | `apps/web/src/app/provider/settings/settings-categories.ts:26-29, 54, 72-87, 96-100`; en.json:26009-26221 | Hardcoded (+ `payment_yoco` flag) | all |
| Finance payouts tab URL `/provider/finance?tab=payouts` | `apps/web/src/app/provider/settings/payout-accounts/page.tsx:436` | Hardcoded | provider-payout-rails-available-balance |
| Promo codes web page `/provider/promotions` | `apps/web/src/app/provider/promotions/` | Hardcoded | provider-gift-cards-promo-codes |

### Cancellation presets, policies and settlement

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Presets: No penalty 0 h/0 min/100%; Flexible 4 h/15 min/50%; Standard 24 h/15 min/50%; Strict 48 h/15 min/0% + 50% deposit + no-show fee enabled with amount 0 | `packages/i18n/src/booking-policy-presets.ts:31-74` | Hardcoded | provider-cancellation-policy-presets |
| Default preset is Standard; "custom" falls back to Standard | `booking-policy-presets.ts:77, 84-87` | Hardcoded | provider-cancellation-policy-presets |
| Presets are applied only during onboarding | `apps/web/src/lib/provider/onboarding-booking-policy.ts:18`; `apps/web/src/app/provider/onboarding/page.tsx:3341-3344`; `apps/provider/src/features/provider-onboarding/WizardSteps.tsx:1503-1506` | Hardcoded | provider-cancellation-policy-presets |
| Policy editor labels: Add Policy, Edit, Policy Name, Hours Before Appointment, Refund Percentage, Fee Type (Fixed/Percentage), Fee Amount, Applies to, Set as Default Policy; hints for hours, refund and fee ("Only used when the refund is 0%.") | en.json:8578-8625 (provider.mobile.screens.cancellationPolicies) | Hardcoded copy | provider-cancellation-policy-presets |
| App cancellation-policies screen banner "No-show fees are configured under Payment Settings." opens Payment Settings | `apps/provider/app/(app)/(tabs)/more/settings/cancellation-policies.tsx:252-262`; en.json:8578 | Hardcoded | provider-cancellation-policy-presets |
| Payment Settings → No-show Fees: "Charge no-show fee", "No-show fee amount", hint "Taken only from what the client has already paid online, up to this amount." | `more/settings/payments.tsx:504-530`; en.json:2693 | Hardcoded copy; amount is provider-set | provider-cancellation-policy-presets |
| Effective policy: booking snapshot merged with live policy using the customer-friendlier value (min cutoff, max grace, max refund %, min fee); no-show fee only if enabled in both | `apps/web/src/lib/bookings/effective-cancellation-policy.ts:15-80` | Hardcoded | provider-cancellation-policy-presets |
| Refunds always credit the customer's wallet | `apps/web/src/lib/bookings/refund-processing.ts:4, 99-111` | Hardcoded | provider-cancellation-policy-presets, provider-reschedule-cancellation-settlement, provider-paystack-terminal |
| Fees only on the non-tip service basis; tips always returned; cash/card-machine never charged a fee | `apps/web/src/lib/bookings/settle-booking-cancellation.ts:210-224`; web cancellation-policies howBody copy | Hardcoded | provider-cancellation-policy-presets, provider-reschedule-cancellation-settlement, provider-team-commissions-tips |
| Provider/admin cancellations carry no policy fee; no-show gets the no-show fee | `settle-booking-cancellation.ts:230-236, 808-830` | Hardcoded | provider-cancellation-policy-presets, provider-reschedule-cancellation-settlement |
| Fee capped at collected amount (deposit-only bookings) | `settle-booking-cancellation.ts` (fee cap); en.json:27228 | Hardcoded | provider-reschedule-cancellation-settlement |
| Gift card: full refund voids redemption back to the card; partial refund leaves card spent and value goes to wallet credit | `settle-booking-cancellation.ts:412-436`; `reschedule-carry-over.ts:60-64` | Hardcoded | provider-reschedule-cancellation-settlement, provider-gift-cards-promo-codes |
| Cancellation fee posted as provider-retained `cancellation_fee`; staff share when "Share cancellation fees with staff" is on | `settle-booking-cancellation.ts` (postCancellationFeeShareLines); en.json:28914 | Hardcoded + provider setting | provider-reschedule-cancellation-settlement, provider-team-commissions-tips |
| Terminal (PayCloud/Yoco) refund portion is refunded on the machine; Yoco has no refund API | `settle-booking-cancellation.ts` (terminal refund obligation) | Hardcoded | provider-reschedule-cancellation-settlement |
| Non-terminal in-person cash creates a cash refund obligation deducted from wallet credit | `apps/web/src/lib/bookings/cancellation-cash-refund-obligation.ts`; `settle-booking-cancellation.ts` | Hardcoded | provider-reschedule-cancellation-settlement |
| Redeemed loyalty points restored, earned points clawed back | `settle-booking-cancellation.ts` | Hardcoded | provider-reschedule-cancellation-settlement |
| Failed wallet credit retried by cron; settlement stamped later | `settle-booking-cancellation.ts`; migration `10124` (`cancellation_settled_at`, `cancellation_settlement_attempts`) | Hardcoded | provider-reschedule-cancellation-settlement |
| Reschedule carry-over: original stays active until replacement paid or committed as cash; then full fee-free wallet refund; applied part debited onto new booking; excess stays in wallet; in-person cash/terminal not moved | `apps/web/src/lib/bookings/reschedule-carry-over.ts:1-8, 46-58` | Hardcoded | provider-reschedule-cancellation-settlement |
| Reason "Rescheduled to new time" | `reschedule-carry-over.ts:34` | Hardcoded | provider-reschedule-cancellation-settlement |
| Group bookings rescheduled from the group; in-person-paid bookings blocked with "reschedule it from the booking page… or ask the provider to refund the in-person amount first" | `reschedule-carry-over.ts:72-86` | Hardcoded | provider-reschedule-cancellation-settlement |
| Customer message "This booking is being replaced by your reschedule…" | `reschedule-carry-over.ts:93-94` | Hardcoded | provider-reschedule-cancellation-settlement |
| Package session restored, promo usage removed from old booking, waitlist matching runs | `reschedule-carry-over.ts:436-466` | Hardcoded | provider-reschedule-cancellation-settlement |

### Payout accounts, rails and balance

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Account number 8–20 digits; "Verify Account (optional)"; "Set Primary"; "Add another account before removing your only payout account"; "Stripe Connect" | en.json:27904, 27931, 27933, 27944, 27956 | Hardcoded | provider-payout-accounts-cooling-off |
| Step-up "Confirm it's you" for payout_account / stripe_connect / payout_transfer; device-too-new block message | `apps/web/src/lib/auth/provider-security.ts:322-379`; `apps/web/src/app/api/provider/payout-accounts/route.ts:203-204` | DB-configurable (`step_up` policy off/monitor/enforce) | provider-payout-accounts-cooling-off |
| Security alert to owner and acting staff on add/change; "Payout account added" by push and email | `apps/web/src/lib/auth/payout-cooling-off.ts:58-100`; `supabase/migrations/10122_security_notification_templates.sql` (security_payout_account_added) | Hardcoded (template text DB) | provider-payout-accounts-cooling-off |
| New-account cooling-off hold; first account exempt unless `cooling_off_first_account`; admin-added accounts held unless `cooling_off_admin_added` false; ≤0 hours = no hold | `apps/web/src/lib/auth/resolve-new-account-cooling-off.ts`; `payout-cooling-off.ts:9-13`; migration `10120` | DB-configurable (`payouts.new_account_cooling_off_hours`, `cooling_off_first_account`, `cooling_off_admin_added`) | provider-payout-accounts-cooling-off |
| Payout default account skips cooling accounts; choosing one returns "This bank account was added recently. For your security it can receive payouts once the hold ends." | `apps/web/src/app/api/provider/payouts/route.ts:309-325` | Hardcoded copy; hold length DB | provider-payout-accounts-cooling-off |
| Account currency must match payout currency | `payouts/route.ts:327-335` | Hardcoded | provider-payout-accounts-cooling-off |
| Rail derived from tenant payment provider: paystack (default), stripe, flutterwave | `apps/web/src/lib/payments/payout-rail.ts:30-39, 88-128`; `payouts/route.ts:261-283` | DB-configurable (per market) | provider-payout-rails-available-balance |
| Stripe ready = onboarding complete, charges and payouts enabled | `payout-rail.ts:88-128` | Hardcoded | provider-payout-rails-available-balance |
| Paystack and Flutterwave use a bank list; Stripe uses Connect onboarding | `apps/web/src/lib/payments/bank-directory.ts` | Hardcoded | provider-payout-rails-available-balance, provider-payout-accounts-cooling-off |
| Platform-held, payoutable tenders: paystack, stripe, flutterwave, wallet, gift_card; cash, PayCloud card machines, Yoco, bank transfer, manual card excluded | `apps/web/src/lib/provider/available-payout-balance.ts:16-31, 89-98` | Hardcoded | provider-payout-rails-available-balance, provider-gift-cards-promo-codes, provider-platform-fees-commission |
| Hold window applies to provider_earnings, tip, travel_fee, cancellation_fee; refunds always apply | `available-payout-balance.ts:23-25, 159-160, 425-428` | Hold days DB-configurable (`payout_hold_days`) | provider-payout-rails-available-balance |
| Available = earnings − completed payouts − pending/processing requests − open dispute reserve (floored at 0) | `available-payout-balance.ts:26-27, 525-546` | Hardcoded | provider-payout-rails-available-balance |
| Subscription and ad charges are billed to the provider's card and not netted from the payout balance | `available-payout-balance.ts:33-37` | Hardcoded | provider-payout-rails-available-balance |
| Headline revenue reports include provider-collected cash and read higher than available balance | `apps/web/src/app/api/provider/finance/route.ts:668-670` | Hardcoded copy | provider-payout-rails-available-balance |
| Payout hold message "Payouts are temporarily on hold while we review your account." | `payouts/route.ts:166-172` | Hardcoded copy | provider-payout-rails-available-balance |
| Minimum payout from tenant platform_settings | `payouts/route.ts:185-186` | DB-configurable (`minimum_payout_amount`) | provider-payout-rails-available-balance |
| Negative balance blocks payout; more than available = "Insufficient balance" | `payouts/route.ts:220-252` | Hardcoded | provider-payout-rails-available-balance |
| Paystack Terminal payments payoutable after manual allocation and holds | en.json:28159 (virtualTerminalsDescription) | Hardcoded copy | provider-payout-rails-available-balance, provider-paystack-terminal |

### Subscription and billing

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| iOS native uses Apple IAP; Android and web stay on Paystack | `apps/provider/src/lib/iap/platform.ts`; en.json:3413 | Hardcoded | provider-subscription-billing-ios |
| "Billed through Apple", "Billed through Stripe", "Restore App Store purchases", "Redeem App Store offer code" | en.json:3418, 3420, 3428, 3432 | Hardcoded copy | provider-subscription-billing-ios |
| Cancel Apple subscription at least 24 h before period end in Apple ID → Subscriptions; keep access until period end | en.json:3384 | Hardcoded (Apple rule) | provider-subscription-billing-ios |
| "This subscription is billed on Android or the website. Manage it there so you are not charged twice." | en.json:3407 | Hardcoded copy | provider-subscription-billing-ios |
| Paystack cancel: "Your plan stays active until the end of the current billing period. You can renew anytime before it expires." | en.json:3326 | Hardcoded copy | provider-subscription-billing-ios |
| Paid-to-paid downgrade scheduled at period end, no proration; "Plan change scheduled. Changes on {{when}}." | `apps/web/src/app/api/provider/subscription/upgrade/route.ts:339-391`; migration `10101` (scheduled_billing_period); en.json:3340 | Hardcoded | provider-subscription-billing-ios |
| Pending upgrade recorded; "Finish upgrade to {{plan}}" | migration `1028`; en.json:3446 | Hardcoded | provider-subscription-billing-ios |
| Invoice statuses paid / partially_paid / overdue; overdue notifications | migration `1015` | Hardcoded | provider-subscription-billing-ios |
| Monthly / Yearly segments; prices by region | en.json:3411, 3452-3453 | Prices DB-configurable | provider-subscription-billing-ios |
| Provider invoice types subscription, transaction_fee, other; platform_fee/commission invoices cancelled ("Platform fees are customer-paid and retained at checkout") | migration `1025` | Hardcoded | provider-platform-fees-commission |

### Fees, commission and tax

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Commission off unless `payouts.commission_enabled === true`; rate = platform_commission_percentage or providers.commission_override; tenant row else global | `apps/web/src/lib/finance/resolve-commission-percentage.ts:20-47` | DB-configurable | provider-platform-fees-commission |
| Booking's `commission_percentage_snapshot` preferred | `apps/web/src/lib/finance/resolve-commission-percentage-for-booking.ts` | Hardcoded | provider-platform-fees-commission |
| Commission zeroed unless payment is platform-held; platform_fee zeroed for non-platform-held tenders or booking_source provider/walk_in | migration `1027` (create_finance_ledger_from_payment):112-127 | Hardcoded | provider-platform-fees-commission |
| Tips posted with commission 0; travel_fee net = full amount; tax net 0 | migration `1027` | Hardcoded | provider-platform-fees-commission, provider-travel-fees-tiered, provider-team-commissions-tips |
| VAT pass-through, excluded from commission | en.json:8299; taxes page About text | Hardcoded | provider-taxes-vat, provider-platform-fees-commission |
| Promo hint "Discounts reduce what you collect on covered bookings" | en.json:29380 | Hardcoded copy | provider-platform-fees-commission, provider-gift-cards-promo-codes |
| Taxes page title "Taxes & VAT"; "I am VAT registered with SARS"; "VAT Number (SARS)" | en.json:28253, 28263, 28269 | Hardcoded | provider-taxes-vat |
| VAT number regex `^4\d{9}$` (10 digits starting with 4) | `apps/web/src/app/provider/settings/sales/taxes/page.tsx` | Hardcoded | provider-taxes-vat |
| "Prices include VAT" default on; enabled = prices include VAT, disabled = added at checkout | `taxes/page.tsx:216-219` | Hardcoded | provider-taxes-vat |
| Tax Rate read-only; rate resolved from provider override else platform default for tenant country | `taxes/page.tsx`; migrations `10102`, `10113` | DB-configurable (tax_rates) | provider-taxes-vat |
| No country rate → "No country VAT rate is configured for this provider. Registration was not saved." | `apps/web/src/lib/provider-settings/apply-provider-tax-settings-patch.ts` | Hardcoded | provider-taxes-vat |
| Unregister sets rate 0 and VAT number null | `apply-provider-tax-settings-patch.ts`; migration `10102` constraints | Hardcoded | provider-taxes-vat |
| Bookings/product orders snapshot `tax_inclusive` and `provider_vat_number_snapshot` | migration `10102` | Hardcoded | provider-taxes-vat |
| Refunds reverse tax proportionally | migration `10103` | Hardcoded | provider-taxes-vat |
| Receipts show tax_amount and tax_rate | `apps/web/src/app/api/provider/bookings/[id]/receipt/route.ts:392-393` | Hardcoded | provider-taxes-vat, provider-receipts-template-numbering |

### Payroll, commissions and tips

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| payroll.v2 flag enabled; provider_settings.payroll_v2_enabled true, PAYE/UIF applied on pay runs | migration `10115` | Feature flag (DB) → "where available" | provider-payroll-pay-runs |
| SA tax-year rules stored in DB | migration `10114` | DB-configurable | provider-payroll-pay-runs |
| "New Pay Run", "Mark as Paid", "Export CSV"; period types weekly/biweekly/semi-monthly/monthly/custom; draft → approved → paid | en.json:29497, 29659, 27008; `apps/web/src/app/provider/team/payroll/` | Hardcoded | provider-payroll-pay-runs |
| Minimum-wage compliance warning with "Suggested top-up {{amount}}" | `apps/web/src/lib/payroll/compliance-guards.ts:6, 27-29`; en.json:29684 | Hardcoded (wage value DB) | provider-payroll-pay-runs |
| Booth renters skipped; carry-forward from last approved/paid run; statutory mode auto/manual/none | `apps/web/src/lib/payroll/pay-run-engine.ts`; migration `1016` | Hardcoded | provider-payroll-pay-runs |
| Commission clawback and carry_forward_in/out columns | migration `1016` | Hardcoded | provider-payroll-pay-runs |
| Payslip printable HTML, only after approval, staff only their own | `apps/web/src/app/api/provider/pay-runs/items/[itemId]/payslip/route.ts:43` | Hardcoded | provider-payroll-pay-runs |
| Freelancers blocked: "Upgrade to a salon account to run payroll and team pay."; owner or manage_payroll required | en.json:11667; `apps/web/src/lib/payroll/payroll-access.ts:25` | Hardcoded | provider-payroll-pay-runs |
| "Commissions & Compensation", "Commission setup checklist", "Enable Commission", "Share cancellation fees with staff", "Tiered Commission (Optional)" | en.json:28892, 28904, 28914, 28921, 28927 | Hardcoded | provider-team-commissions-tips |
| Tier modes: Retroactive (whole period at tier reached) and Marginal (rate per band only) | en.json:28955-28956; `apps/web/src/lib/payroll/__tests__/compute-compensation.test.ts:33-63` | Hardcoded | provider-team-commissions-tips |
| Pay models; employment type; "Statutory deductions (PAYE / UIF)" Auto/Manual/None; only Manage payroll can change rates | `apps/web/src/app/provider/settings/team/commissions/page.tsx`; en.json:28969 | Hardcoded | provider-team-commissions-tips, provider-payroll-pay-runs |
| "Tips are on by default for every provider."; solo providers keep tips; salons choose | en.json:28529-28530 | Hardcoded | provider-team-commissions-tips |
| "Keep All Tips" / "Distribute Tips to Staff" (to assigned staff member); change affects future bookings only | en.json:29215-29217; `apps/web/src/app/provider/settings/tips/distribution/page.tsx` | Hardcoded | provider-team-commissions-tips |

### Travel fees, receipts, gift cards, promo codes, Paystack Terminal

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| No fee/booking unless offers_mobile_services and an active location | `apps/web/src/lib/travel/calculateTravelFeeForHold.ts` | Hardcoded | provider-travel-fees-tiered |
| Distance from nearest active location via driving distance, straight-line fallback | `apps/web/src/lib/travel/travelFeeEngine.ts` | Hardcoded | provider-travel-fees-tiered |
| Address must be in a selected service zone and within max_service_distance_km | `calculateTravelFeeForHold.ts`; `buildAtHomeTravelFeeRules.ts` | Provider/DB-configurable | provider-travel-fees-tiered |
| Per-km model (rate, minimum, optional maximum, free-within km) or tiered (ascending max_km + fee); beyond last tier = outside area | `travelFeeEngine.ts`; migration `3291` | Model hardcoded, values provider/DB | provider-travel-fees-tiered |
| Zone-specific travel_fee overrides computed fee | `calculateTravelFeeForHold.ts` | DB-configurable | provider-travel-fees-tiered |
| Labels "Enable Travel Fees", "Use Platform Default Rates", "Live travel-fee preview", "Per kilometer", "Distance tiers", "Add tier", "Provider customization is currently disabled by the platform…" | en.json:28561-28589 | Hardcoded copy; defaults DB | provider-travel-fees-tiered |
| Receipt template Header, Footer, Prefix (default REC), next number ≥ 1; preview PREFIX-00001 | `apps/web/src/app/provider/settings/sales/receipt-template/page.tsx` | Hardcoded default | provider-receipts-template-numbering |
| Receipt Sequencing "Receipt Prefix", "Starting Number" write the same endpoint | en.json:28225-28226; `receipt-sequencing/page.tsx`; `/api/provider/settings/sales/receipt` | Hardcoded | provider-receipts-template-numbering |
| Prefix/header/footer length limits from platform sales settings | `platform-sales-settings` fallbacks | DB-configurable | provider-receipts-template-numbering |
| Booking receipt number = booking_number; prefix-number only as fallback; header/footer printed | `apps/web/src/app/api/provider/bookings/[id]/receipt/route.ts:309-315, 352-353` | Hardcoded | provider-receipts-template-numbering |
| "Enable Gift Cards" with platform-sold, redeem-anywhere copy | en.json:28124-28125 | Hardcoded | provider-gift-cards-promo-codes |
| Enabling gift cards requires a plan that includes them | `apps/web/src/app/api/provider/settings/sales/gift-cards/route.ts:107-119` | DB-configurable (plan features) | provider-gift-cards-promo-codes |
| Promo fields: Code, Percentage/Fixed amount, Value, Starts/Ends, No end date, Total uses, Minimum booking amount, Max discount (%), One use per client, Salon branch/All salons, Show on my public profile; statuses Active/Scheduled/Expired/Used up/Off | en.json:29377-29421 | Hardcoded | provider-gift-cards-promo-codes |
| Used code cannot be deleted: "This code has been used. Turn it off instead of deleting." | en.json:29431; `apps/web/src/app/api/provider/promotions/[id]/route.ts:277` | Hardcoded | provider-gift-cards-promo-codes |
| One use per client covers bookings and product orders | migration `1026`; `apps/web/src/lib/pricing/checkout-promotion-discount.ts` | Hardcoded | provider-gift-cards-promo-codes |
| Provider codes are not platform-wide coupons | en.json:7457 | Hardcoded copy | provider-gift-cards-promo-codes |
| "Request Paystack Terminal setup"; admin-provisioned; code/link/QR/poster | en.json:28176, 28159; `apps/web/src/app/provider/settings/sales/paystack-terminal/page.tsx` | Hardcoded | provider-paystack-terminal |
| "Approve match", "Send to admin to allocate" | en.json:28208-28210 | Hardcoded | provider-paystack-terminal |
| Plan gating message; market gating message | en.json:28161, 7146 | Plan/market DB-configurable | provider-paystack-terminal |
| Card machines = PayCloud terminals | en.json (paymentSetup.hintCardMachines) | Hardcoded | provider-paystack-terminal |

### Not confirmed (dropped or hedged)

- **48-hour cooling-off**: the seed and code default are 48 hours, but the value comes from `platform_settings` and is never stated as fixed. Booleans are described as "depending on platform settings".
- **Minimum payout of 100**: this is only a code fallback (`payouts/route.ts:185`); the real value is DB-configurable, so it was dropped.
- **Payout hold days**: the default fallback is 0, and the value is DB-configurable. The articles describe the hold without a number.
- **15% VAT**: it appears in seed data and UI copy, but the rate resolves from `tax_rates` per country. It was dropped.
- **Receipt prefix max 20, header/footer max 2000**: these are fallback constants and the real values are DB-configurable. They were dropped.
- **`receipt_next_number` incrementing**: there is no code path that increments it. Articles say only that the prefix and number are a fallback.
- **Changing deposits after onboarding**: no provider settings UI for the deposit was located, so this is not described.
- **No-show fee settings on the web**: these were only found in the app Payment Settings screen, and the web Payment Methods page has no no-show fields. The articles cite the app only.
- **Subscription prices and commission percentages**: these are DB-configurable and were not stated.
- **Stripe-billed subscriptions availability by market**: only the "Billed through Stripe" copy was confirmed. The markets that use it were not confirmed.
- **How staff open their own payslip (exact path)**: the API restricts staff to their own payslip. The navigation path was not confirmed.
- **Payroll `vatPayeHint` copy** ("stay at R0 until automation ships"): this is stale product copy that contradicts payroll v2 and was not repeated.
- **Paystack Terminal settings item on the web Settings page**: this item is not flag-gated in `settings-categories.ts:80`, while the sidebar item is. The articles use "where available".


## Provider operations and growth coverage (migration 10128)

Path prefixes: `APP` = `apps/provider/app/(app)`, `WEB` = `apps/web/src/app/provider`, `API` = `apps/web/src/app/api/provider`, `EN` = `packages/i18n/src/locales/en.json`, `MIG` = `supabase/migrations`.

Slug keys: DASH = provider-dashboard-cards-metrics, CHAT = provider-chats-engagement-hub, ADS = provider-buy-ads, EXP = provider-explore-posts, CRQ = provider-custom-requests-offers, AI = provider-ai-studio, RWD = provider-rewards-badges, REF = provider-referrals-referral-sources, RES = provider-resources-forms, INV = provider-inventory-suppliers-variants, SHP = provider-shipping-collection-returns, EXB = provider-express-booking-links, CPB = provider-closed-periods-blocked-time-waitlist, CAL = provider-calendar-sync-integrations, BIZ = provider-business-profile-upgrade-salon, STF = provider-staff-public-title-bookable-from.

### Navigation (shared)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| App tabs: Dashboard, Clients, Chats, Bookings, More | `APP/(tabs)/_layout.tsx:346-403`; `EN` common.more | Hardcoded | DASH, CHAT |
| More screen menu sections & labels (Buy ads, Resources & forms, Custom Requests, Products & e-commerce, Team & scheduling, Engagement, Explore posts, Rewards & badges, Settings & account) | `APP/(tabs)/more/index.tsx:131-219`; `EN:3465-3545` (moreTab) | Hardcoded | ADS, RES, CRQ, INV, SHP, STF, CHAT, EXP, RWD, BIZ |
| More quick actions: Express booking, Front Desk, Custom requests, Buy ads | `APP/(tabs)/more/index.tsx:222-235` | Hardcoded | EXB, CRQ, ADS, DASH |
| Buy ads quick action needs marketing permission; menu ads/settings entries need edit-settings permission | `APP/(tabs)/more/index.tsx:308-309, 1134-1141` | Hardcoded | ADS |
| Settings & account categories: Appointment & activity, Clients, Services, Sales, Team, Marketing, Account | `APP/(tabs)/more/settings-account-hub.tsx:65-165`; `EN:10952` | Hardcoded | CPB, REF, AI, ADS, CAL, RWD, BIZ, RES |
| Settings & account items: Business details (69), Business description (70), Resources (80), Closed periods (81), Blocked time (82), Waitlist (83), Referral sources (92), Refer a business (93), AI studio (148), Paid ads (149), Email integration (150), Twilio (151), Rewards & badges (165) | `APP/(tabs)/more/settings-account-hub.tsx` at listed lines | Hardcoded | BIZ, RES, CPB, REF, AI, ADS, CAL, RWD |
| Web sidebar sections/items (Front desk, Closed periods, Resources, Forms, Orders, Returns, Products, Shipping, Rewards & badges, Explore content, Team members, Reviews, Messages, Paid ads, Booking links → /provider/express-booking) | `apps/web/src/components/provider/ProviderSidebar.tsx:72-158`; `EN:32613-32702` | Hardcoded | all |
| Sidebar items with a featureFlag are hidden when the flag is off | `ProviderSidebar.tsx:373-381` | DB-configurable (feature flags) | general "where available" wording |
| Web More hub at /provider/more mirrors app menu; reached via bottom nav below `md` | `apps/web/src/lib/provider-more-config.ts:140-146, 243, 345-409`; `ProviderBottomNav.tsx:18-24, 116` | Hardcoded | CRQ, CHAT |
| Web Settings tabs: Appointment Activity, Clients, Services, Sales, Team, Marketing, Account | `WEB/settings/settings-categories.ts:17-125`; `EN:25959-25968` | Hardcoded | CPB, CAL, BIZ, ADS, AI |

### Dashboard (DASH)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| "Under review" banner while business is pending | `APP/(tabs)/dashboard.tsx:940-986`; `EN:5787` | Hardcoded | DASH |
| Quick buttons New / Walk-in appt / Retail; Sell (POS) only when unified POS flag on | `APP/(tabs)/dashboard.tsx:450, 1150-1203` | Flag DB-configurable (`provider.unified_pos_checkout`) | DASH |
| App sections: This period, How you earned it, Earnings trend, Booking status, Channel, Performance, Balances now, Your standing, Rewards, Upcoming, Recent activity | `APP/(tabs)/dashboard.tsx:1241, 1294, 1373, 1382, 1483, 1613, 1654, 1707, 1732, 1781, 1887`; `EN:5755-5813` | Hardcoded | DASH |
| Rewards banner / ledger footnote copy | `EN:5675, 5813` | Hardcoded | DASH |
| Web dashboard stat cards, earnings, expenses, performance, status, booking type blocks | `WEB/dashboard/DashboardClient.tsx:548-660, 670-721, 730-756, 765-784, 792, 836`; `EN:25785` | Hardcoded | DASH |
| Front desk date ranges All/Today/Week/Month/Year (verified existing article) | `WEB/front-desk/CommandCenter.tsx:34-38` | Hardcoded | (existing article) |

### Chats & Engagement (CHAT)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Chats tab re-exports the messaging list | `APP/(tabs)/_layout.tsx`; `APP/(tabs)/more/messaging/index.tsx` | Hardcoded | CHAT |
| Long-press a conversation to pin | `messaging/index.tsx:332` | Hardcoded | CHAT |
| Messaging-disabled state | `messaging/index.tsx:243-255`; `EN:9511` | Hardcoded | CHAT |
| Engagement hub tiles: Messages → chats; Marketing tile only with marketing permission; Support tickets; Reviews Manage | `APP/(tabs)/more/engagement-hub.tsx:117, 128-143, 148, 180`; `EN:12964-12972` | Hardcoded | CHAT |
| Web engagement page & Messages sidebar unread count | `WEB/engagement/page.tsx`; `EN:30569`; `ProviderSidebar.tsx:153` | Hardcoded | CHAT |

### Buy ads (ADS)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Ads require plan feature platformAds | `API/ads/campaigns/route.ts:276-284, 319-322` | DB-configurable (plan features) | ADS |
| Pack availability/prices come from ads_module_config / packs tables | `API/ads/packs/route.ts:38-76` | DB-configurable | ADS |
| In-app checkout via Paystack; Apple IAP path on iOS; CPC hidden under IAP | `APP/(tabs)/more/settings/ads.tsx:572-573, 614` | Hardcoded logic, prices DB-configurable | ADS |
| CPC budget can be lowered, not raised | `EN:1868` | Hardcoded | ADS |
| Sponsored placement copy | `EN:1909, 1914`; `EN:26382` (web ads) | Hardcoded | ADS |
| Web return page redirects to ?payment_success=1 | `WEB/settings/ads/payment-return/page.tsx:189` | Hardcoded | ADS |

### Explore posts (EXP)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Max 5 media per post | `apps/web/src/app/api/explore/posts/route.ts:986`; `EN:5616` | Hardcoded | EXP |
| Creating posts requires create_explore_posts permission | `api/explore/posts/route.ts:931-966` | Hardcoded | EXP |
| Drafts and published states; link to a booking | `APP/(tabs)/more/explore-posts.tsx:1216, 1436, 1442`; `MIG/10107*`, `MIG/10108*` | Hardcoded | EXP |
| Post-completion prompt to share a finished appointment | `PostCompletionSheet.tsx:126`; `EN:8302-8319` | Hardcoded | EXP |
| Library / Camera, Post now / Create post, background sound labels | `EN:5596+` (explorePosts) | Hardcoded | EXP |

### Custom requests & offers (CRQ)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Custom Requests in More menu & web More hub (/provider/custom-requests) | `more/index.tsx:174, 226`; `provider-more-config.ts:140-146` | Hardcoded | CRQ |
| Offer duration 15–480 min; expiry ≥1 day; app default 7 days | `APP/(tabs)/more/custom-requests/[id].tsx:176, 200-214`; `EN:6712` | Hardcoded | CRQ |
| Custom offer button in chat when the client is known | `messaging/[id].tsx:958-965`; `EN:12422` | Hardcoded | CRQ |
| Requests list copy | `EN:13245-13258`; `EN:29956` (web) | Hardcoded | CRQ |

### AI Studio (AI)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Tool list | `APP/(tabs)/more/ai-studio.tsx:15-52`; `EN:13167-13169` | Hardcoded | AI |
| "Apply" writes generated bio to profile | `ai-studio.tsx:196-209` | Hardcoded | AI |
| Plan entitlement check; "not available for your plan" | `API/ai/[feature_key]/route.ts:93-98` | DB-configurable (plan) | AI |
| Web page at Settings → Marketing → AI | `WEB/settings/ai/page.tsx` | Hardcoded | AI |

### Rewards & badges (RWD)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Points and Badges tabs | `APP/(tabs)/more/rewards-hub.tsx`; `EN:11548`, `EN:10202` | Hardcoded | RWD |
| Point values per action set by Beautonomi (not stated as numbers) | `MIG/228_*provider_point_rules*.sql` | DB-configurable | RWD |
| Web gamification page | `WEB/gamification/page.tsx`; `EN:22823`; `EN:12994` | Hardcoded | RWD |

### Referrals (REF)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Refer a business screen & fields | `APP/(tabs)/more/refer-a-business.tsx`; `EN:22143` | Hardcoded | REF |
| Duplicate check on email/phone before creating lead | `API/referrals/route.ts:18-21, 41-65`; `EN:30450` | Hardcoded | REF |
| Referral sources list (how clients heard of you) | `APP/(tabs)/more/settings/referral-sources.tsx`; `EN:9089` | Hardcoded | REF |

### Resources & forms (RES)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Resource types | `APP/(tabs)/more/resources.tsx:53-58`; `EN:12827`, `EN:34557` | Hardcoded | RES |
| Resources gated by serviceResources plan feature | `API/resources/route.ts:137-141` | DB-configurable (plan) | RES |
| Forms require edit_settings | `API/forms/route.ts:75` | Hardcoded | RES |
| Forms copy (intake, responses on bookings) | `EN:6579-6609`; `EN:34383` | Hardcoded | RES |
| Hub screen | `APP/(tabs)/more/resources-forms-hub.tsx`; `EN:8988`, `EN:30604` | Hardcoded | RES |

### Inventory, suppliers, variants (INV)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Products & e-commerce hub routes | `APP/(tabs)/more/products-ecommerce-hub.tsx:155-303`; `EN:7695` | Hardcoded | INV, SHP |
| Products / Inventory tabs | `products-hub.tsx`; `EN:11542`, `EN:7661-7665` | Hardcoded | INV |
| Supplier picker with "Add new supplier" | `product-form.tsx:254-268`; `MIG/3141_*product_suppliers*.sql` | Hardcoded | INV |
| Variants | `product-form.tsx`; `EN:1611-1710`; `MIG/2851_*product_variants*.sql` | Hardcoded | INV |
| Web products page links to /provider/catalogue/products; dialog has supplier + variants | `WEB/ecommerce/products/page.tsx:121, 248`; `ProductCreateEditDialog.tsx` | Hardcoded | INV |

### Shipping, collection, returns (SHP)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Courier options Manual, Aramex, Courier Guy, Bob Go | `WEB/ecommerce/shipping/page.tsx:269-300`; `MIG/1010*` (Bob Go) | Hardcoded | SHP |
| Only owner can view/edit courier keys; live courier booking switched on by Beautonomi | `EN:29819, 29839`; `EN:7793` | Hardcoded copy; enablement DB-configurable | SHP |
| App shipping config | `APP/(tabs)/more/settings/shipping-config.tsx`; `EN:7769-7795` | Hardcoded | SHP |
| Orders / Returns tabs | `orders-hub.tsx:50-51`; `product-returns.tsx`; `EN:10105`, `EN:29554` | Hardcoded | SHP |
| Return refund method cash / store credit | `API/returns/[id]/route.ts:27` | Hardcoded | SHP |

### Express booking links (EXB)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| App screen title "Booking Links"; web Booking links → /provider/express-booking | `APP/(tabs)/more/express-booking.tsx`; `EN:5464`; `ProviderSidebar.tsx:157`; `EN:34058` | Hardcoded | EXB |
| Plan feature access + link-count limit (not stated as number) | `API/express-booking/route.ts:43-45, 118`; `EN:5520` | DB-configurable (plan) | EXB |
| Copy / Share / Embed / Pause / Activate / click count (app) | `EN:5464+` | Hardcoded | EXB |

### Closed periods, blocked time, waitlist (CPB)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Closed periods with types and affected bookings count | `APP/(tabs)/more/settings/closed-periods.tsx`; `EN:6763`, `EN:26687` | Hardcoded | CPB |
| App "Blocked time" manages named types | `APP/(tabs)/more/settings/blocked-time.tsx`; `EN:8169` | Hardcoded | CPB |
| Web blocked-time page adds Break / Maintenance availability blocks | `WEB/settings/appointment-activity/blocked-time/page.tsx`; `EN:26586` | Hardcoded | CPB |
| Waitlist settings: max size, auto-remove days, auto-booking (web) | `APP/(tabs)/more/settings/waitlist-settings.tsx`; `EN:9257`, `EN:26819-26838` | Values set by provider | CPB |

### Calendar sync & integrations (CAL)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Google, Outlook, Apple calendar (web only) | `WEB/settings/calendar-integration/page.tsx`; `API/calendar/providers/route.ts:18, 33`; `EN:27145-27175` | Hardcoded | CAL |
| Calendar sync behind SubscriptionGate | `calendar-integration/page.tsx:29` | DB-configurable (plan) | CAL |
| Email integration, Twilio SMS/WhatsApp senders | `settings/email-integration.tsx`; `settings/twilio-integration.tsx`; `EN:27463`, `EN:27528` | Hardcoded | CAL |
| Marketing integrations (opens in-app browser in app) | `settings/marketing-integrations.tsx`; `EN:3816`, `EN:27686-27722` | Hardcoded | CAL |

### Business profile & upgrade (BIZ)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Description max 2000 chars | `WEB/settings/business-description/page.tsx:51`; `EN:27052` | Hardcoded | BIZ |
| Setup checklist needs description ≥10 chars | `business-description/page.tsx:65-66`; `apps/web/src/app/api/provider/setup-status/route.ts:172-174`; `EN:27045` | Hardcoded | BIZ |
| Freelancer upgrade item / web banner | `settings-account-hub.tsx:369-372`; `WEB/settings/page.tsx:82-98, 153-155` | Hardcoded | BIZ |
| Upgrade needs plan feature allows_salon_upgrade; one-time upgrade; data preserved | `API/upgrade-to-salon/route.ts:48-90`; `EN:29222-29241` | DB-configurable (plan) | BIZ |

### Staff public title & bookable from (STF)

| Fact | Source file:line | Hardcoded or DB-configurable | Slugs |
|---|---|---|---|
| Public title max 120 chars | `WEB/team/members/components/TeamMemberCreateEditDialog.tsx:818-833`; `MIG/1019*`; `EN:32565` | Hardcoded | STF |
| Bookable-from date hides staff from online booking until then | `TeamMemberCreateEditDialog.tsx:818-833`; `apps/web/src/lib/provider/staff-public-bookable.ts:16-31`; `MIG/1018*`; `EN:32597` | Hardcoded | STF |
| Enable in online booking toggle | `TeamMemberCreateEditDialog.tsx:982` | Hardcoded | STF |
| App team member detail shows bookable-from; Edit opens profile sheet | `APP/(tabs)/more/team.tsx:550`; `team-member/[id].tsx:634-637, 684-687`; `StaffProfileEditSheet.tsx:118-120, 296-299, 376`; `EN:6048-6118` | Hardcoded | STF |

### Not confirmed (dropped from articles)

- Effect of Customer Visibility settings: `provider_customer_visibility_settings` is only read/written by its own route/page, never enforced; app and web copy also disagree.
- Navigation to a dedicated Suppliers screen in the app (screen exists, no menu link); suppliers documented via the product form only.
- "Referral received" automation trigger tied to referral sources.
- Marketing credits minimum top-up amount ("R10" copy not verified against config).
- Bob Go "about 10 minutes" tracking catch-up interval.
- Checkout-hold behaviour (`MIG/10116`) — no provider UI found.
- Explore video length limit.
- Calendar sync inside the native app (web only).
- App navigation path to the Marketing Integrations credits screen.
- Web equivalents of app-only link actions (Embed, Prefill, click count) on Booking Links.
- Exact label of the upgrade start button (only "Confirm Upgrade" verified).

## Internal runbooks (migration 10130)

Every factual claim in `supabase/migrations/10130_learning_center_internal_runbooks.sql` traces to a row below. Line numbers are from the tree at the time of writing.

### Facts

| Fact | Source file:line | Slugs |
| --- | --- | --- |
| Booking and admin refunds always credit the customer's wallet (platform policy) | apps/web/src/lib/bookings/refund-processing.ts:4; apps/web/src/app/api/admin/bookings/[id]/refund/route.ts:15 | disputes-refund-ops-overview, money-path-refunds-vat-runbook, providers-bookings-runbook |
| Admin refunds run through `issueAdminWalletRefund` (period lock, booking_refunds, wallet credit, payment update, gift-card restore, notify, negative-balance check, audit) | apps/web/src/lib/finance/issue-admin-wallet-refund.ts:104 | disputes-refund-ops-overview, money-path-refunds-vat-runbook |
| Dispute resolutions are refund_full, refund_partial, deny | apps/web/src/app/api/admin/disputes/[id]/route.ts:21 | disputes-refund-ops-overview |
| Product-return resolutions: full_refund, partial_refund, replacement, store_credit, denied; refunds paid as store credit | apps/web/src/app/api/admin/product-returns/[id]/route.ts:20, :97, :120 | ecommerce-runbook |
| Wallet → bank: amount is held (wallet debit) at submit; reject or cancel re-credits it; paid is terminal | supabase/migrations/1008_wallet_bank_refund_requests.sql:11-12 | money-path-refunds-vat-runbook, disputes-refund-ops-overview |
| Wallet → bank tab lives on Refunds; deep link `?tab=bank` | apps/admin-web/src/routes/refunds/RefundsListPage.tsx:590, :604; apps/admin-web/src/routes/users/UserDetailPage.tsx:1525 | disputes-refund-ops-overview, money-path-refunds-vat-runbook |
| Stale-payment refunds retried after 10 min, max 5 attempts, batch 50 | apps/web/src/lib/payments/retry-stale-payment-refunds.ts:7-9; supabase/migrations/1035_stale_payment_refunds.sql:4; supabase/migrations/1038_reconcile_and_stale_refund_hardening.sql:4 | money-path-refunds-vat-runbook |
| Online-charge reconcile cron every 15 minutes | apps/web/vercel.json:15 | money-path-refunds-vat-runbook |
| ZA_STANDARD 15% VAT seed; provider tax_rate_override columns | supabase/migrations/10102_money_path_vat_foundation.sql:5 | money-path-refunds-vat-runbook |
| Tax country derived from tenant region_code | supabase/migrations/10113_resolve_tax_rate_tenant_country.sql:23 | money-path-refunds-vat-runbook, expansion-playbook-overview |
| Refunds proportionally reverse every component (incl. tax, held VAT) | supabase/migrations/10103_money_path_refund_tax_balance.sql:4, :466 | money-path-refunds-vat-runbook, disputes-refund-ops-overview |
| Service-fee validation tolerance ±0.01 | supabase/migrations/1017_booking_fee_validation_and_policy_snapshot.sql:18 | money-path-refunds-vat-runbook |
| `issue_refunds` provider permission separate from process_payments; owner/manager default true | supabase/migrations/10109_issue_refunds_permission.sql:1, :18 | money-path-refunds-vat-runbook |
| Refund Anomalies nav item (Finance section) | apps/admin-web/src/config/nav.ts:330 | money-path-refunds-vat-runbook, finance-payouts-runbook, disputes-refund-ops-overview |
| ZA payroll set effective 2026-03-01; UIF 1% capped R17 712/month; SDL 1% R500 000 threshold | supabase/migrations/10114_za_payroll_rules_2027_tax_year.sql:3, :11, :28 | payroll-ops-runbook |
| `payroll.v2` flag enabled; provider_settings.payroll_v2_enabled default true and backfilled | supabase/migrations/10115_payroll_v2_feature_flag.sql:14-16, :33-38 | payroll-ops-runbook |
| Pay-run items carry commission_clawback and carry-forward columns | supabase/migrations/1016_payroll_item_carry_forward.sql:3 | payroll-ops-runbook |
| Two different admins must verify a payroll rule set before publishing | apps/admin-web/src/routes/finance/PayrollRulesPage.tsx:116 | payroll-ops-runbook, finance-payouts-runbook |
| Admin MFA applies to all admin roles with an enforce_all_from grace date | supabase/migrations/10118_admin_mfa_all_roles.sql:2-4 | admin-security-mfa-sessions-runbook |
| Unenrolled admins are redirected to `/admin/mfa/enroll` | apps/admin-web/src/App.tsx:40, :89 | admin-security-mfa-sessions-runbook, incident-response-overview |
| Admin IP allowlist max 200 entries; refuses to lock the caller out | apps/web/src/app/api/admin/security/route.ts:122-125 | admin-security-mfa-sessions-runbook |
| Provider session protection fields (step-up window etc.) on Security Policy | apps/admin-web/src/routes/ops/SecurityPolicyPage.tsx:34, :51 | admin-security-mfa-sessions-runbook |
| Reset 2FA and Sign out everywhere actions on user detail | apps/admin-web/src/routes/users/UserDetailPage.tsx:1245, :1275 | admin-security-mfa-sessions-runbook, users-trust-runbook |
| Impersonation limited to 5 per admin per hour | apps/web/src/app/api/admin/users/[id]/impersonate/route.ts:10 | admin-security-mfa-sessions-runbook |
| Session revocation functions | supabase/migrations/10121_revoke_user_sessions_fn.sql:5 | admin-security-mfa-sessions-runbook |
| Payout account cooling-off default 48 hours | supabase/migrations/10120_payout_account_cooling_off.sql:21-22 | platform-config-runbook, finance-payouts-runbook, admin-security-mfa-sessions-runbook |
| Users can be suspended/activated and warned; providers can be suspended | apps/admin-web/src/routes/users/UserDetailPage.tsx:343, :442; apps/admin-web/src/routes/providers/ProviderDetailPage.tsx:226-230 | moderation-safety-ops-overview |
| Purge user phrase `DELETE USER FOREVER` | apps/web/src/app/api/admin/compliance/purge-user/route.ts:25 | compliance-purge-reset-runbook |
| Purge provider phrase `PURGE PROVIDER ORG` | apps/web/src/app/api/admin/compliance/purge-provider/route.ts:29 | compliance-purge-reset-runbook |
| Tenant reset phrase `RESET TENANT TRANSACTIONS`; default tenant blocked (DEFAULT_TENANT_BLOCKED) | apps/web/src/app/api/admin/compliance/reset-tenant/route.ts:55, :137 | compliance-purge-reset-runbook, expansion-playbook-overview |
| Compliance snapshot retention years (default 5) | apps/web/src/lib/account/account-deletion-config.ts:5-25 | compliance-purge-reset-runbook |
| Tenant reset UI is superadmin-only | apps/admin-web/src/routes/control-plane (TenantResetPage, useSuperadminPage) | compliance-purge-reset-runbook, platform-config-runbook |
| Country launch checklist items (tenant_active … notification_ar_templates, fx_reporting_rate) | apps/web/src/lib/regions/country-launch-checklist.ts:56, :174, :187 | country-launch-regions-runbook |
| Region gateway is superadmin-only; settlement model shown as "Platform MoR + transfer (Connect payouts)" | apps/web/src/app/api/admin/regions/[regionId]/online-gateway/route.ts:14, :32; apps/admin-web/src/routes/control-plane/CpRegionOnlineGatewayPage.tsx:229 | country-launch-regions-runbook |
| Maintenance scopes and `allow_partner_funnel` default true | apps/admin-web/src/routes/control-plane/CpControlPlaneOps.tsx:46, :57 | platform-maintenance-audit-runbook |
| Config change log page | apps/admin-web/src/routes/control-plane/controlPlaneOverviewGroups.ts:121 | platform-maintenance-audit-runbook, control-plane-modules-runbook |
| Module pages carry an environment selector | apps/admin-web/src/routes/control-plane/CpAgenticConsolePage.tsx:115, :179 | control-plane-modules-runbook |
| Zoho mail sync every 2 minutes | apps/web/vercel.json:60 | support-mail-ingest-runbook |
| Default ack subject "We received your request [{ticket_number}]" | apps/web/src/lib/support/zoho-mail-ingest.ts:136 | support-mail-ingest-runbook |
| Skip reasons unrouted / from_mailbox / blocked senders | apps/web/src/lib/support/zoho-mail-ingest.ts:54, :95, :254 | support-mail-ingest-runbook |
| Mailbox lookback_hours max 168; max_messages_per_run default 25 | supabase/migrations/1000_zoho_support_mail.sql:10, :50 | support-mail-ingest-runbook |
| First-response SLA urgent 0.5h / high 2h / medium 8h / low 24h; clock starts at assistant hand-off | apps/web/src/lib/support/support-ticket-sla.ts:28-31, :51-53 | support-mail-ingest-runbook |
| Training-path quiz schema: 2–6 choices, answer_index in range, no question cap | apps/web/src/lib/learning/training-paths-schema.ts:3-10 | (training paths) |
| Training paths editable by Content & catalog section | apps/web/src/app/api/admin/content/learning/training-paths/route.ts (requireAdminSection CONTENT_CATALOG) | admin-overview-runbook |
| Brand inbox is `/admin/brand/my-work` | apps/admin-web/src/config/nav.ts:436 | brand-desk-runbook |
| OneSignal lives at `/admin/integrations/onesignal` [Superadmin] | apps/admin-web/src/config/nav.ts:495 | marketing-comms-runbook, integrations-dev-runbook |
| `/admin/grc/compliance-modules` redirects to Controls | apps/admin-web/src/config/nav.ts:537; apps/admin-web/src/App.tsx:248 | security-compliance-runbook |
| Gamification sub-routes (point-rules, badges, operations) | apps/admin-web/src/App.tsx:216 | marketing-comms-runbook |
| Admin team and Team permissions pages are superadmin-only | apps/admin-web/src/routes (AdminTeamPage, TeamPermissionsMatrixPage useSuperadminPage) | platform-config-runbook |
| App version: separate min/latest versions and store URLs for customer and provider apps | apps/admin-web/src/routes (AppVersionSettingsPage description) | platform-config-runbook |

### Nav href → runbook slug

All 177 unique hrefs in `apps/admin-web/src/config/nav.ts` (items and children flattened). Slugs are the internal articles whose body mentions the href after 10130 runs. Body text from 719/928/964 is included; the 719 body of `platform-config-runbook` is excluded because 10130 replaces it.

**Intentionally excluded hrefs:** none.

| Nav href | Runbook slugs |
| --- | --- |
| `/admin/dashboard` | admin-overview-runbook |
| `/admin/notifications/inbox` | admin-overview-runbook |
| `/admin/analytics` | admin-overview-runbook |
| `/admin/analytics/geo` | admin-overview-runbook |
| `/admin/reports` | admin-overview-runbook |
| `/admin/support-tickets` | disputes-refund-ops-overview, support-desk-runbook, support-mail-ingest-runbook |
| `/admin/support-tickets/ai-drafts` | support-desk-runbook, support-mail-ingest-runbook |
| `/admin/knowledge-base` | admin-overview-runbook |
| `/admin/provider-ops` | provider-ops-hub-runbook |
| `/admin/provider-ops/my-day` | provider-ops-hub-runbook |
| `/admin/provider-ops/ai-queue` | provider-ops-hub-runbook |
| `/admin/provider-ops/leads` | provider-ops-hub-runbook |
| `/admin/provider-ops/pipeline` | provider-ops-hub-runbook |
| `/admin/provider-ops/tracker` | provider-ops-hub-runbook |
| `/admin/provider-ops/activation` | provider-ops-hub-runbook |
| `/admin/provider-ops/retention` | provider-ops-hub-runbook |
| `/admin/provider-ops/duplicates` | provider-ops-hub-runbook |
| `/admin/provider-ops/reports` | provider-ops-hub-runbook |
| `/admin/provider-ops/settings` | provider-ops-hub-runbook |
| `/admin/providers` | moderation-safety-ops-overview, providers-bookings-runbook |
| `/admin/bookings` | providers-bookings-runbook |
| `/admin/group-bookings` | providers-bookings-runbook |
| `/admin/providers/distance-settings` | expansion-playbook-overview, providers-bookings-runbook |
| `/admin/staff` | providers-bookings-runbook |
| `/admin/referral-sources` | platform-config-runbook |
| `/admin/finance` | finance-payouts-runbook |
| `/admin/finance/ai-queue` | finance-payouts-runbook |
| `/admin/payouts` | finance-payouts-runbook |
| `/admin/refunds` | disputes-refund-ops-overview, money-path-refunds-vat-runbook, providers-bookings-runbook |
| `/admin/refund-anomalies` | disputes-refund-ops-overview, finance-payouts-runbook, money-path-refunds-vat-runbook |
| `/admin/fees` | finance-payouts-runbook |
| `/admin/taxes` | country-launch-regions-runbook, expansion-playbook-overview, finance-payouts-runbook, money-path-refunds-vat-runbook |
| `/admin/period-locks` | disputes-refund-ops-overview, finance-payouts-runbook, money-path-refunds-vat-runbook |
| `/admin/trial-balance` | finance-payouts-runbook |
| `/admin/wallet-reconciliation` | finance-payouts-runbook |
| `/admin/fx-rates` | country-launch-regions-runbook, expansion-playbook-overview, finance-payouts-runbook |
| `/admin/paystack-terminal` | finance-payouts-runbook |
| `/admin/settings/platform-fees` | billing-ops-overview, finance-payouts-runbook |
| `/admin/reconciliation-exceptions` | finance-payouts-runbook, money-path-refunds-vat-runbook |
| `/admin/ledger-repair` | finance-payouts-runbook |
| `/admin/ledger-health` | finance-payouts-runbook |
| `/admin/payroll-rules` | finance-payouts-runbook, payroll-ops-runbook |
| `/admin/provider-subscriptions` | billing-ops-overview, finance-payouts-runbook |
| `/admin/subscription-revenue` | billing-ops-overview, finance-payouts-runbook |
| `/admin/plans` | billing-ops-overview, finance-payouts-runbook |
| `/admin/monetization/apple/setup-sheet` | billing-ops-overview, finance-payouts-runbook |
| `/admin/monetization/apple/products` | billing-ops-overview, finance-payouts-runbook |
| `/admin/monetization/apple/transactions` | billing-ops-overview, finance-payouts-runbook |
| `/admin/monetization/apple/notifications` | billing-ops-overview, finance-payouts-runbook |
| `/admin/monetization/apple/settlements` | billing-ops-overview, finance-payouts-runbook |
| `/admin/billing` | billing-ops-overview, finance-payouts-runbook |
| `/admin/trust-safety-ops` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/trust-safety-ops/ai-queue` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/disputes` | disputes-refund-ops-overview, money-path-refunds-vat-runbook, providers-bookings-runbook |
| `/admin/reviews` | moderation-safety-ops-overview, providers-bookings-runbook |
| `/admin/user-reports` | moderation-safety-ops-overview, providers-bookings-runbook |
| `/admin/user-blocks` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/content-reports` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/fraud-cases` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/verifications` | users-trust-runbook, verification-ops-overview |
| `/admin/identity-trust/sessions` | users-trust-runbook, verification-ops-overview |
| `/admin/control-plane/safety-logs` | moderation-safety-ops-overview |
| `/admin/users` | moderation-safety-ops-overview, users-trust-runbook |
| `/admin/audit-logs` | admin-security-mfa-sessions-runbook, moderation-safety-ops-overview, platform-maintenance-audit-runbook, users-trust-runbook |
| `/admin/ecommerce` | ecommerce-runbook |
| `/admin/ecommerce/orders` | ecommerce-runbook |
| `/admin/ecommerce/returns` | ecommerce-runbook |
| `/admin/ecommerce/products` | ecommerce-runbook |
| `/admin/addons` | ecommerce-runbook |
| `/admin/catalog` | content-catalog-runbook |
| `/admin/catalog/global-categories` | content-catalog-runbook, ecommerce-runbook |
| `/admin/gift-cards` | marketing-comms-runbook |
| `/admin/marketing` | marketing-comms-runbook |
| `/admin/broadcast` | marketing-comms-runbook |
| `/admin/promotions` | marketing-comms-runbook |
| `/admin/marketing/market-waitlist` | expansion-playbook-overview, marketing-comms-runbook |
| `/admin/notification-templates` | country-launch-regions-runbook, marketing-comms-runbook, support-desk-runbook |
| `/admin/email-templates` | marketing-comms-runbook |
| `/admin/sms-templates` | marketing-comms-runbook |
| `/admin/ads` | marketing-comms-runbook |
| `/admin/loyalty` | marketing-comms-runbook |
| `/admin/gamification` | marketing-comms-runbook |
| `/admin/automations` | marketing-comms-runbook |
| `/admin/marketing-pricebook` | marketing-comms-runbook |
| `/admin/brand` | brand-desk-runbook, marketing-comms-runbook |
| `/admin/brand/my-work` | brand-desk-runbook |
| `/admin/brand/strategy` | brand-desk-runbook |
| `/admin/brand/briefs` | brand-desk-runbook |
| `/admin/brand/board` | brand-desk-runbook |
| `/admin/brand/calendar` | brand-desk-runbook |
| `/admin/brand/weekly-update` | brand-desk-runbook |
| `/admin/brand/pack` | brand-desk-runbook |
| `/admin/brand/settings` | brand-desk-runbook |
| `/admin/notifications` | integrations-dev-runbook, marketing-comms-runbook |
| `/admin/whatsapp-content-templates` | marketing-comms-runbook |
| `/admin/whatsapp/templates` | integrations-dev-runbook |
| `/admin/whatsapp/sessions` | integrations-dev-runbook |
| `/admin/content` | content-catalog-runbook |
| `/admin/content/learning` | admin-overview-runbook, content-catalog-runbook |
| `/admin/content/resources` | content-catalog-runbook |
| `/admin/content/faqs` | content-catalog-runbook |
| `/admin/explore` | content-catalog-runbook |
| `/admin/explore/sounds` | content-catalog-runbook |
| `/admin/integrations-hub` | integrations-dev-runbook |
| `/admin/webhooks` | integrations-dev-runbook |
| `/admin/api-keys` | integrations-dev-runbook |
| `/admin/integrations/paystack` | integrations-dev-runbook |
| `/admin/integrations/rendobar` | content-catalog-runbook, integrations-dev-runbook |
| `/admin/control-plane/integrations/stripe` | integrations-dev-runbook |
| `/admin/integrations/resend` | integrations-dev-runbook |
| `/admin/integrations/zoho-mail` | integrations-dev-runbook, support-mail-ingest-runbook |
| `/admin/integrations/slack` | incident-response-overview, integrations-dev-runbook |
| `/admin/integrations/calls` | integrations-dev-runbook |
| `/admin/integrations/amplitude` | integrations-dev-runbook |
| `/admin/integrations/flutterwave` | integrations-dev-runbook |
| `/admin/integrations/singular` | integrations-dev-runbook |
| `/admin/integrations/onesignal` | integrations-dev-runbook, marketing-comms-runbook |
| `/admin/mapbox` | expansion-playbook-overview, integrations-dev-runbook |
| `/admin/iso-codes` | country-launch-regions-runbook, expansion-playbook-overview, integrations-dev-runbook |
| `/admin/integrations/yoco` | commercial-ops-runbook, integrations-dev-runbook |
| `/admin/integrations/paycloud` | commercial-ops-runbook, integrations-dev-runbook |
| `/admin/integrations/paycloud-operations` | integrations-dev-runbook |
| `/admin/integrations/apple` | billing-ops-overview, integrations-dev-runbook |
| `/admin/integrations/shipping` | integrations-dev-runbook |
| `/admin/control-plane/integrations` | integrations-dev-runbook |
| `/admin/control-plane/integrations/wasender` | integrations-dev-runbook |
| `/admin/control-plane/integrations/didit` | integrations-dev-runbook, users-trust-runbook, verification-ops-overview |
| `/admin/control-plane/integrations/ai` | control-plane-modules-runbook, integrations-dev-runbook |
| `/admin/control-plane/modules/agents` | control-plane-modules-runbook, integrations-dev-runbook |
| `/admin/control-plane/integrations/aura` | integrations-dev-runbook |
| `/admin/commercial/terminal-insights` | commercial-ops-runbook |
| `/admin/commercial/terminal-onboarding` | commercial-ops-runbook |
| `/admin/commercial/terminal-products` | commercial-ops-runbook |
| `/admin/commercial/terminal-orders` | commercial-ops-runbook |
| `/admin/commercial/terminal-campaigns` | commercial-ops-runbook |
| `/admin/commercial/terminal-reporting` | commercial-ops-runbook |
| `/admin/commercial/terminal-vendors` | commercial-ops-runbook |
| `/admin/commercial/terminal-collection-locations` | commercial-ops-runbook |
| `/admin/grc` | security-compliance-runbook |
| `/admin/grc/my-work` | security-compliance-runbook |
| `/admin/grc/compliance-modules` | security-compliance-runbook |
| `/admin/grc/setup` | security-compliance-runbook |
| `/admin/grc/controls` | security-compliance-runbook |
| `/admin/grc/soa` | security-compliance-runbook |
| `/admin/grc/documents` | security-compliance-runbook |
| `/admin/grc/risks` | security-compliance-runbook |
| `/admin/grc/vendors` | security-compliance-runbook |
| `/admin/grc/privacy` | compliance-purge-reset-runbook, security-compliance-runbook |
| `/admin/grc/evidence` | compliance-purge-reset-runbook, security-compliance-runbook |
| `/admin/grc/access-reviews` | security-compliance-runbook |
| `/admin/grc/findings` | security-compliance-runbook |
| `/admin/grc/incidents` | incident-response-overview, security-compliance-runbook |
| `/admin/grc/people` | security-compliance-runbook |
| `/admin/grc/audits` | security-compliance-runbook |
| `/admin/grc/audit-packs` | security-compliance-runbook |
| `/admin/grc/settings` | security-compliance-runbook |
| `/admin/platform-config` | platform-config-runbook, superadmin-operate-platform-overview |
| `/admin/settings/feature-flags` | control-plane-modules-runbook, incident-response-overview, payroll-ops-runbook, platform-config-runbook |
| `/admin/settings/admin-team` | platform-config-runbook |
| `/admin/settings/team-permissions` | platform-config-runbook |
| `/admin/settings` | finance-payouts-runbook, platform-config-runbook |
| `/admin/settings/app-version` | platform-config-runbook |
| `/admin/settings/custom-fields` | platform-config-runbook, superadmin-operate-platform-overview |
| `/admin/settings/referrals` | platform-config-runbook |
| `/admin/operations` | platform-operations-runbook |
| `/admin/system-health` | incident-response-overview, platform-operations-runbook |
| `/admin/service-zones` | expansion-playbook-overview, platform-operations-runbook |
| `/admin/security` | admin-security-mfa-sessions-runbook, platform-operations-runbook, security-compliance-runbook, superadmin-operate-platform-overview |
| `/admin/gods-eye` | admin-overview-runbook, platform-operations-runbook |
| `/admin/cron-runs` | incident-response-overview, platform-operations-runbook |
| `/admin/workflow-runs` | incident-response-overview, platform-operations-runbook |
| `/admin/webhooks/inbound` | incident-response-overview, platform-operations-runbook |
| `/admin/settings/tenants` | country-launch-regions-runbook, expansion-playbook-overview, platform-config-runbook |
| `/admin/settings/tenant-domains` | country-launch-regions-runbook, expansion-playbook-overview, platform-config-runbook |
| `/admin/control-plane/overview` | control-plane-modules-runbook, platform-config-runbook |
| `/admin/control-plane/compliance` | compliance-purge-reset-runbook, platform-config-runbook |
| `/admin/control-plane/tenant-reset` | compliance-purge-reset-runbook, platform-config-runbook |

### Non-nav routes referenced (exist in App.tsx)

`/admin/control-plane/modules/{distance,on-demand,safety,ranking,ranking/scores,ai,ai/usage,ai/entitlements,ai/templates,ads}`, `/admin/control-plane/{feature-flags,maintenance,maintenance/sign-ups,audit-log,country-launch-checklist,region-online-gateway}`, `/admin/mfa/enroll`, `/admin/content/learning/training-paths`, `/admin/content/{pages,about-us,featured-cities,app-links}`, `/admin/broadcast/{compose,history}`, `/admin/gamification/{point-rules,badges,operations}`, `/admin/users/:id`, `/admin/providers/:id`, `/admin/bookings/:id`, `/admin/verifications/:id`, `/admin/service-zones/:id`, `/admin/commercial/terminal-onboarding/:id`. `/admin/monitoring` exists as a route but is deliberately not referenced (removed by 964).

### Not confirmed in code

- `/api/admin/security` PATCH: a code comment says superadmin-only but the handler checks the Operations section. The runbooks say "Operations section" and do not claim superadmin-only.
- No admin UI was found for provider `tax_rate_override_percent` or for `POST /api/admin/finance/integrity-repair`, so neither is described as an admin task.
- The Refunds page describes Wallet → bank as "debits the customer wallet" on approval, but migration 1008 holds (debits) the amount at submit. The runbooks follow the migration.

