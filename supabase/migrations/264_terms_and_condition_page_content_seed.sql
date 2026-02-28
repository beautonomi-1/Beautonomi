-- 264_terms_and_condition_page_content_seed.sql
-- Seed Terms and Conditions page content so it can be managed from superadmin Admin → Content (Footer Pages).
-- Public page: /terms-and-condition. Edit in Admin → Content, filter by "terms-and-condition".

INSERT INTO page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active)
VALUES
  ('terms-and-condition', 'page_title', 'text', 'Terms of Service', '{}', 0, true),
  ('terms-and-condition', 'intro', 'html', '<p>These Terms of Service govern your use of our beauty and salon services. By booking or using our services, you agree to these terms.</p><p>If you are located in the United States, the Terms of Service for US Customers apply to you.</p><p>If you are located outside the United States, the Terms of Service for International Customers apply to you.</p>', '{}', 1, true),
  ('terms-and-condition', 'sections', 'json', '[
    {"title": "Booking and Cancellation", "content": "Appointments can be booked through our website, mobile app, or by phone. We require 24-hour notice for cancellations. Late cancellations or no-shows may result in a cancellation fee."},
    {"title": "Payment", "content": "Payment is due at the time of service. We accept cash, credit cards, and approved digital payment methods. Prices are subject to change without notice."},
    {"title": "Gift Cards and Promotions", "content": "Gift cards purchased from us are non-refundable and can only be used for services or products offered at our salon. Promotions and discounts cannot be combined with other offers unless otherwise specified."},
    {"title": "Health and Safety", "content": "Your health and safety are our top priorities. Please inform our staff of any allergies, skin sensitivities, or health conditions before receiving services. We reserve the right to refuse service if we believe it may pose a risk to your health or the safety of our staff."},
    {"title": "Privacy and Confidentiality", "content": "We are committed to protecting your personal information. Your details are only used to provide services and improve your experience. Please review our Privacy Policy for more information on how your data is handled."},
    {"title": "Refunds and Returns", "content": "All sales of products and services are final. If you are dissatisfied with a product or service, please contact us within 7 days, and we will do our best to address the issue."},
    {"title": "Salon Etiquette", "content": "We strive to create a relaxing and welcoming environment. Please arrive on time for your appointment and silence your mobile devices to maintain a peaceful atmosphere for all guests."},
    {"title": "Liability Waiver", "content": "By using our services, you acknowledge and agree that Beautonomi will not be held responsible for any injury, loss, or damage arising from your visit or use of our services unless caused by our negligence."},
    {"title": "Changes to Terms", "content": "We reserve the right to update or modify these Terms at any time without prior notice. Continued use of our services after changes are made constitutes acceptance of the new Terms."}
  ]', '{}', 2, true),
  ('terms-and-condition', 'sidebar_heading', 'text', 'Need to get in touch?', '{}', 3, true),
  ('terms-and-condition', 'sidebar_description', 'text', 'We''re here to help with any questions about our terms of service.', '{}', 4, true)
ON CONFLICT (page_slug, section_key) DO UPDATE
SET content = EXCLUDED.content,
    content_type = EXCLUDED.content_type,
    display_order = EXCLUDED.display_order,
    updated_at = now();
