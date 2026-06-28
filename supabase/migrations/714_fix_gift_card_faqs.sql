-- 714_fix_gift_card_faqs.sql
-- Replaces the mis-seeded gift-card FAQ rows (which were copies of generic
-- partner/booking questions) with accurate, buyer-focused gift-card content
-- that mirrors the fallback set in apps/web/src/components/global/faq.tsx.
--
-- Safe to re-run:
--   - DELETE is scoped to (tenant_id IS NULL OR tenant_id = za_id) AND
--     category = 'gift-card' AND question IN (<the 5 wrong questions>).
--     Superadmin-authored rows with different questions are untouched.
--   - INSERT is guarded by NOT EXISTS on (tenant_id, category, question).
--   - The ZA tenant clone section re-uses the same guard pattern as migration 613.
--
-- Also corrects the 'features_list' page_content row whose "Easy to send"
-- description claimed SMS delivery (which is not implemented); updates only
-- the exact 613-seeded string so admin edits are preserved.

-- ---------------------------------------------------------------------------
-- 1) Remove the 5 wrongly-seeded partner/booking questions from gift-card
--    category, globally (tenant_id IS NULL) and on the ZA tenant clone.
-- ---------------------------------------------------------------------------
DELETE FROM public.faqs
WHERE category = 'gift-card'
  AND question IN (
    'How do I signup as a beauty partner on Beautonomi?',
    'How Does the booking work for services on Beautonomi?',
    'What measures are in place for safety and reliability of beauty professionals and customers?',
    'How and when do I receive payments for the services I provide?',
    'Can I get a custom offer on Beautonomi?'
  )
  AND (
    tenant_id IS NULL
    OR tenant_id = public.tenant_default_za_id()
  );

-- ---------------------------------------------------------------------------
-- 2) Insert the correct global gift-card FAQs (tenant_id NULL).
-- ---------------------------------------------------------------------------
INSERT INTO public.faqs (
  category,
  question,
  answer,
  display_order,
  is_active,
  tenant_id
)
SELECT
  'gift-card'::text,
  v.question,
  v.answer,
  v.display_order,
  true,
  NULL
FROM (
  VALUES
    (
      'How do I buy a Beautonomi gift card?',
      'Click ''Buy now'' or pick a design on this page, then choose your amount and complete checkout with Paystack. Your gift card code arrives by email immediately after payment is confirmed.',
      0
    ),
    (
      'How does the recipient receive the gift card?',
      'If you enter a recipient email at checkout, we send the gift card code to that address with instructions to redeem. If the recipient already has a Beautonomi account, the card also appears automatically under Payments & gift cards. If you leave the email blank, the code goes to you and you can share it however you like.',
      1
    ),
    (
      'How do I redeem a gift card?',
      'At booking checkout, choose ''Gift card'' as your payment method and enter the code. The gift card balance is applied to the total — any remaining balance stays on the card for a future booking. You can also redeem a card to your Beautonomi wallet from Account settings → Payments.',
      2
    ),
    (
      'Do Beautonomi gift cards expire?',
      'No. Gift card credit does not expire, so you can use it whenever you are ready to book a beauty or wellness service.',
      3
    ),
    (
      'Can I check my gift card balance?',
      'Yes. Sign in and go to Account settings → Payments & gift cards. Your active cards and current balances are listed there.',
      4
    ),
    (
      'Can a gift card be used across different providers and services?',
      'Yes. Beautonomi gift cards are platform-wide and can be used with any provider or service available on the platform.',
      5
    ),
    (
      'What happens if I lose my gift card code?',
      'Your code is saved to your account under Payments & gift cards, so signing in is all you need to find it. If you did not create an account, contact our support team with your purchase confirmation email and we can help recover your code.',
      6
    ),
    (
      'Can I buy gift cards in bulk for my business?',
      'Yes. On the purchase page, switch to ''Bulk purchase'' to order up to 1 000 cards in a single transaction. For very large orders or custom arrangements, contact our sales team.',
      7
    )
) AS v(question, answer, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.faqs f
  WHERE f.tenant_id IS NULL
    AND f.category = 'gift-card'
    AND f.question = v.question
);

-- ---------------------------------------------------------------------------
-- 3) Clone the corrected global rows into the ZA tenant (same pattern as
--    migration 613 section 3) so ZA operators edit their own scoped rows.
-- ---------------------------------------------------------------------------
INSERT INTO public.faqs (
  category,
  question,
  answer,
  display_order,
  is_active,
  tenant_id
)
SELECT
  g.category,
  g.question,
  g.answer,
  g.display_order,
  g.is_active,
  public.tenant_default_za_id()
FROM public.faqs g
WHERE g.tenant_id IS NULL
  AND g.category = 'gift-card'
  AND public.tenant_default_za_id() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.faqs z
    WHERE z.tenant_id = public.tenant_default_za_id()
      AND z.category IS NOT DISTINCT FROM g.category
      AND z.question = g.question
  );

-- ---------------------------------------------------------------------------
-- 4) Correct the features_list copy: update "Easy to send" description only
--    when it exactly matches the 613-seeded string (preserves admin edits).
-- ---------------------------------------------------------------------------
UPDATE public.page_content
SET content = '[{"icon":"\u2728","title":"Beautiful designs","description":"Gift cards are customizable with your choice of design, message, and gift amount"},{"icon":"\u2709\ufe0f","title":"Easy to send","description":"Delivered to the recipient by email within minutes, and it appears in their Beautonomi account automatically"},{"icon":"\u23f3","title":"Never expires","description":"Gift credit is available to use whenever they''re ready to book beauty and wellness services"}]'
WHERE page_slug = 'gift-card'
  AND section_key = 'features_list'
  AND content_type = 'json'
  AND content = '[{"icon":"\u2728","title":"Beautiful designs","description":"Gift cards are customizable with your choice of design, message, and gift amount"},{"icon":"\u2709\ufe0f","title":"Easy to send","description":"Arrives within minutes via text or email and we''ll confirm that it''s been received"},{"icon":"\u23f3","title":"Never expires","description":"Gift credit is available to use whenever they''re ready to book beauty and wellness services"}]';
