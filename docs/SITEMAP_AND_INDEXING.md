# Sitemap and Google indexing

## What is indexed

- **Sitemap URL:** `https://<your-domain>/sitemap.xml` (see `apps/web/src/app/sitemap.xml.ts`).
- **Included in sitemap:**
  - Static routes: home, become-a-partner, resources, help.
  - Category pages: `/category/<slug>` for active `global_service_categories`.
  - Provider profiles: `/partner-profile?slug=<slug>` only for providers whose user has **Include in search engines** enabled (privacy setting).

## Managing what appears on Google

1. **Add/remove or tune URLs**
   - Edit `apps/web/src/app/sitemap.xml.ts`: add/remove entries in `staticRoutes`, adjust `priority` and `changeFrequency` per route.
   - Provider profiles are controlled by the DB and the `include_in_search_engines` flag on the user; no code change needed to include/exclude a provider beyond that flag.

2. **Robots**
   - `apps/web/src/app/robots.ts` allows crawling and points to `NEXT_PUBLIC_SITE_URL/sitemap.xml`. Change there if you need to disallow certain paths or use another sitemap URL.

3. **Google Search Console**
   - Set `NEXT_PUBLIC_SITE_URL` to your live domain (Admin → Settings → SEO).
   - Submit `https://<your-domain>/sitemap.xml` in [Google Search Console](https://search.google.com/search-console) (Sitemaps section).
   - Use Search Console to see what’s indexed, request indexing, and fix coverage issues.

4. **How each URL is shown (title/snippet)**
   - Page `<title>` and meta description come from each page’s metadata or shared layout. Edit those in the relevant page/layout files or your SEO/admin settings to change how results look in Google.

## Footer link

The **Sitemap** link is shown at the very bottom of the page next to “All rights reserved” and points to `/sitemap.xml` (both in the main footer and in `footer1`).
