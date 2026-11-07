-- 10131_learning_center_wiring.sql
-- Homepage wiring for the accuracy and coverage migrations (10126-10130):
--   * cta_cards / platform_guides: replace stale "Yoco payments" cards and More-menu copy
--     with flag-aware in-person payment wording; add cards for new customer and provider guides.
--   * featured_articles: refresh with current, high-traffic guides.
--   * platform_updates: point at the platform updates overview.

INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
VALUES (
  'cta_cards',
  '{"cards":[{"title":"Customer guides","description":"Book services, manage appointments, pay, use your wallet, and get support.","icon":"User","link":"/learn/customer"},{"title":"Provider guides","description":"Run bookings, clients, finance and payouts, in-person payments, team, and business settings.","icon":"Building2","link":"/learn/provider"},{"title":"Mobile app guides","description":"Use Beautonomi from the customer or provider app with current navigation.","icon":"Smartphone","link":"/learn/article/customer-mobile-app"}]}'::jsonb,
  1
)
ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
SET payload = EXCLUDED.payload, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
VALUES (
  'platform_guides',
  $json${
  "tabs": [
    {
      "id": "web",
      "label": "Web",
      "description": "Guides for Beautonomi in a browser, split by customer and provider workflows.",
      "groups": [
        {
          "title": "Customer web",
          "audience": "customer",
          "cards": [
            {"title": "Book on the web", "description": "Search providers, choose services, pay, and manage appointments.", "href": "/learn/article/customer-web-booking"},
            {"title": "Payments and receipts", "description": "Understand checkout, receipts, invoices, and payment support.", "href": "/learn/article/customer-web-payments-receipts"},
            {"title": "Manage bookings", "description": "Reschedule, cancel, pay balances, and review booking status.", "href": "/learn/article/customer-web-manage-bookings"},
            {"title": "Wallet and loyalty", "description": "Use wallet credit, gift cards, coupons, and rewards.", "href": "/learn/article/customer-web-wallet-loyalty"},
            {"title": "Bank refund from your wallet", "description": "Cancellation refunds land in your wallet; request eligible amounts to your bank.", "href": "/learn/article/wallet-bank-refund"},
            {"title": "Gift cards", "description": "Buy, send, schedule, and redeem gift cards where available.", "href": "/learn/article/gift-cards-buy-send-claim"},
            {"title": "Group bookings and split payment", "description": "Invite guests and choose who pays.", "href": "/learn/article/group-booking-invites-split-payment"},
            {"title": "Shop and product orders", "description": "Buy products, packages, and variants from provider shops.", "href": "/learn/article/customer-web-shop-orders"},
            {"title": "Return a product", "description": "Request a return and track the refund.", "href": "/learn/article/return-a-product"},
            {"title": "Account and support", "description": "Manage addresses, profile details, privacy, and tickets.", "href": "/learn/article/customer-web-account-support"},
            {"title": "Safety tools", "description": "Emergency help, reporting, blocking, and content controls.", "href": "/learn/article/safety-tools-customer"},
            {"title": "At-home addresses", "description": "Save accurate South African addresses and map pins.", "href": "/learn/article/customer-web-addresses-at-home"}
          ]
        },
        {
          "title": "Provider web",
          "audience": "provider",
          "cards": [
            {"title": "Provider web portal", "description": "Map the current sidebar and key business areas.", "href": "/learn/article/provider-web-portal"},
            {"title": "Dashboard cards and metrics", "description": "Read the dashboard cards and what each metric counts.", "href": "/learn/article/provider-dashboard-cards-metrics"},
            {"title": "Express booking links", "description": "Create and share booking links for your services.", "href": "/learn/article/provider-express-booking-links"},
            {"title": "Closed periods and blocked time", "description": "Close dates, block time, and set waitlist rules.", "href": "/learn/article/provider-closed-periods-blocked-time-waitlist"},
            {"title": "Resources and forms", "description": "Rooms, equipment, and client intake forms.", "href": "/learn/article/provider-resources-forms"},
            {"title": "Finance, payouts, and bank accounts", "description": "Understand metrics, balances, payout requests, and bank setup.", "href": "/learn/article/provider-web-finance-payouts"},
            {"title": "Payout rails and available balance", "description": "What counts toward your balance and what is held back.", "href": "/learn/article/provider-payout-rails-available-balance"},
            {"title": "Platform fees and commission", "description": "Who pays the service fee and when commission applies.", "href": "/learn/article/provider-platform-fees-commission"},
            {"title": "In-person payments", "description": "Yoco, card machines, and Paystack Terminal where enabled for your account.", "href": "/learn/article/provider-web-yoco-payments"},
            {"title": "Cancellation policies", "description": "Presets, late-cancel fees, and where the money goes.", "href": "/learn/article/provider-cancellation-policy-presets"},
            {"title": "Scheduling operations", "description": "Use bookings, calendar, group bookings, front desk, and time blocks.", "href": "/learn/article/provider-web-calendar-bookings"},
            {"title": "Services and catalogue", "description": "Build services, add-ons, products, packages, and memberships.", "href": "/learn/article/provider-web-services-catalogue"},
            {"title": "Packages and memberships", "description": "Manage packages, product variants, memberships, and subscriptions.", "href": "/learn/article/provider-web-packages-memberships"},
            {"title": "E-commerce orders", "description": "Use order tabs and counters to action product orders.", "href": "/learn/article/provider-web-ecommerce-orders"},
            {"title": "Inventory, suppliers, and variants", "description": "Track stock, suppliers, and product variants.", "href": "/learn/article/provider-inventory-suppliers-variants"},
            {"title": "Shipping, collection, and returns", "description": "Fulfil product orders and handle returns.", "href": "/learn/article/provider-shipping-collection-returns"},
            {"title": "Calendar sync and integrations", "description": "Connect external calendars and marketing tools.", "href": "/learn/article/provider-calendar-sync-integrations"},
            {"title": "Staff and reports", "description": "Manage staff access, shifts, permissions, reports, and trends.", "href": "/learn/article/provider-web-staff-permissions"},
            {"title": "Payroll pay runs", "description": "Run payroll and payslips where available.", "href": "/learn/article/provider-payroll-pay-runs"},
            {"title": "Taxes and VAT", "description": "Set up VAT and tax details for your business.", "href": "/learn/article/provider-taxes-vat"},
            {"title": "Settings and security", "description": "Use provider-scoped account, privacy, and data settings.", "href": "/learn/article/provider-web-settings-security"}
          ]
        }
      ]
    },
    {
      "id": "mobile",
      "label": "Mobile app",
      "description": "Guides for iOS and Android app workflows, split by customer and provider experience.",
      "groups": [
        {
          "title": "Customer app",
          "audience": "customer",
          "cards": [
            {"title": "Customer app guide", "description": "Learn app tabs, bookings, payments, receipts, and help.", "href": "/learn/article/customer-mobile-app"},
            {"title": "Booking and payment flow", "description": "Book, pay, and refresh booking status after secure checkout.", "href": "/learn/article/customer-mobile-booking-payments"},
            {"title": "Wallet and loyalty", "description": "Use wallet credit, coupons, gift cards, and saved payments.", "href": "/learn/article/customer-mobile-wallet-loyalty"},
            {"title": "Refer friends", "description": "Share your code and earn rewards when the programme is on.", "href": "/learn/article/refer-friends-referrals"},
            {"title": "Saved and wishlists", "description": "Find Saved from Profile or the Home header heart.", "href": "/learn/article/wishlists-and-saved"},
            {"title": "Custom requests and offers", "description": "Ask for something bespoke and pay the provider's offer.", "href": "/learn/article/custom-requests-and-offers"},
            {"title": "Notification preferences", "description": "Choose channels per topic and manage marketing opt-in.", "href": "/learn/article/notification-preferences-customer"},
            {"title": "Support and notifications", "description": "Use mobile support, account settings, addresses, and alerts.", "href": "/learn/article/customer-mobile-notifications-support"},
            {"title": "Shop and orders", "description": "Buy products, packages, and variants from the app.", "href": "/learn/article/customer-mobile-shop-orders"},
            {"title": "Delete your account", "description": "What happens when you delete and how to confirm.", "href": "/learn/article/delete-your-account"}
          ]
        },
        {
          "title": "Provider app",
          "audience": "provider",
          "cards": [
            {"title": "Provider app guide", "description": "Dashboard, Clients, Chats, Bookings, and the More hub.", "href": "/learn/article/provider-mobile-app"},
            {"title": "More navigation", "description": "Find Money, Payment setup, Team, Business, Engagement, and Settings.", "href": "/learn/article/provider-mobile-more-navigation"},
            {"title": "Chats and the Engagement hub", "description": "Message clients and reach marketing, tickets, and reviews.", "href": "/learn/article/provider-chats-engagement-hub"},
            {"title": "Custom requests and offers", "description": "Reply to client requests with a custom offer and slot.", "href": "/learn/article/provider-custom-requests-offers"},
            {"title": "Explore posts", "description": "Draft, publish, and post from a completed booking.", "href": "/learn/article/provider-explore-posts"},
            {"title": "Buying ads", "description": "Time boosts, impression packs, and CPC campaigns where available.", "href": "/learn/article/provider-buy-ads"},
            {"title": "Rewards and badges", "description": "Earn points, levels, and perks.", "href": "/learn/article/provider-rewards-badges"},
            {"title": "Finance, payments, and payouts", "description": "Earnings, payout balance, payout accounts, and in-person payment devices.", "href": "/learn/article/provider-mobile-finance-yoco-payouts"},
            {"title": "Paystack Terminal", "description": "Take QR and link payments where enabled.", "href": "/learn/article/provider-paystack-terminal"},
            {"title": "Payout accounts and security hold", "description": "Add a payout account and understand the new-account hold.", "href": "/learn/article/provider-payout-accounts-cooling-off"},
            {"title": "Subscription billing", "description": "App Store and card billing, and changing plans.", "href": "/learn/article/provider-subscription-billing-ios"},
            {"title": "Calendar and bookings", "description": "Run day-to-day bookings and schedule checks from mobile.", "href": "/learn/article/provider-mobile-calendar-bookings"},
            {"title": "Group bookings and time blocks", "description": "Create group sessions and protect unavailable time.", "href": "/learn/article/provider-mobile-group-bookings-time-blocks"},
            {"title": "Packages and memberships", "description": "Manage package variants and membership offers in the app.", "href": "/learn/article/provider-mobile-packages-memberships"},
            {"title": "Travel fees for house calls", "description": "Per-kilometre and distance-tier travel fees.", "href": "/learn/article/provider-travel-fees-tiered"},
            {"title": "Locations and settings", "description": "Keep business details, addresses, and coordinates accurate.", "href": "/learn/article/provider-mobile-locations-settings"},
            {"title": "Setup checklist", "description": "Complete setup status before launching publicly.", "href": "/learn/article/provider-mobile-setup-status-launch"}
          ]
        }
      ]
    }
  ]
}$json$::jsonb,
  2
)
ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
SET payload = EXCLUDED.payload, display_order = EXCLUDED.display_order, updated_at = NOW();

