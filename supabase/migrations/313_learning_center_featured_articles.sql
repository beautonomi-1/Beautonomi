-- 313_learning_center_featured_articles.sql
-- Set Learning Center homepage featured articles to recommended slugs (idempotent).
-- Order: getting-started-overview, canceling-your-booking, when-you-pay-booking, request-payout, verification-steps, managing-bookings-overview

DO $$
DECLARE
    ids UUID[];
    slug_list TEXT[] := ARRAY[
        'getting-started-overview',
        'canceling-your-booking',
        'when-you-pay-booking',
        'request-payout',
        'verification-steps',
        'managing-bookings-overview'
    ];
BEGIN
    SELECT array_agg(a.id ORDER BY array_position(slug_list, a.slug))
    INTO ids
    FROM public.learning_articles a
    WHERE a.slug = ANY(slug_list)
      AND a.status = 'published'
      AND a.is_internal = false;

    IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
        UPDATE public.learning_homepage_sections
        SET payload = jsonb_build_object('article_ids', to_jsonb(ids))
        WHERE section_key = 'featured_articles';
    END IF;
END $$;
