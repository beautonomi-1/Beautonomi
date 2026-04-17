# CMS Page Content (Superadmin)

The superadmin portal lets you manage **page content** via **Content → Pages**. Content is stored in `page_content` (keyed by `page_slug` and `section_key`). Different pages use different APIs (see below).

## Footer-linked pages: fully managed via CMS?

These are the internal links that appear in the site footer. Status:

| Footer link / route | Fully CMS-managed? | Notes |
|---------------------|--------------------|--------|
| **About** (`/about`) | Yes | Driven by **Content → About Us** (`about_us_content`). Renders hero (first section), story blocks, trust, and contact grid. Not from Content → Pages. |
| **Careers** (`/career`) | No | Page is static; does not load or display CMS content. |
| **Customer Support / Help** (`/help`) | No | Fetches help content but does not render it; UI is hardcoded. |
| **Blog** (`/news`) | No | Static; no CMS. |
| **Gift Cards** (`/gift-card`) | Yes | Hero, designs, features, banner from CMS. |
| **Sign Up** (`/signup`) | Yes | Content from CMS via signup-content API. |
| **For Partners** (`/become-a-partner`) | Yes | Hero, rating, why-different, features, CTA from CMS (usePageContent). |
| **Pricing** (`/pricing`) | Partial | Only hero_title, hero_description from CMS; plans/FAQs from other tables. |
| **Support** (`/help`) | No | Same as Help. |
| **Privacy Policy** (`/privacy-policy`) | Yes | Title, description, hero image, supplemental policies, articles from CMS. |
| **Terms of Service** (`/terms-and-condition`) | Yes | Title, intro, sections, sidebar from CMS. |
| **Gift Card Purchase** (`/gift-card/purchase`) | N/A | Form/flow; not a content page. |
| **Sitemap** (`/sitemap`) | N/A | Utility. |

**Fully CMS-managed:** about, gift-card, signup, become-a-partner, privacy-policy, terms-and-condition. **Not:** help, career, news. **Partial:** pricing (hero only).

## Which pages can be managed?

You can create and edit content for any **page slug**. The dropdown in the admin includes:

- **help** – Help Centre
- **career** – Careers
- **about** – About
- **become-a-partner**, **gift-card**, **why-beautonomi**, **pricing**, **signup**
- **privacy-policy**, **terms-and-condition**, **terms-of-service** (footer)
- **resources**, **beautonomi-friendly**

## How much is actually driven by CMS?

| Page / slug   | CMS used on frontend? | Notes |
|---------------|------------------------|--------|
| **help**      | Partially              | Help page fetches `page_slug=help` but the main UI (top articles, guides, explore more) is **hardcoded** in components. CMS entries for `help` are stored and can be used later if the help page is wired to render by `section_key`. |
| **career**    | Not yet                | Careers page is **fully static**. You can add content in the CMS with `page_slug=career` for future use; the career frontend does not yet load or display it. |
| **about**     | Yes                    | About page loads from **Content → About Us** (`about_us_content`) via `GET /api/public/about-us`. Section keys: mission, what_we_do, for_professionals, safety_trust, contact_intro, contact_email, contact_phone, contact_help_center. Optional `image_url` per section. |
| **gift-card** | Yes                    | Gift card page uses CMS. |
| **why-beautonomi** | Yes                | Uses CMS. |
| **pricing**   | Partial                | Only hero_title, hero_description from page_content; plans/FAQs from other DB tables. |
| **signup**    | Yes                    | Signup page content is managed via the “Signup Page” tab and CMS. |
| **become-a-partner** | Yes               | Uses CMS with known section keys (see admin modal). |
| **privacy-policy**, **terms-and-condition**, **terms-of-service** | Yes | Each loads via `/api/public/content/pages/[slug]` and renders title, intro, sections, etc. |

## APIs used by the frontend

- **`GET /api/public/about-us`** – About page only. Returns active `about_us_content` rows (section_key, title, content, image_url) ordered by display_order. Edit in **Content → About Us**.
- **`GET /api/public/page-content?page_slug=<slug>`** – Map by section_key. Used by: gift-card, help, why-beautonomi, resources. (About uses `/api/public/about-us`, not this.)
- **`GET /api/public/content/pages/[slug]`** – Array of sections. Used by: privacy-policy, terms-and-condition.
- **`GET /api/public/pages/[slug]`** – Grouped by section_key. Used by: become-a-partner (usePageContent hook).
- **`GET /api/public/signup-content`** – Signup content. Used by: signup page.
- **Pricing**: `getPricingPageContent()` (hero_title, hero_description only).

## Making help, career, or news fully CMS-driven

- **Help**: Page already fetches help content. Wire the response into the UI (e.g. top articles, guides from section_key) instead of hardcoded components.
- **Careers**: Add a fetch for `page_slug=career` and render hero, intro, and lists from CMS.
- **News**: Add a fetch for `page_slug=news` and render from CMS, or keep static.

## Content types

- **text** – Plain text  
- **html** – Rich text: in **Admin → Content → Pages** (Vite admin app), the **HTML** type uses a **TipTap** editor (headings H2/H3, bold, italic, underline, lists, blockquote, horizontal rule, links with `target=_blank`, undo/redo). Stored as HTML in `page_content.content`. The legacy Next.js **Content** screen may still use plain textareas; prefer the Vite admin for full WYSIWYG.  
- **json** – Structured data (e.g. feature lists)  
- **image** / **video** – Media URLs  

Public routes sanitize HTML with the same allowlist as marketing/pricing bullets (`sanitize-html`) via `sanitizeCmsPageHtml` / `<CmsHtml />` on key pages (e.g. Become a Partner sections).

Use the **Section Key** field to identify each block (e.g. `hero_title`, `hero_description`). The **Content → Pages** form includes **quick picks** for known slugs (`become-a-partner`, `gift-card`, etc.). The frontend uses these keys when it’s wired to CMS.
