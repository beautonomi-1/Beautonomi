-- Help centre CMS: CTA copy, explore cards, company notice (global rows only).

DO $seed$
DECLARE
  legal_notice TEXT := 'Beautonomi. South Africa: Beautonomi (Pty) Ltd, Headquarters, Pinelands, Cape Town, 7405. Email support@beautonomi.com. You can also log in to submit or view a support ticket.';
  explore_json TEXT := $json$
[
  {"title": "Our community policies", "description": "How we build a foundation of trust.", "href": "/learn/policies"},
  {"title": "Provider resources and inspiration", "description": "Find tips, best practices, and news for providers.", "href": "/learn/provider"}
]
$json$;
BEGIN
  UPDATE public.page_content
  SET content = 'Log in to submit or view a support ticket.', updated_at = now()
  WHERE page_slug = 'help'
    AND section_key = 'cta_body_guest'
    AND tenant_id IS NULL
    AND content = legal_notice;

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'cta_heading', 'text', 'We''re here for you', '{}'::jsonb, 3, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'cta_heading' AND pc.tenant_id IS NULL
  );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'cta_body_guest', 'text', 'Log in to submit or view a support ticket.', '{}'::jsonb, 4, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'cta_body_guest' AND pc.tenant_id IS NULL
  );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT
    'help',
    'cta_body_authenticated',
    'text',
    'Can''t find what you''re looking for? Submit a support ticket and we''ll help you out.',
    '{}'::jsonb,
    5,
    true,
    NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'cta_body_authenticated' AND pc.tenant_id IS NULL
  );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'cta_mobile_hint_guest', 'text', 'Log in to submit or view your support tickets.', '{}'::jsonb, 6, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'cta_mobile_hint_guest' AND pc.tenant_id IS NULL
  );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'company_notice', 'text', legal_notice, '{}'::jsonb, 7, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'company_notice' AND pc.tenant_id IS NULL
  );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'explore_cards', 'json', explore_json, '{}'::jsonb, 8, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'explore_cards' AND pc.tenant_id IS NULL
  );
END $seed$;