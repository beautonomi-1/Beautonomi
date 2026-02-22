-- 177_add_signup_page_content.sql
-- Adds default signup page content to page_content table

-- Insert default signup page content
INSERT INTO page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active)
VALUES 
  -- Headline and Sub-heading
  ('signup', 'headline', 'text', 'Elevate every encounter.', '{}', 1, true),
  ('signup', 'sub_heading', 'text', 'Choose how you want to join Beautonomi', '{}', 2, true),
  
  -- Provider Card Content
  ('signup', 'provider_card_title', 'text', 'For Beauty Providers', '{}', 3, true),
  ('signup', 'provider_card_micro_copy', 'text', 'Powering beauty freelancer revolution', '{}', 4, true),
  ('signup', 'provider_card_description', 'text', 'Salons, freelancers, and beauty professionals', '{}', 5, true),
  ('signup', 'provider_card_badge', 'text', 'Join 10k+ Pros', '{}', 6, true),
  
  -- Customer Card Content
  ('signup', 'customer_card_title', 'text', 'For Customers', '{}', 7, true),
  ('signup', 'customer_card_description', 'text', 'Book beauty services with ease', '{}', 8, true),
  ('signup', 'customer_card_sub_description', 'text', 'Discover and book beauty professionals', '{}', 9, true),
  
  -- Glassmorphism Card Content
  ('signup', 'testimonial_quote', 'text', 'Beautonomi has transformed how I manage my beauty business. The native Yoco integration makes payments seamless.', '{}', 10, true),
  ('signup', 'testimonial_attribution', 'text', 'Sarah M., Salon Owner', '{}', 11, true),
  ('signup', 'testimonial_pure_commerce', 'text', 'Pure Commerce', '{}', 12, true),
  ('signup', 'testimonial_yoco_support', 'text', 'Native Yoco Support', '{}', 13, true),
  
  -- Background Image
  ('signup', 'background_image_url', 'image', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=2000&auto=format&fit=crop', '{}', 14, true),
  
  -- Footer Text
  ('signup', 'footer_text', 'text', 'By continuing, you agree to Beautonomi''s Terms of Service and Privacy Policy', '{}', 15, true)
ON CONFLICT (page_slug, section_key) DO UPDATE
SET content = EXCLUDED.content,
    updated_at = now();

-- Add comment
COMMENT ON TABLE page_content IS 'CMS table for managing page content. Use page_slug=''signup'' for signup page content management.';
