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
    { value: "hero_primary_cta_label", label: "Hero — primary button label (text, default: Sign up)" },
    { value: "hero_feature_tabs", label: "Hero — feature tab chips (JSON array of strings, e.g. [\"CALENDAR\",\"ONLINE BOOKING\"])" },
    { value: "top_banner_learn_more", label: "Top banner — “Learn more” link label (text)" },
  ],
  "gift-card": [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_subtitle", label: "Hero — subtitle" },
    { value: "hero_description", label: "Hero — description" },
    { value: "buy_now_button_text", label: "Hero — buy button label" },
    { value: "purchase_url", label: "Hero — buy button URL" },
    { value: "business_text", label: "Business — intro text" },
    { value: "bulk_link_text", label: "Business — bulk link label" },
    { value: "bulk_purchase_url", label: "Business — bulk link URL" },
    { value: "banner_title", label: "Banner — title" },
    { value: "banner_description", label: "Banner — description" },
    { value: "banner_contact_text", label: "Banner — contact text" },
    { value: "sales_email", label: "Sales — email" },
    { value: "card_background_image", label: "Card — background image URL" },
    { value: "card_overlay_image", label: "Card — overlay image URL" },
    { value: "placeholder_brand_name", label: "Fallback card — brand name" },
    { value: "placeholder_card_text", label: "Fallback card — card text" },
    { value: "features_list", label: "Features — JSON list" },
    { value: "designs_list", label: "Designs — JSON array of {id, name, image_url, denominations, custom_amount}" },
    { value: "picking_designs_title", label: "Designs — section title" },
    { value: "designs_empty_state_title", label: "Designs — empty state title" },
    { value: "designs_empty_state_message", label: "Designs — empty state message" },
  ],
  "privacy-policy": [
    { value: "title", label: "Page title" },
    { value: "description", label: "Meta / intro" },
    { value: "hero_image", label: "Hero image URL" },
  ],
  "terms-and-condition": [
    { value: "hero_title", label: "Page title (H1)" },
    { value: "page_title", label: "Alternate page title" },
    { value: "intro_heading", label: "Intro block — heading" },
    { value: "intro", label: "Intro — HTML" },
    { value: "hero_description", label: "Intro — HTML (alternate key)" },
    { value: "hero_content", label: "Intro — HTML (alternate key)" },
    { value: "sections", label: "Body sections (JSON array of {title, content})" },
    { value: "sidebar_heading", label: "Sidebar — heading" },
    { value: "sidebar_description", label: "Sidebar — description" },
    { value: "hero_image", label: "Hero image URL" },
    { value: "supplemental_policies", label: "Supplemental policies (JSON)" },
    { value: "related_articles", label: "Related articles (JSON)" },
    { value: "title", label: "Legacy — page title" },
  ],
  /** Same section keys as terms-and-condition; live route `/terms-and-condition` reads that slug. */
  "terms-of-service": [
    { value: "hero_title", label: "Page title (H1)" },
    { value: "page_title", label: "Alternate page title" },
    { value: "intro_heading", label: "Intro block — heading" },
    { value: "intro", label: "Intro — HTML" },
    { value: "hero_description", label: "Intro — HTML (alternate key)" },
    { value: "hero_content", label: "Intro — HTML (alternate key)" },
    { value: "sections", label: "Body sections (JSON array of {title, content})" },
    { value: "sidebar_heading", label: "Sidebar — heading" },
    { value: "sidebar_description", label: "Sidebar — description" },
    { value: "hero_image", label: "Hero image URL" },
    { value: "supplemental_policies", label: "Supplemental policies (JSON)" },
    { value: "related_articles", label: "Related articles (JSON)" },
  ],
  "cookie-policy": [
    { value: "hero_title", label: "Page title (H1)" },
    { value: "page_title", label: "Alternate page title" },
    { value: "intro_heading", label: "Intro block — heading" },
    { value: "intro", label: "Intro — HTML" },
    { value: "hero_description", label: "Intro — HTML (alternate key)" },
    { value: "hero_content", label: "Intro — HTML (alternate key)" },
    { value: "sections", label: "Body sections (JSON array of {title, content})" },
    { value: "sidebar_heading", label: "Sidebar — heading" },
    { value: "sidebar_description", label: "Sidebar — description" },
    { value: "hero_image", label: "Hero image URL" },
  ],
  "beautonomi-friendly": [
    { value: "hero_title", label: "Hero — title (use line breaks for stacked lines)" },
    { value: "hero_subtitle", label: "Hero — subtitle" },
    { value: "cta_label", label: "Primary CTA label" },
    { value: "cta_href", label: "Primary CTA URL (text)" },
  ],
  career: [
    { value: "careers_portal_url", label: "Careers portal URL (Ashby etc., text)" },
    { value: "hero_eyebrow", label: "Hero — eyebrow" },
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_subtitle", label: "Hero — subtitle" },
    { value: "hero_cta_label", label: "Hero — primary CTA label" },
    { value: "value_cards", label: "Value cards (JSON)" },
    { value: "highlight_cards", label: "Highlight cards (JSON)" },
    { value: "carousel_slides", label: "Life-at carousel (JSON array of {image_url, alt})" },
  ],
  release: [
    { value: "hero_title", label: "Hero — title" },
    { value: "hero_description", label: "Hero — description" },
    { value: "body_html", label: "Main body (HTML)" },
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
    { value: "currency_note", label: "Hero — currency / footnote (e.g. All prices in ZAR)" },
  ],
  signup: [
    { value: "headline", label: "Headline (main title)" },
    { value: "sub_heading", label: "Sub-heading" },
    { value: "provider_card_title", label: "Provider card — title" },
    { value: "provider_card_micro_copy", label: "Provider card — micro copy" },
    { value: "provider_card_description", label: "Provider card — description" },
    { value: "provider_card_badge", label: "Provider card — badge (e.g. Most popular)" },
    { value: "customer_card_title", label: "Customer card — title" },
    { value: "customer_card_description", label: "Customer card — description" },
    { value: "customer_card_sub_description", label: "Customer card — sub description" },
    { value: "background_image_url", label: "Right hero — background image URL (content type: image)" },
    { value: "footer_text", label: "Footer legal copy (HTML)" },
    { value: "testimonial_quote", label: "Right panel — testimonial quote" },
    { value: "testimonial_attribution", label: "Right panel — testimonial attribution" },
    { value: "testimonial_pure_commerce", label: "Right panel — Pure Commerce line" },
    { value: "testimonial_yoco_support", label: "Right panel — Yoco / support line" },
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
  career: "marketing",
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
  career: "Careers",
};

