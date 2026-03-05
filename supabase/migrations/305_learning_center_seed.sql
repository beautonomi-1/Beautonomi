-- 305_learning_center_seed.sql
-- Seed Learning Center categories and one overview article per category.
-- Idempotent: skips if slug already exists.

-- Categories: General
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
    ('Getting Started', 'getting-started', NULL, 1, 'general', 'public'),
    ('Account & Profile', 'account-profile', NULL, 2, 'general', 'public'),
    ('Security & Privacy', 'security-privacy', NULL, 3, 'general', 'public'),
    ('Notifications & Messaging', 'notifications-messaging', NULL, 4, 'general', 'public'),
    ('Troubleshooting & FAQ', 'troubleshooting-faq', NULL, 5, 'general', 'public'),
    ('Platform Updates (Release Notes)', 'platform-updates', NULL, 6, 'general', 'public'),
    ('Pricing & Subscriptions', 'pricing-subscriptions', NULL, 7, 'general', 'public'),
    ('Policies', 'policies', NULL, 8, 'general', 'public')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug);

-- Categories: Customer Help
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
    ('Booking & Checkout', 'booking-checkout', NULL, 10, 'customer', 'public'),
    ('Payments', 'payments-customer', NULL, 11, 'customer', 'public'),
    ('Wallet, Gift Cards & Coupons', 'wallet-gift-cards-coupons', NULL, 12, 'customer', 'public'),
    ('Loyalty & Rewards', 'loyalty-rewards', NULL, 13, 'customer', 'public'),
    ('Reviews & Ratings', 'reviews-ratings', NULL, 14, 'customer', 'public'),
    ('Messaging Providers', 'messaging-providers', NULL, 15, 'customer', 'public'),
    ('Managing Bookings', 'managing-bookings', NULL, 16, 'customer', 'public'),
    ('At-Home Services', 'at-home-services', NULL, 17, 'customer', 'public'),
    ('Support Tickets & Disputes', 'support-tickets-disputes', NULL, 18, 'customer', 'public')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug);

-- Categories: Provider Help
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
    ('Provider Onboarding & Verification', 'provider-onboarding', NULL, 20, 'provider', 'public'),
    ('Services & Catalogue', 'services-catalogue', NULL, 21, 'provider', 'public'),
    ('Calendar & Scheduling', 'calendar-scheduling', NULL, 22, 'provider', 'public'),
    ('Clients (CRM)', 'clients-crm', NULL, 23, 'provider', 'public'),
    ('Payments & Checkout', 'payments-checkout-provider', NULL, 24, 'provider', 'public'),
    ('Yoco Terminal', 'yoco-terminal', NULL, 25, 'provider', 'public'),
    ('Payouts & Earnings', 'payouts-earnings', NULL, 26, 'provider', 'public'),
    ('Staff & Permissions', 'staff-permissions', NULL, 27, 'provider', 'public'),
    ('Locations & Service Areas', 'locations-service-areas', NULL, 28, 'provider', 'public'),
    ('Marketing & Automations', 'marketing-automations', NULL, 29, 'provider', 'public'),
    ('Reviews Management', 'reviews-management', NULL, 30, 'provider', 'public'),
    ('Inventory & Products', 'inventory-products', NULL, 31, 'provider', 'public'),
    ('Reports & Analytics', 'reports-analytics', NULL, 32, 'provider', 'public'),
    ('Online Booking & Direct Links', 'online-booking-links', NULL, 33, 'provider', 'public'),
    ('Waitlist & Waiting Room', 'waitlist-waiting-room', NULL, 34, 'provider', 'public'),
    ('On-demand Requests', 'on-demand-requests', NULL, 35, 'provider', 'public'),
    ('Integrations', 'integrations', NULL, 36, 'provider', 'public')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug);

-- Categories: Internal (visibility internal)
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
    ('Moderation & Safety Operations', 'moderation-safety-ops', NULL, 40, 'internal', 'internal'),
    ('Verification Operations', 'verification-ops', NULL, 41, 'internal', 'internal'),
    ('Disputes & Refund Operations', 'disputes-refund-ops', NULL, 42, 'internal', 'internal'),
    ('Expansion Playbook', 'expansion-playbook', NULL, 43, 'internal', 'internal'),
    ('Incident Response / Monitoring', 'incident-response', NULL, 44, 'internal', 'internal'),
    ('Billing Operations / Fee Configuration', 'billing-ops', NULL, 45, 'internal', 'internal')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug);

