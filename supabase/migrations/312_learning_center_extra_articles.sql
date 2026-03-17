-- 312_learning_center_extra_articles.sql
-- Insert additional Learning Center articles (customer and provider). Idempotent by slug.

-- Managing Bookings: Canceling your booking
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Canceling your booking', 'canceling-your-booking', 'How to cancel and what to expect regarding refunds and policies.', '<p>If your plans change, you can cancel a booking from the booking detail screen. Open the booking from your Bookings tab and choose Cancel. Cancellation may be subject to the provider''s policy: cancel early enough and you may get a full refund; late cancellations might incur a fee or no refund.</p><p>After you cancel, any refund due is processed back to your original payment method or wallet. If you have trouble canceling or need an exception, contact support. To rebook later, find the provider again from Home or your booking history and create a new booking.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'canceling-your-booking');

-- Managing Bookings: Reschedule
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Change the date or time of your appointment', 'reschedule-booking', 'How to request a reschedule from the booking detail.', '<p>To change the date or time of your appointment, open the booking from your Bookings tab and tap Reschedule. You can then pick a new date and time from the provider''s available slots. The provider may need to confirm the new time depending on their settings.</p><p>If no suitable slots appear, the provider might be fully booked for the period you want. Try another date or message the provider to ask about availability. Once rescheduled, you will receive an updated confirmation and the booking detail will show the new time.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'reschedule-booking');

-- Managing Bookings: If your provider cancels
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'If your provider cancels your booking', 'if-provider-cancels', 'What happens when a provider cancels; rebook or refund options.', '<p>Sometimes a provider has to cancel a booking (e.g. illness or emergency). When that happens, you will be notified and any payment will be refunded in full. You do not need to do anything to receive the refund; it goes back to your original payment method or wallet.</p><p>You can rebook with the same provider for a new time or choose another provider. If you need help finding an alternative or have questions about the refund, contact support. We want to make sure you are taken care of when plans change.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'if-provider-cancels');

-- Managing Bookings: Verify arrival
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Verify arrival', 'verify-arrival', 'How to verify your arrival for the appointment.', '<p>Some providers ask you to verify when you arrive (e.g. to confirm you are at the right place or to start the appointment). You may receive an OTP or see a "Verify arrival" button on the booking detail screen. Enter the code or tap the button when you have arrived.</p><p>Verification helps the provider manage their schedule and reduces no-shows. If you do not see an option to verify or have trouble, let the provider know in person or via message. Your appointment can still go ahead; verification is an optional flow that some providers use.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'verify-arrival');

-- Payments (customer): Payment methods accepted
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Payment methods accepted', 'payment-methods-accepted', 'Card, bank, and other methods via Paystack by region.', '<p>Beautonomi accepts payments through Paystack. The methods available (card, bank transfer, USSD, etc.) depend on your country and how Paystack is configured. At checkout you will see the options on the Paystack page after you are redirected.</p><p>You can pay with a new card or bank method each time, or save a card for future use so you do not have to re-enter it. Saved cards are stored securely as tokens; we do not store your full card number. If your preferred method is not listed, try another or contact support to see what is supported in your region.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payments-customer'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'payment-methods-accepted');

-- Payments (customer): Edit or remove payment method
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Editing, removing, or adding a payment method', 'edit-payment-method', 'Manage saved cards and set a default.', '<p>You can manage your payment methods in account settings under Payments. There you can add a new card (by making a payment and choosing to save it), remove a saved card, or set which card is your default. The default is used when you choose "Pay with default card" at checkout.</p><p>To set a different card as default, open Payments and use the "Set default" option on the card you want. Only one card can be default at a time. If a card has expired or you no longer use it, remove it so your list stays up to date. You can always add a new card at your next checkout.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payments-customer'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'edit-payment-method');

