import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import type { TermsData } from "@/app/terms-and-condition/terms-client";
import type { EulaSection } from "./app-eula-defaults";

function safeJsonParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function buildEulaPageData(options: {
  cmsSlug: string;
  defaultPageTitle: string;
  defaultIntroHtml: string;
  defaultSections: EulaSection[];
  lastUpdated: string;
  breadcrumbLabel?: string;
}): Promise<TermsData & { lastUpdated: string }> {
  const content = await getPublicPageContent(options.cmsSlug);
  const get = (key: string) => content?.[key]?.content ?? "";
  const cmsSections = safeJsonParse<EulaSection[]>(get("sections"), []);

  return {
    pageTitle: get("hero_title") || get("page_title") || options.defaultPageTitle,
    introHeading: get("intro_heading") || "End User License Agreement",
    introHtml:
      get("intro") ||
      get("hero_description") ||
      get("hero_content") ||
      options.defaultIntroHtml,
    sections: cmsSections.length > 0 ? cmsSections : options.defaultSections,
    sidebarHeading: get("sidebar_heading") || "Questions about these terms?",
    sidebarDescription:
      get("sidebar_description") ||
      "Contact Beautonomi support if you need help understanding your rights and obligations.",
    heroImage: get("hero_image") || null,
    supplementalPolicies: safeJsonParse(get("supplemental_policies"), [
      { title: "Privacy Policy", link: "/privacy-policy" },
      { title: "Age suitability", link: "/age-suitability" },
      { title: "General Terms", link: "/terms-and-condition" },
    ]),
    articles: safeJsonParse(get("related_articles"), []),
    lastUpdated: options.lastUpdated,
    breadcrumbLabel: options.breadcrumbLabel ?? "End User License Agreement",
  };
}
