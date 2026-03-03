-- Add optional image_url to about_us_content for section images (hero, story blocks)
ALTER TABLE public.about_us_content
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.about_us_content.image_url IS 'Optional image URL for this section (displayed on the public About page).';
