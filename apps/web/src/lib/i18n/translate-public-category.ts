/**
 * Render-time category labels so follow-language updates immediately
 * (API/CMS names stay English in state).
 *
 * Provider-typed names are resolved onto catalog slugs (Hair Services → hair)
 * and then translated. Unknown names stay as the provider wrote them.
 */
export { translatePublicCategoryLabel as translatePublicCategory } from "@beautonomi/i18n";