-- One overview article per category (general + customer + provider; internal gets one each)
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at, featured_order)
SELECT c.id, v.title, v.article_slug, v.summary, v.body, 'html', 'published', c.audience, c.visibility = 'internal', NOW(), v.featured_order
FROM public.learning_categories c
JOIN (VALUES
    ('getting-started', 'Welcome to Beautonomi', 'getting-started-overview', 'Get started with Beautonomi.', '<p>This guide helps you get started with the platform.</p>', 1),
    ('account-profile', 'Account & Profile Overview', 'account-profile-overview', 'Manage your account and profile settings.', '<p>Learn how to update your profile and account settings.</p>', 2),
    ('security-privacy', 'Security & Privacy Overview', 'security-privacy-overview', 'Keep your account secure and understand privacy.', '<p>Security best practices and privacy information.</p>', 3),
    ('notifications-messaging', 'Notifications & Messaging Overview', 'notifications-messaging-overview', 'Configure notifications and messaging.', '<p>How to manage notifications and messages.</p>', NULL),
    ('troubleshooting-faq', 'Troubleshooting & FAQ', 'troubleshooting-faq-overview', 'Common questions and troubleshooting.', '<p>Frequently asked questions and how to resolve common issues.</p>', 4),
    ('platform-updates', 'Platform Updates', 'platform-updates-overview', 'Latest release notes and updates.', '<p>Stay up to date with new features and improvements.</p>', 5),
    ('pricing-subscriptions', 'Pricing & Subscriptions Overview', 'pricing-subscriptions-overview', 'Understand pricing and subscription plans.', '<p>Overview of pricing and subscription options.</p>', NULL),
    ('policies', 'Policies Overview', 'policies-overview', 'Cancellations, refunds, disputes, and safety.', '<p>Platform policies and what you need to know.</p>', NULL),
    ('booking-checkout', 'Booking & Checkout Overview', 'booking-checkout-overview', 'How to book and checkout.', '<p>Step-by-step guide to booking and completing checkout.</p>', NULL),
    ('payments-customer', 'Payments Overview', 'payments-customer-overview', 'Paystack, saved cards, and receipts.', '<p>How payments work and how to view receipts.</p>', NULL),
    ('wallet-gift-cards-coupons', 'Wallet, Gift Cards & Coupons', 'wallet-gift-cards-coupons-overview', 'Using wallet, gift cards, and promo codes.', '<p>Manage your wallet, gift cards, and apply coupons.</p>', NULL),
    ('loyalty-rewards', 'Loyalty & Rewards', 'loyalty-rewards-overview', 'Earn and redeem loyalty rewards.', '<p>How the loyalty program and rewards work.</p>', NULL),
    ('reviews-ratings', 'Reviews & Ratings', 'reviews-ratings-overview', 'How to leave and understand reviews.', '<p>Leaving reviews and understanding ratings.</p>', NULL),
    ('messaging-providers', 'Messaging Providers', 'messaging-providers-overview', 'Communicate with your provider.', '<p>How to message providers before and after bookings.</p>', NULL),
    ('managing-bookings', 'Managing Bookings', 'managing-bookings-overview', 'Reschedule, cancel, or change bookings.', '<p>How to reschedule or cancel your bookings.</p>', NULL),
    ('at-home-services', 'At-Home Services', 'at-home-services-overview', 'How at-home services and travel fees work.', '<p>Understanding at-home services, safety, and travel fees.</p>', NULL),
    ('support-tickets-disputes', 'Support & Disputes', 'support-tickets-disputes-overview', 'Get help and resolve disputes.', '<p>How to open support tickets and resolve disputes.</p>', NULL),
    ('provider-onboarding', 'Provider Onboarding Overview', 'provider-onboarding-overview', 'Get verified and set up your business.', '<p>Steps to complete provider onboarding and verification.</p>', NULL),
    ('services-catalogue', 'Services & Catalogue Overview', 'services-catalogue-overview', 'Add and manage services and add-ons.', '<p>Building your service catalogue and add-ons.</p>', NULL),
    ('calendar-scheduling', 'Calendar & Scheduling Overview', 'calendar-scheduling-overview', 'Availability, time blocks, and recurring bookings.', '<p>Setting availability and managing your calendar.</p>', NULL),
    ('clients-crm', 'Clients (CRM) Overview', 'clients-crm-overview', 'Notes, tags, and client history.', '<p>Using the client list and CRM-lite features.</p>', NULL),
    ('payments-checkout-provider', 'Payments & Checkout (Provider)', 'payments-checkout-provider-overview', 'Paystack links, deposits, tips, refunds.', '<p>Accepting payments, deposits, and processing refunds.</p>', NULL),
    ('yoco-terminal', 'Yoco Terminal Overview', 'yoco-terminal-overview', 'Setup and use Yoco terminal.', '<p>Setting up and troubleshooting Yoco terminal payments.</p>', NULL),
    ('payouts-earnings', 'Payouts & Earnings Overview', 'payouts-earnings-overview', 'Request payouts and view statements.', '<p>How to request payouts and view earnings.</p>', NULL),
    ('staff-permissions', 'Staff & Permissions Overview', 'staff-permissions-overview', 'Roles, invites, shifts, time clock.', '<p>Managing staff, roles, and permissions.</p>', NULL),
    ('locations-service-areas', 'Locations & Service Areas', 'locations-service-areas-overview', 'Mapbox zones, at-home radius, travel fees.', '<p>Setting up locations and service areas.</p>', NULL),
    ('marketing-automations', 'Marketing & Automations', 'marketing-automations-overview', 'Mailchimp, Twilio, campaigns.', '<p>Marketing tools and automation setup.</p>', NULL),
    ('reviews-management', 'Reviews Management', 'reviews-management-overview', 'Responding to reviews and best practices.', '<p>How to respond to reviews and build your reputation.</p>', NULL),
    ('inventory-products', 'Inventory & Products', 'inventory-products-overview', 'Managing inventory and products.', '<p>If you sell products, how to manage inventory.</p>', NULL),
    ('reports-analytics', 'Reports & Analytics', 'reports-analytics-overview', 'Dashboards and VAT reports.', '<p>Provider dashboards and reporting.</p>', NULL),
    ('online-booking-links', 'Online Booking & Direct Links', 'online-booking-links-overview', 'Embed and direct booking links.', '<p>Setting up online booking and direct links.</p>', NULL),
    ('waitlist-waiting-room', 'Waitlist & Waiting Room', 'waitlist-waiting-room-overview', 'Front desk and waitlist workflows.', '<p>Using the waitlist and waiting room features.</p>', NULL),
    ('on-demand-requests', 'On-demand Requests', 'on-demand-requests-overview', 'Accept/decline, ringtone, safety.', '<p>Managing on-demand service requests.</p>', NULL),
    ('integrations', 'Integrations Overview', 'integrations-overview', 'Calendars, Mapbox, OneSignal, CRM.', '<p>Connecting calendars and other integrations.</p>', NULL),
    ('moderation-safety-ops', 'Moderation & Safety Ops', 'moderation-safety-ops-overview', 'Internal: moderation and safety operations.', '<p>Internal playbook for moderation and safety.</p>', NULL),
    ('verification-ops', 'Verification Operations', 'verification-ops-overview', 'Internal: verification operations.', '<p>Internal playbook for verification workflows.</p>', NULL),
    ('disputes-refund-ops', 'Disputes & Refund Ops', 'disputes-refund-ops-overview', 'Internal: disputes and refund operations.', '<p>Internal playbook for disputes and refunds.</p>', NULL),
    ('expansion-playbook', 'Expansion Playbook', 'expansion-playbook-overview', 'Internal: service zones and expansion.', '<p>Internal playbook for expansion.</p>', NULL),
    ('incident-response', 'Incident Response', 'incident-response-overview', 'Internal: monitoring and incidents.', '<p>Internal playbook for incident response.</p>', NULL),
    ('billing-ops', 'Billing Operations', 'billing-ops-overview', 'Internal: fee configuration and billing.', '<p>Internal playbook for billing operations.</p>', NULL)
) AS v(cat_slug, title, article_slug, summary, body, featured_order)
ON c.slug = v.cat_slug
WHERE NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = v.article_slug);