-- Payments (customer): When you'll pay
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'When you''ll pay for your booking', 'when-you-pay-booking', 'When your card is charged and what happens if payment fails.', '<p>You are charged when you complete the booking at checkout. If you chose to pay later (e.g. hold), you will be charged before or at the time of the appointment according to the provider''s settings. For additional charges (add-ons or products added during the visit), you pay when you tap Pay on the booking detail—either in the app (which may open the payment page in the browser) or on the web.</p><p>If payment fails (e.g. card declined or insufficient funds), you will see an error and can try again with the same or another payment method. Update your card in account settings if needed. Until payment succeeds, the booking or additional charge may remain unpaid; the provider may send a payment link or you can pay from the booking detail.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payments-customer'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'when-you-pay-booking');

-- Payments (customer): Save card and Paystack
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Save card and Paystack', 'save-card-paystack', 'How we save your card securely; small verification charge.', '<p>When you pay with a card and opt in to "Save this card", we store a secure token from Paystack (not your full card number) so you can use the card again. Saving happens after you complete a successful payment. Paystack may place a small temporary charge (e.g. R1) to verify the card and then reverse it—this is normal and you may see it on your statement.</p><p>We never store your full card number or CVV. The token lets us ask Paystack to charge the card for future bookings when you choose that payment method. You can remove a saved card or set a different default anytime in account settings under Payments.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payments-customer'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'save-card-paystack');

-- Booking & Checkout: How to book a service
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'How to book a service', 'how-to-book-service', 'Step-by-step: choose provider, service, time, and checkout.', '<p>Open the Beautonomi app or website and find a provider from Home or Explore. Tap their profile, then tap Book. Choose the service you want, the venue (if they have more than one), and optionally a preferred staff member. Pick a date and time from the available slots, add any add-ons, and proceed to checkout.</p><p>At checkout, enter or confirm your details and add a payment method (or use a saved one). Complete the payment to confirm the booking. You will see the appointment in your Bookings tab and can reschedule, cancel, or pay additional charges later from the booking detail.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'booking-checkout'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'how-to-book-service');

-- Booking & Checkout: On-demand booking
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'On-demand booking', 'on-demand-booking', 'Request a provider without choosing one; how waiting and result work.', '<p>On-demand lets you request a service without picking a specific provider. You choose the service type, date, time, and location; the platform finds available providers who match. You will see a waiting screen while providers are notified. When one accepts, you get a result screen: you can accept the booking and then pay, or it may expire if you do not respond in time.</p><p>Once you accept, the booking appears in your Bookings and you can manage it like any other appointment. If no provider accepts or the request expires, you can try again with different options or search for a provider manually and book with them directly.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'booking-checkout'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'on-demand-booking');

-- Booking & Checkout: Add-ons and additional charges
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Add-ons and additional charges', 'add-ons-additional-charges', 'Adding services or products during the visit; paying online or at the salon.', '<p>You can add extras at checkout (add-ons) or the provider may add services or products during your visit. Those appear as additional charges on the booking. If the provider adds them after you have already paid for the main booking, you will see an outstanding amount on the booking detail with a Pay button.</p><p>Paying for additional charges: tap Pay and you will be taken to the payment page (Paystack), often in the in-app browser. Complete the payment there and the booking total updates. If you pay in person at the salon (cash or card with the provider), they mark it as paid and no online payment is needed; the charge is still recorded on the booking for your receipt.</p>', 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'booking-checkout'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'add-ons-additional-charges');

-- Payouts & Earnings: How to request a payout
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'How to request a payout', 'request-payout', 'Request a payout and how it appears in your balance.', '<p>Your available payout balance is the amount you have earned from bookings and sales that were paid through the platform (e.g. Paystack). To get paid, go to the Payouts section in the provider app or web (under Finance). Connect a payout account (e.g. bank) if you have not already, then request a payout for the amount you want to withdraw.</p><p>Payout requests are processed according to our schedule and your region. Once processed, the money is sent to your connected account. You can see the status and history of payouts in the same section. Payments you took in person (cash or Yoco at your venue) do not go into this balance; you keep those directly.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payouts-earnings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'request-payout');

