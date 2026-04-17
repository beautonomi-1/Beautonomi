/**
 * Known `section_key` values per `page_slug` for Content → Pages.
 * Used in the CMS UI as quick-picks when creating a row (section key is immutable after create).
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
    { value: "hero_description", label: "Hero — description" },
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
