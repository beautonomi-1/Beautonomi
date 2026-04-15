# Learning Center

The Learning Center is a Mangomint-style help hub for customers and providers, fully manageable via the existing Superadmin CMS (no separate learning admin API). It supports role-aware content (General, Customer, Provider) and optional internal-only content for staff.

## Routes

### Public

- **`/learn`** — Landing: hero, CTA cards, featured articles.
- **`/learn/[topicSlug]`** — Topic listing (articles in that category).
- **`/learn/article/[slug]`** — Single article; “Was this helpful?” at bottom.
- **`/learn/search?q=...`** — Full-text search results.

### Admin (under existing CMS)

- **Content → Learning Center** in Superadmin (`/admin/content/learning`): Categories, Articles, Featured, Homepage config.
- All Learning Center management uses **`/api/admin/content/learning/*`** (no `/api/admin/learning/*`).

## APIs

### Public (no auth)

- `GET /api/public/learn/home` — Homepage config + resolved featured articles.
- `GET /api/public/learn/categories` — List categories (optional `?audience=...`); includes `parent_id`.
- `GET /api/public/learn/tree` — Recursive category tree (same audience filter) for sidebar navigation.
- `GET /api/public/learn/topics/[slug]` — Category + paginated articles (`?page=&limit=`); includes `parents` and `parent_slugs` for breadcrumbs.
- `GET /api/public/learn/article/[slug]` — Single article (increments view count); includes `parents`, `parent_slugs`, and `content_type`.
- `GET /api/public/learn/search?q=...&page=&limit=` — Full-text search; returns results grouped by type (topics, articles, video_guides) with `result_type` and `read_time_min` where applicable.
- `POST /api/public/learn/article/[slug]/feedback` — Body: `{ "helpful": true | false }`.

### Admin (superadmin)

- `GET/POST /api/admin/content/learning/categories`
- `GET/PUT/DELETE /api/admin/content/learning/categories/[id]`
- `GET/POST /api/admin/content/learning/articles`
- `GET/PUT/DELETE /api/admin/content/learning/articles/[id]`
- `GET/PATCH /api/admin/content/learning/featured` — Payload: `{ "article_ids": [uuid, ...] }`.
- `GET/PATCH /api/admin/content/learning/homepage` — Hero, CTA cards, featured, video_library, platform_updates.

## Data model

- **learning_categories** — title, slug, icon, sort_order, audience (general|customer|provider|internal), visibility (public|internal), **parent_id** (optional; self-referential for tree: Collection → Topic).
- **learning_articles** — category_id, title, slug, summary, body, content_format (html|markdown), **content_type** (article|video_guide), status (draft|published|scheduled|archived), audience, is_internal, published_at, scheduled_at, featured_order; FTS via `search_vector`.
- **learning_homepage_sections** — section_key (hero, cta_cards, featured_articles, video_library, platform_updates), payload (JSONB).
- **learning_article_stats** — article_id, view_count, helpful_yes_count, helpful_no_count.
- **learning_article_feedback** — article_id, helpful (boolean), session_id, user_id (optional).

## RLS

- **Categories**: Public can SELECT where `visibility = 'public'`; superadmin full CRUD.
- **Articles**: Public can SELECT where `status = 'published'`, `is_internal = false`, and published/scheduled rules; superadmin full CRUD.
- **Homepage sections**: Public read; superadmin full CRUD.
- **Stats**: Public read; service role used to increment view/helpful from API.
- **Feedback**: Anyone can INSERT; superadmin can read.

## Search

- Postgres full-text on `learning_articles.search_vector` (title, summary, body).
- RPC `search_learning_articles(p_query, p_limit, p_offset)` returns published non-internal articles ranked by `ts_rank` + recency.

## Storage

- Attachments/images: Supabase Storage bucket **`learning-center`** (create bucket and policies as needed).

## Migrations

- **304_learning_center_tables.sql** — Tables, RLS, FTS column + index.
- **305_learning_center_seed.sql** — Categories + one overview article per category + homepage sections + stats.
- **306_learning_center_search_rpc.sql** — `search_learning_articles` RPC.
- **307_learning_center_tree_and_content_type.sql** — `parent_id` on categories; `content_type` (article|video_guide) on articles.
- **308_learning_center_search_content_type.sql** — Search RPC returns `content_type`.
- **483_learning_center_mobile_guides.sql** — Customer + provider mobile app guides (`customer-mobile-app`, `provider-mobile-app`), featured list update, cross-links from Getting Started.

## Content authoring

See **Content authoring guide** below: create/edit categories and articles in Superadmin → Content → Learning Center; set featured and homepage in the same place.
