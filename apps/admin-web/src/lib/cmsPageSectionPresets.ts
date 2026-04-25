/**
 * Known `section_key` values per `page_slug` for Content → Pages.
 * Used in the CMS UI as quick-picks when creating a row (section key is immutable after create).
 *
 * Keep in sync with `apps/web/src/lib/cmsPageSectionPresets.ts` (legacy Next admin uses the same taxonomy).
 */
export const CMS_PAGE_SECTION_PRESETS: Record<string, { value: string; label: string }[]> = {
  "become-a-partner": [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_description", label: "Hero — description" },
    { value: "video_tour_url", label: "Hero — video tour URL (text)" },
    { value: "rating_text", label: "Rating strip — text" },
    { value: "why_different_title", label: "Why different — title" },
    { value: "why_different_description", label: "Why different — description" },
    { value: "features_title", label: "Features — title" },
    { value: "features_description", label: "Features — description" },
    { value: "features_list", label: "Features — list (JSON)" },
    { value: "cta_title", label: "CTA — title" },
    { value: "cta_description", label: "CTA — description" },
    { value: "top_banner_enabled", label: "Top banner — enabled (text)" },
    { value: "top_banner_content", label: "Top banner — message (text)" },
    { value: "top_banner_link", label: "Top banner — link URL (text)" },
    { value: "demo_booking_type", label: "Demo booking — type (text)" },
    { value: "demo_booking_embed", label: "Demo booking — embed URL/HTML" },
  ],
  "gift-card": [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_subtitle", label: "Hero — subtitle" },
    { value: "hero_description", label: "Hero — description" },
    { value: "business_text", label: "Business — intro text" },
    { value: "banner_title", label: "Banner — title" },
    { value: "banner_description", label: "Banner — description" },
    { value: "banner_contact_text", label: "Banner — contact text" },
    { value: "sales_email", label: "Sales — email" },
    { value: "card_background_image", label: "Card — background image URL" },
    { value: "card_overlay_image", label: "Card — overlay image URL" },
    { value: "features_list", label: "Features — JSON list" },
    { value: "designs_list", label: "Designs — JSON" },
    { value: "picking_designs_title", label: "Designs — section title" },
  ],
  "privacy-policy": [
    { value: "title", label: "Page title" },
    { value: "description", label: "Meta / intro" },
    { value: "hero_image", label: "Hero image URL" },
  ],
  "terms-and-condition": [
    { value: "title", label: "Page title" },
    { value: "intro", label: "Intro (HTML)" },
  ],
  "why-beautonomi": [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_subtitle", label: "Hero — subtitle" },
    { value: "hero_description", label: "Hero — description" },
    { value: "cta_button_text", label: "Hero — CTA button text" },
    { value: "cta_url", label: "Hero — CTA URL" },
    { value: "hero_image", label: "Hero — image URL" },
    { value: "features_section_title", label: "Features — section title" },
    { value: "features_list", label: "Features — list (JSON)" },
    { value: "benefits_title", label: "Benefits — title" },
    { value: "benefits_description", label: "Benefits — description" },
    { value: "benefits_list", label: "Benefits — list (JSON)" },
    { value: "benefits_cta_text", label: "Benefits — CTA text" },
    { value: "benefits_cta_url", label: "Benefits — CTA URL" },
    { value: "benefits_image", label: "Benefits — image URL" },
    { value: "cta_banner_title", label: "CTA banner — title" },
    { value: "cta_banner_description", label: "CTA banner — description" },
    { value: "cta_banner_button_text", label: "CTA banner — button text" },
    { value: "cta_banner_url", label: "CTA banner — URL" },
    { value: "cta_banner_image", label: "CTA banner — image URL" },
  ],
  pricing: [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_description", label: "Hero — description" },
  ],
  signup: [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_description", label: "Hero — description" },
  ],
  resources: [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_description", label: "Hero — description" },
  ],
  help: [
    { value: "hero_title", label: "Help centre — hero title" },
    { value: "search_placeholder", label: "Search placeholder" },
    { value: "search_suggestions", label: "Search suggestions (JSON array of strings)" },
  ],
};

/** High-level buckets for Content → Pages so operators can scan by intent, not one flat list. */
export type CmsPageContentGroupId = "legal" | "marketing" | "help_account" | "other";

export const CMS_PAGE_CONTENT_GROUP_ORDER: CmsPageContentGroupId[] = [
  "legal",
  "marketing",
  "help_account",
  "other",
];

export const CMS_PAGE_CONTENT_GROUP_LABELS: Record<CmsPageContentGroupId, string> = {
  legal: "Legal & policy",
  marketing: "Marketing & commerce",
  help_account: "Help, about & signup",
  other: "Other page slugs",
};

const SLUG_TO_GROUP: Record<string, CmsPageContentGroupId> = {
  "privacy-policy": "legal",
  "terms-and-condition": "legal",
  "terms-of-service": "legal",
  "cookie-policy": "legal",
  "become-a-partner": "marketing",
  "gift-card": "marketing",
  "why-beautonomi": "marketing",
  pricing: "marketing",
  resources: "marketing",
  "beautonomi-friendly": "marketing",
  release: "marketing",
  help: "help_account",
  about: "help_account",
  signup: "help_account",
};

export function cmsPageContentGroupForSlug(pageSlug: string): CmsPageContentGroupId {
  return SLUG_TO_GROUP[pageSlug] ?? "other";
}

const CMS_PAGE_SLUG_TITLES: Record<string, string> = {
  "privacy-policy": "Privacy policy",
  "terms-and-condition": "Terms & conditions",
  "terms-of-service": "Terms of service",
  "cookie-policy": "Cookie policy",
  "become-a-partner": "Become a partner",
  "gift-card": "Gift cards",
  "why-beautonomi": "Why Beautonomi",
  pricing: "Pricing",
  resources: "Resources hub",
  help: "Help centre",
  about: "About",
  signup: "Customer signup",
  "beautonomi-friendly": "Beautonomi friendly",
  release: "Release notes",
};

/** Human title for UI; falls back to slug with spaces. */
export function cmsPageSlugTitle(pageSlug: string): string {
  return CMS_PAGE_SLUG_TITLES[pageSlug] ?? pageSlug.replace(/-/g, " ");
}

/** Preset label for a section key on a given page, or null if unknown. */
export function cmsSectionPresetLabel(pageSlug: string, sectionKey: string): string | null {
  const presets = CMS_PAGE_SECTION_PRESETS[pageSlug];
  if (!presets) return null;
  return presets.find((p) => p.value === sectionKey)?.label ?? null;
}

/** Optional public API hint for legal pages (operators often verify copy against the live route). */
export function cmsPagePublicApiHint(pageSlug: string): string | null {
  if (
    pageSlug === "privacy-policy" ||
    pageSlug === "terms-and-condition" ||
    pageSlug === "terms-of-service" ||
    pageSlug === "cookie-policy" ||
    pageSlug === "why-beautonomi"
  ) {
    return `GET /api/public/content/pages/${pageSlug}`;
  }
  return null;
}
