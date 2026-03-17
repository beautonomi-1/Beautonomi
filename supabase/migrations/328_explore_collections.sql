-- ============================================================================
-- Migration 328: Collections/boards for saved posts (e.g. "Summer looks")
-- ============================================================================

-- 1. User collections (boards)
CREATE TABLE IF NOT EXISTS explore_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_explore_collections_user ON explore_collections(user_id);

COMMENT ON TABLE explore_collections IS 'User-created boards/collections for organizing saved explore posts (e.g. Summer looks).';

-- 2. Posts in a collection (a post can be in multiple collections)
CREATE TABLE IF NOT EXISTS explore_collection_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES explore_collections(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES explore_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_explore_collection_posts_collection ON explore_collection_posts(collection_id);
CREATE INDEX IF NOT EXISTS idx_explore_collection_posts_post ON explore_collection_posts(post_id);

COMMENT ON TABLE explore_collection_posts IS 'Posts added to a collection. User must own the collection and the post must be in explore_saved for the user (enforced in API).';

-- 3. updated_at trigger for explore_collections
CREATE OR REPLACE FUNCTION update_explore_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS explore_collections_updated_at ON explore_collections;
CREATE TRIGGER explore_collections_updated_at
  BEFORE UPDATE ON explore_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_explore_collections_updated_at();

-- 4. RLS
ALTER TABLE explore_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE explore_collection_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own collections" ON explore_collections;
CREATE POLICY "Users can manage own collections"
  ON explore_collections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own collection posts" ON explore_collection_posts;
CREATE POLICY "Users can manage own collection posts"
  ON explore_collection_posts FOR ALL
  USING (
    collection_id IN (SELECT id FROM explore_collections WHERE user_id = auth.uid())
  )
  WITH CHECK (
    collection_id IN (SELECT id FROM explore_collections WHERE user_id = auth.uid())
  );
