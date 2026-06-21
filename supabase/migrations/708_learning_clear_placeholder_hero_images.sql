-- Clear seeded hero placeholders so articles without real screenshots show no hero box.
-- Placeholder path matches PLACEHOLDER_IMAGE_PATHS in learn-article-hero.tsx.
UPDATE public.learning_articles
SET image_url = NULL
WHERE trim(coalesce(image_url, '')) = '/images/learn/feature-browser-placeholder.svg';
