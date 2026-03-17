# Learning Center — Content authoring guide

How to add and edit Learning Center content from Superadmin (no code changes).

## Where to manage

1. Log in as **superadmin**.
2. Go to **Content & catalog → Learning Center** (`/admin/content/learning`).
3. Use the tabs: **Categories**, **Articles**, **Featured**, **Homepage**.

## Categories

- Categories use a **tree**: each category can have an optional **parent** (Collection → Topic). Root categories have no parent.
- In **Learning Center → Categories** you can: **Add category** (with Parent dropdown: “(Root)” or another category), **Edit** (change title, slug, parent, audience), and **Delete**.
- **Delete rules**: You cannot delete a category that has **sub-categories** or **articles**. Move or delete children first; the API returns a clear error (e.g. “Cannot delete: category has sub-categories…” or “Cannot delete: category has N article(s)…”).
- **Parent / cycle**: Setting a category’s parent to itself or to one of its descendants is not allowed (API returns “Parent would create a cycle”).
- Each category has: **title**, **slug**, **parent_id** (optional; null = root), **audience** (general | customer | provider | internal), **visibility** (public | internal).
- **Internal** categories are only visible to superadmins; they never appear on the public `/learn` site or in search.
- **Breadcrumbs**: Article and topic pages show lineage (e.g. Home > Parent topic > Current). Lineage is computed from the category’s `parent_id` chain.

## Articles

- **Create and edit in the CMS**: In **Learning Center → Articles**, use **Add article** to create or **Edit** on any row to change an article. The article editor lets you set category, title, slug, summary, **hero image URL** (`image_url`), **body** (HTML or Markdown), content format/type, status, audience, internal-only, featured order, and publish/schedule times. You can add images, GIFs, and video in the body using HTML (e.g. `<img src="..." />`, `<video>`, or embeds).
- **API**: Create with `POST /api/admin/content/learning/articles`; edit with `PUT /api/admin/content/learning/articles/[id]`. Same fields as the CMS form.
- **Content type**: `article` (default) = standard article; `video_guide` = appears under “Video guides” in **/learn/search** and in any result grouping by type.
- **Slug**: Must be unique. Use lowercase, hyphens (e.g. `how-to-reschedule`).
- **Body**: HTML or Markdown (set `content_format`). For rich text and media, use HTML in the body. Images, GIFs, and video embedded in the body (e.g. `<img>`, `<video>`, `<iframe>`) are styled to match the article text column. **YouTube**: On YouTube, click Share → Embed, copy the iframe code, and paste it into the article body; it will render with correct aspect ratio and in-context styling.
- **Status**: Only `published` articles appear on the public site. Use `draft` while editing, `scheduled` with `scheduled_at` for future publish.
- **Internal**: Check **Internal only** for articles that should never appear publicly (e.g. ops playbooks).
- **Hero image**: Set **Hero image URL** in the editor; it is shown at the top of the article on `/learn/article/[slug]`.

## Featured articles

- In **Learning Center → Featured**, paste comma-separated **article IDs** (UUIDs) in the order you want them on the homepage.
- Save. The public `/learn` homepage will show these as “Featured articles”.

## Homepage

- **Hero**: Title and subtitle shown at the top of `/learn`.
- **CTA cards**: Configured in the Homepage tab (or via `PATCH /api/admin/content/learning/homepage` with `cta_cards.cards` array: title, description, icon, link).
- **Video Library** and **Platform Updates** sections are optional and can be configured in the same payload.

## Preview

- Open **/learn** in a new tab to see the public view. Use different browsers or incognito to simulate anonymous vs logged-in if you add role-based content later.

## Images and attachments

- Upload images to the Supabase Storage bucket **`learning-center`**.
- Use the returned public URL in article `image_url` or inside `body` (e.g. `<img src="..." />`).

## Best practices

- Use **General** audience for content that applies to both customers and providers.
- Use **Customer** / **Provider** for role-specific help.
- Keep **Internal** for operations playbooks and never link them from public pages.
- After publishing, check **/learn/search?q=...** to confirm articles are searchable.