/** Human title for UI; falls back to slug with spaces. */
export function cmsPageSlugTitle(pageSlug: string): string {
  return CMS_PAGE_SLUG_TITLES[pageSlug] ?? pageSlug.replace(/-/g, " ");
}

/** Slugs listed in Content → Pages filters even when no `page_content` rows exist yet. */
export function cmsManageablePageSlugList(): string[] {
  const combined = new Set<string>([
    ...Object.keys(CMS_PAGE_SECTION_PRESETS),
    ...Object.keys(SLUG_TO_GROUP),
    ...Object.keys(CMS_PAGE_SLUG_TITLES),
  ]);
  return [...combined].sort((a, b) => {
    const ga = cmsPageContentGroupForSlug(a);
    const gb = cmsPageContentGroupForSlug(b);
    const ia = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(ga);
    const ib = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(gb);
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

/** Preset label for a section key on a given page, or null if unknown. */
export function cmsSectionPresetLabel(pageSlug: string, sectionKey: string): string | null {
  const presets = CMS_PAGE_SECTION_PRESETS[pageSlug];
  if (!presets) return null;
  return presets.find((p) => p.value === sectionKey)?.label ?? null;
}

/** Optional public API hint for legal pages (operators often verify copy against the live route). */
export function cmsPagePublicApiHint(pageSlug: string): string | null {
  if (pageSlug === "terms-of-service") {
    return "Live route `/terms-and-condition` loads slug terms-and-condition (not terms-of-service). Prefer editing terms-and-condition, or duplicate rows.";
  }
  if (
    pageSlug === "privacy-policy" ||
    pageSlug === "terms-and-condition" ||
    pageSlug === "cookie-policy" ||
    pageSlug === "why-beautonomi" ||
    pageSlug === "beautonomi-friendly"
  ) {
    return `GET /api/public/content/pages/${pageSlug}`;
  }
  if (pageSlug === "become-a-partner" || pageSlug === "career") {
    return `GET /api/public/pages/${pageSlug}`;
  }
  if (pageSlug === "about") {
    return "Live /about reads `about_us_content`, not `page_content`.";
  }
  if (pageSlug === "pricing") {
    return `Hero copy: GET /api/public/pages/pricing · Plan cards: pricing_plans + pricing_plan_features (Admin → Plans)`;
  }
  if (pageSlug === "signup") {
    return "GET /api/public/signup-content";
  }
  if (pageSlug === "resources" || pageSlug === "help") {
    return `GET /api/public/page-content?page_slug=${pageSlug}`;
  }
  return null;
}