-- Reference-for-replies: point internal runbooks at the new public articles (10127 / 10129).
-- Replacement text must not contain "&" or backslashes (regexp_replace back-references).
CREATE TEMP TABLE _learning_reply_refs (slug TEXT, guard_slug TEXT, items TEXT) ON COMMIT DROP;
INSERT INTO _learning_reply_refs (slug, guard_slug, items) VALUES
  ('disputes-refund-ops-overview', 'wallet-bank-refund',
   '<li><a href="/learn/article/wallet-bank-refund">Request a bank refund from your wallet</a></li><li><a href="/learn/article/return-a-product">Return a product and request a refund</a></li><li><a href="/learn/article/provider-reschedule-cancellation-settlement">Reschedules and cancellation settlement</a></li>'),
  ('money-path-refunds-vat-runbook', 'wallet-bank-refund',
   '<li><a href="/learn/article/wallet-bank-refund">Request a bank refund from your wallet</a></li><li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and available balance</a></li><li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li><li><a href="/learn/article/provider-taxes-vat">Taxes and VAT settings</a></li>'),
  ('finance-payouts-runbook', 'provider-payout-rails-available-balance',
   '<li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and available balance</a></li><li><a href="/learn/article/provider-payout-accounts-cooling-off">Payout accounts and the new-account security hold</a></li><li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li><li><a href="/learn/article/provider-paystack-terminal">Paystack Terminal: QR and link payments</a></li>'),
  ('providers-bookings-runbook', 'provider-cancellation-policy-presets',
   '<li><a href="/learn/article/provider-cancellation-policy-presets">Cancellation policy presets and late-cancel fees</a></li><li><a href="/learn/article/provider-reschedule-cancellation-settlement">Reschedules and cancellation settlement</a></li><li><a href="/learn/article/group-booking-invites-split-payment">Group booking invites and split payment</a></li><li><a href="/learn/article/custom-requests-and-offers">Custom requests and offers</a></li><li><a href="/learn/article/provider-custom-requests-offers">Custom requests and sending custom offers (provider)</a></li><li><a href="/learn/article/provider-closed-periods-blocked-time-waitlist">Closed periods, blocked time and waitlist settings</a></li>'),
  ('billing-ops-overview', 'provider-subscription-billing-ios',
   '<li><a href="/learn/article/provider-subscription-billing-ios">Subscription billing: App Store, Paystack and plan changes</a></li>'),
  ('payroll-ops-runbook', 'provider-payroll-pay-runs',
   '<li><a href="/learn/article/provider-payroll-pay-runs">Payroll pay runs, PAYE/UIF and payslips</a></li><li><a href="/learn/article/provider-team-commissions-tips">Team commissions and tip distribution</a></li>'),
  ('ecommerce-runbook', 'return-a-product',
   '<li><a href="/learn/article/return-a-product">Return a product and request a refund</a></li><li><a href="/learn/article/gift-cards-buy-send-claim">Buy, send and redeem gift cards</a></li><li><a href="/learn/article/provider-shipping-collection-returns">Shipping, collection and returns for product orders</a></li><li><a href="/learn/article/provider-inventory-suppliers-variants">Inventory, suppliers and product variants</a></li>'),
  ('marketing-comms-runbook', 'provider-gift-cards-promo-codes',
   '<li><a href="/learn/article/provider-gift-cards-promo-codes">Gift cards and promo codes</a></li><li><a href="/learn/article/refer-friends-referrals">Refer friends and earn rewards</a></li><li><a href="/learn/article/notification-preferences-customer">Choose which notifications you get</a></li><li><a href="/learn/article/provider-buy-ads">Buying ads: time boosts, impression packs and CPC campaigns</a></li><li><a href="/learn/article/provider-rewards-badges">Rewards and badges</a></li><li><a href="/learn/article/provider-referrals-referral-sources">Refer a business and track client referral sources</a></li>'),
  ('moderation-safety-ops-overview', 'safety-tools-customer',
   '<li><a href="/learn/article/safety-tools-customer">Safety tools: emergency help, reporting and your safety profile</a></li><li><a href="/learn/article/blocked-users-content-safety">Block users and manage content controls</a></li><li><a href="/learn/article/explore-feed-posts-videos-collections">Explore: posts, videos and collections</a></li><li><a href="/learn/article/edit-or-delete-your-review">Edit or delete your review</a></li><li><a href="/learn/article/provider-explore-posts">Explore posts (provider)</a></li>'),
  ('users-trust-runbook', 'delete-your-account',
   '<li><a href="/learn/article/delete-your-account">Delete your Beautonomi account</a></li><li><a href="/learn/article/blocked-users-content-safety">Block users and manage content controls</a></li><li><a href="/learn/article/change-your-language">Change your language</a></li>'),
  ('compliance-purge-reset-runbook', 'delete-your-account',
   '<li><a href="/learn/article/delete-your-account">Delete your Beautonomi account</a></li>'),
  ('support-desk-runbook', 'wallet-bank-refund',
   '<li><a href="/learn/article/wallet-bank-refund">Request a bank refund from your wallet</a></li><li><a href="/learn/article/delete-your-account">Delete your Beautonomi account</a></li><li><a href="/learn/article/wishlists-and-saved">Wishlists, saved items and recently viewed</a></li><li><a href="/learn/article/notification-preferences-customer">Choose which notifications you get</a></li>')