-- Homepage sections (hero, CTA cards placeholder, featured will use article ids)
INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
SELECT v.section_key, v.payload::jsonb, v.display_order
FROM (VALUES
    ('hero', '{"title":"Learning Center","subtitle":"Find guides and answers for customers and providers."}', 0),
    ('cta_cards', '{"cards":[{"title":"For Customers","description":"Book services, manage appointments, and get support.","icon":"User","link":"/learn/booking-checkout"},{"title":"For Providers","description":"Set up your business, manage bookings, and get paid.","icon":"Building2","link":"/learn/provider-onboarding"}]}', 1),
    ('featured_articles', '[]', 2),
    ('video_library', '{"title":"Video Library","videos":[]}', 3),
    ('platform_updates', '{"title":"Platform Updates","article_ids":[]}', 4)
) AS v(section_key, payload, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.learning_homepage_sections h WHERE h.section_key = v.section_key);

-- Set featured_articles to first few public article slugs (update payload with ids from articles)
DO $$
DECLARE
    ids UUID[];
BEGIN
    SELECT array_agg(id ORDER BY featured_order NULLS LAST, created_at)
    INTO ids
    FROM public.learning_articles
    WHERE status = 'published' AND is_internal = false
    LIMIT 6;
    IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
        UPDATE public.learning_homepage_sections
        SET payload = jsonb_build_object('article_ids', to_jsonb(ids))
        WHERE section_key = 'featured_articles';
    END IF;
END $$;

-- Stats: one row per article
INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE NOT EXISTS (SELECT 1 FROM public.learning_article_stats s WHERE s.article_id = a.id);