-- Payouts & Earnings: Understanding your earnings
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Understanding your earnings', 'understanding-earnings', 'Earnings vs. payout balance; what counts toward payouts.', '<p>Your earnings include revenue from online bookings (customer paid via Paystack), minus platform fees and any refunds. That net amount makes up your available payout balance—the amount you can request to be sent to your bank. Your finance view shows total revenue, fees, and the balance available for payout.</p><p>Sales you record as walk-in (cash or card at your venue via Yoco or mark-as-paid) are included in your revenue reports so you see your full business picture, but they do not increase your payout balance because the platform never held that money. This keeps payouts accurate and simple.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payouts-earnings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'understanding-earnings');

-- Payouts & Earnings: Walk-in add-ons and payout balance
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Walk-in add-ons and payout balance', 'walk-in-addons-payout', 'Why walk-in add-ons do not increase payout balance.', '<p>When a customer pays for an additional charge in person (cash or card with you at the salon), you mark it as paid in the booking. That payment is recorded so the booking total and your revenue reports are correct, but the money goes directly to you—the platform never holds it. So that amount does not get added to your payout balance.</p><p>Only payments that go through the platform (e.g. when the customer pays online via Paystack for the same additional charge) are included in your payoutable balance. This way your balance always reflects money we are holding for you. Your finance page still shows "Walk-in add-ons" or similar so you can see total revenue including in-person sales.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payouts-earnings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'walk-in-addons-payout');

-- Provider Onboarding: Verification steps
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Verification steps', 'verification-steps', 'What we verify and how to complete verification.', '<p>We verify providers to keep the platform safe and trustworthy. You may be asked to provide identity (e.g. government ID) and business details. Complete the steps in the order shown: upload documents or enter information as requested. Verification can often be done in the app or via a link we send you.</p><p>Once submitted, our team reviews your information. You will be notified when verification is complete or if we need anything else. Do not share your verification documents with customers; we use them only for our checks. If you have trouble uploading or your status is stuck, contact support.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'provider-onboarding'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'verification-steps');

-- Provider Onboarding: Setup status and checklist
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Setup status and checklist', 'setup-status-checklist', 'Complete your business setup in app or web.', '<p>After verification, a setup checklist shows what is left to launch your business on Beautonomi: business name and description, services, availability, locations, payment and payout settings, and so on. You can complete most steps in the provider app; some (e.g. advanced booking link settings or packages) may open the web portal in an in-app browser.</p><p>Work through the list until all required items are done. Your profile becomes visible to customers when you are set up and published. You can return to settings anytime to update your offerings, hours, or payment options. The setup status screen is your guide to going live.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'provider-onboarding'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'setup-status-checklist');

-- Yoco Terminal: Set up
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Set up Yoco terminal', 'yoco-setup', 'Connect and configure your Yoco device.', '<p>To use a Yoco card reader for in-person payments, connect it in the provider app or web under Settings (payments or Yoco devices). Follow the steps to pair your device and link it to your Beautonomi account. Once set up, you can take card payments at the counter and record them against a booking or as a walk-in sale.</p><p>Keep the device charged and connected as required by Yoco. If setup fails or the device stops working, check Yoco''s support and our Learning Center for troubleshooting. Your Yoco account and Beautonomi are linked so transactions appear correctly in your sales and reports.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'yoco-terminal'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'yoco-setup');

-- Yoco Terminal: Walk-in payment
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Take a walk-in payment', 'yoco-walk-in-payment', 'Process an in-person payment with Yoco.', '<p>When a customer pays in person with card, use your Yoco device to take the payment. In the app you can start a walk-in sale or open a booking and mark an amount as paid by card. Complete the transaction on the Yoco terminal; the payment is recorded in Beautonomi so your sales history and booking totals stay accurate.</p><p>The amount does not go into your payout balance (the platform did not hold the funds), but it appears in your revenue and reports. For bookings, marking the payment ensures the customer''s receipt and your records match. You can also use Yoco for product sales or other at-counter payments where the app supports it.</p>', 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'yoco-terminal'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'yoco-walk-in-payment');

-- Stats for any new articles (idempotent)
INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE NOT EXISTS (SELECT 1 FROM public.learning_article_stats s WHERE s.article_id = a.id);