;

UPDATE public.learning_articles a
SET body = regexp_replace(
      a.body,
      '<h2>Reference for replies</h2>\s*<ul>',
      '<h2>Reference for replies</h2><ul>' || v.items
    ),
    updated_at = NOW()
FROM _learning_reply_refs v
WHERE a.slug = v.slug
  AND a.tenant_id IS NULL
  AND a.is_internal = true
  AND a.body ~ '<h2>Reference for replies</h2>\s*<ul>'
  AND a.body NOT LIKE '%/learn/article/' || v.guard_slug || '"%';

UPDATE public.learning_articles a
SET body = a.body || '<h2>Reference for replies</h2><ul>' || v.items || '</ul>',
    updated_at = NOW()
FROM _learning_reply_refs v
WHERE a.slug = v.slug
  AND a.tenant_id IS NULL
  AND a.is_internal = true
  AND a.body !~ '<h2>Reference for replies</h2>\s*<ul>'
  AND a.body NOT LIKE '%/learn/article/' || v.guard_slug || '"%';

DROP TABLE _learning_reply_refs;

DO $$
DECLARE
  ids UUID[];
  slug_list TEXT[] := ARRAY[
    'customer-web-booking',
    'customer-mobile-app',
    'provider-web-portal',
    'provider-mobile-app',
    'managing-bookings-overview',
    'wallet-bank-refund',
    'gift-cards-buy-send-claim',
    'payouts-earnings-overview',
    'provider-payout-rails-available-balance',
    'provider-cancellation-policy-presets',
    'provider-mobile-more-navigation',
    'provider-mobile-setup-status-launch'
  ];
BEGIN
  SELECT array_agg(a.id ORDER BY array_position(slug_list, a.slug))
  INTO ids
  FROM public.learning_articles a
  WHERE a.slug = ANY(slug_list)
    AND a.tenant_id IS NULL
    AND a.status = 'published'
    AND a.is_internal = false;

  IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
    INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
    VALUES ('featured_articles', jsonb_build_object('article_ids', to_jsonb(ids)), 3)
    ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
    SET payload = EXCLUDED.payload, display_order = EXCLUDED.display_order, updated_at = NOW();
  END IF;
END $$;

DO $$
DECLARE
  update_id UUID;
BEGIN
  SELECT a.id INTO update_id
  FROM public.learning_articles a
  WHERE a.slug = 'platform-updates-overview'
    AND a.tenant_id IS NULL
    AND a.status = 'published'
  LIMIT 1;

  IF update_id IS NOT NULL THEN
    INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
    VALUES (
      'platform_updates',
      jsonb_build_object('title', 'Platform updates', 'article_ids', jsonb_build_array(update_id)),
      5
    )
    ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
    SET payload = EXCLUDED.payload, display_order = EXCLUDED.display_order, updated_at = NOW();
  END IF;
END $$;
