-- Optional hero video / GIF / embed URL for Learning Center articles (YouTube, Vimeo, direct mp4/webm/gif).
ALTER TABLE public.learning_articles
ADD COLUMN IF NOT EXISTS hero_video_url TEXT;

COMMENT ON COLUMN public.learning_articles.hero_video_url IS
  'Optional hero media URL: YouTube/Vimeo page URL, or direct .mp4/.webm/.gif. Shown above article body when set; falls back to image_url.';
