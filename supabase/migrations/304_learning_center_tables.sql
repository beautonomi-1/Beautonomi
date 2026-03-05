-- 304_learning_center_tables.sql
-- Learning Center: categories, articles, homepage sections, stats, feedback.
-- Role-aware (general, customer, provider, internal). Full-text search support.

-- Categories (topic rail)
CREATE TABLE IF NOT EXISTS public.learning_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    audience TEXT NOT NULL CHECK (audience IN ('general', 'customer', 'provider', 'internal')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_categories_slug ON public.learning_categories(slug);
CREATE INDEX IF NOT EXISTS idx_learning_categories_audience ON public.learning_categories(audience);
CREATE INDEX IF NOT EXISTS idx_learning_categories_visibility ON public.learning_categories(visibility);
CREATE INDEX IF NOT EXISTS idx_learning_categories_sort ON public.learning_categories(sort_order);

-- Articles
CREATE TABLE IF NOT EXISTS public.learning_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES public.learning_categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    summary TEXT,
    body TEXT NOT NULL DEFAULT '',
    content_format TEXT NOT NULL DEFAULT 'html' CHECK (content_format IN ('html', 'markdown')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
    audience TEXT NOT NULL CHECK (audience IN ('general', 'customer', 'provider', 'internal')),
    is_internal BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    image_url TEXT,
    featured_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_articles_slug ON public.learning_articles(slug);
CREATE INDEX IF NOT EXISTS idx_learning_articles_category ON public.learning_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_learning_articles_status ON public.learning_articles(status);
CREATE INDEX IF NOT EXISTS idx_learning_articles_audience ON public.learning_articles(audience);
CREATE INDEX IF NOT EXISTS idx_learning_articles_internal ON public.learning_articles(is_internal) WHERE is_internal = false;
CREATE INDEX IF NOT EXISTS idx_learning_articles_published ON public.learning_articles(published_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_learning_articles_featured ON public.learning_articles(featured_order) WHERE featured_order IS NOT NULL;

-- Full-text search vector (generated column)
ALTER TABLE public.learning_articles
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_learning_articles_search ON public.learning_articles USING GIN(search_vector);

-- Homepage config (hero, CTA cards, featured article ids, optional sections)
CREATE TABLE IF NOT EXISTS public.learning_homepage_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_homepage_sections_key ON public.learning_homepage_sections(section_key);

-- View/helpful counts per article
CREATE TABLE IF NOT EXISTS public.learning_article_stats (
    article_id UUID PRIMARY KEY REFERENCES public.learning_articles(id) ON DELETE CASCADE,
    view_count INTEGER NOT NULL DEFAULT 0,
    helpful_yes_count INTEGER NOT NULL DEFAULT 0,
    helpful_no_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional feedback for analytics
CREATE TABLE IF NOT EXISTS public.learning_article_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES public.learning_articles(id) ON DELETE CASCADE,
    helpful BOOLEAN NOT NULL,
    session_id TEXT,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_article_feedback_article ON public.learning_article_feedback(article_id);

-- Triggers for updated_at
CREATE TRIGGER update_learning_categories_updated_at
    BEFORE UPDATE ON public.learning_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_articles_updated_at
    BEFORE UPDATE ON public.learning_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_homepage_sections_updated_at
    BEFORE UPDATE ON public.learning_homepage_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_article_stats_updated_at
    BEFORE UPDATE ON public.learning_article_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.learning_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_article_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_article_feedback ENABLE ROW LEVEL SECURITY;

-- learning_categories: public sees public; superadmin sees all
CREATE POLICY "Public can view public learning categories"
    ON public.learning_categories FOR SELECT
    USING (visibility = 'public');

CREATE POLICY "Superadmins can manage learning categories"
    ON public.learning_categories FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
    );

-- learning_articles: public sees published non-internal; superadmin sees all
CREATE POLICY "Public can view published non-internal learning articles"
    ON public.learning_articles FOR SELECT
    USING (
        status = 'published'
        AND is_internal = false
        AND (published_at IS NULL OR published_at <= NOW())
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
    );

CREATE POLICY "Superadmins can manage learning articles"
    ON public.learning_articles FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
    );

-- learning_homepage_sections: public read; superadmin all
CREATE POLICY "Public can view learning homepage sections"
    ON public.learning_homepage_sections FOR SELECT
    USING (true);

CREATE POLICY "Superadmins can manage learning homepage sections"
    ON public.learning_homepage_sections FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
    );

-- learning_article_stats: public read; superadmin all; service role for increment
CREATE POLICY "Public can view learning article stats"
    ON public.learning_article_stats FOR SELECT
    USING (true);

CREATE POLICY "Superadmins can manage learning article stats"
    ON public.learning_article_stats FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
    );

-- learning_article_feedback: anyone can insert; superadmin can read
CREATE POLICY "Anyone can insert learning article feedback"
    ON public.learning_article_feedback FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Superadmins can view learning article feedback"
    ON public.learning_article_feedback FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
    );

-- Allow service role to update stats (for view count and helpful increment from API)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'learning_article_stats' AND policyname = 'Service role can update learning article stats'
    ) THEN
        CREATE POLICY "Service role can update learning article stats"
            ON public.learning_article_stats FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

COMMENT ON TABLE public.learning_categories IS 'Learning Center topic categories. Audience: general, customer, provider, internal.';
COMMENT ON TABLE public.learning_articles IS 'Learning Center articles. Internal articles only visible to superadmin.';
COMMENT ON TABLE public.learning_homepage_sections IS 'Learning Center landing page config: hero, CTA cards, featured articles.';
COMMENT ON TABLE public.learning_article_stats IS 'View and helpful counts per article.';
COMMENT ON TABLE public.learning_article_feedback IS 'Optional per-session helpful feedback for analytics.';
