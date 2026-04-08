-- 443_learning_hub_seed_images_and_cta_fix.sql
-- Default hero images for overview articles, fix About Beautonomi CTA markup for responsive CSS, idempotent.

-- Replace inline-styled CTA with class (mobile-friendly; styles in apps/web/src/app/learn/learn.css)
UPDATE public.learning_articles
SET body = replace(
  body,
  '<div style="margin-top: 2rem; padding: 1.25rem 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border: 1px solid #fbcfe8;">',
  '<div class="learn-cta-box">'
)
WHERE slug = 'about-beautonomi'
  AND body LIKE '%style="margin-top: 2rem;%';

-- Hero placeholder for public overview articles (replace with real screenshots via Admin → Content → Learning)
UPDATE public.learning_articles
SET image_url = '/images/learn/feature-browser-placeholder.svg'
WHERE is_internal = false
  AND status = 'published'
  AND slug LIKE '%-overview'
  AND (image_url IS NULL OR trim(image_url) = '');

-- Internal overview articles (superadmin-only): same placeholder when empty
UPDATE public.learning_articles
SET image_url = '/images/learn/feature-browser-placeholder.svg'
WHERE is_internal = true
  AND status = 'published'
  AND slug LIKE '%-overview'
  AND (image_url IS NULL OR trim(image_url) = '');

-- Extra seeded articles from 312 (not *-overview) — add placeholder where empty
UPDATE public.learning_articles
SET image_url = '/images/learn/feature-browser-placeholder.svg'
WHERE is_internal = false
  AND status = 'published'
  AND (image_url IS NULL OR trim(image_url) = '')
  AND slug IN (
    'canceling-your-booking',
    'reschedule-booking',
    'if-provider-cancels',
    'verify-arrival',
    'payment-methods-accepted',
    'edit-payment-method',
    'when-you-pay-booking',
    'save-card-paystack',
    'how-to-book-service',
    'on-demand-booking',
    'add-ons-additional-charges',
    'request-payout',
    'understanding-earnings',
    'walk-in-addons-payout',
    'verification-steps',
    'setup-status-checklist',
    'yoco-setup',
    'yoco-walk-in-payment'
  );
