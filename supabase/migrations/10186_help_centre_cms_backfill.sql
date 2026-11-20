-- Backfill help centre CMS rows when empty, invalid, or legal copy still sits in guest CTA.

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

  UPDATE public.page_content
  SET content = legal_notice, content_type = 'text', updated_at = now()
  WHERE page_slug = 'help'
    AND section_key = 'company_notice'
    AND tenant_id IS NULL
    AND (content IS NULL OR btrim(content) = '');

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'company_notice', 'text', legal_notice, '{}'::jsonb, 7, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'company_notice' AND pc.tenant_id IS NULL
  );

  UPDATE public.page_content
  SET
    content = explore_json,
    content_type = 'json',
    updated_at = now()
  WHERE page_slug = 'help'
    AND section_key = 'explore_cards'
    AND tenant_id IS NULL
    AND (
      content IS NULL
      OR btrim(content) = ''
      OR btrim(content) = '[]'
      OR left(btrim(content), 1) <> '['
    );

  INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
  SELECT 'help', 'explore_cards', 'json', explore_json, '{}'::jsonb, 8, true, NULL::uuid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.page_content pc
    WHERE pc.page_slug = 'help' AND pc.section_key = 'explore_cards' AND pc.tenant_id IS NULL
  );
END $seed$;