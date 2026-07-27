import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import AgeSuitabilityClient from "./age-suitability-client";
import type { AgeSuitabilityData } from "./age-suitability-client";

export const revalidate = 300;

const DEFAULT_SECTIONS = [
  {
    title: "Age Suitability",
    content:
      "This content is managed in Admin → Content → Pages (page slug age-suitability). Add section keys intro (HTML) and sections (JSON array of {title, content}).",
  },
];

function safeJsonParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export default async function AgeSuitabilityPage() {
  const content = await getPublicPageContent("age-suitability");

  const get = (key: string) => content?.[key]?.content ?? "";

  const data: AgeSuitabilityData = {
    pageTitle: get("hero_title") || get("page_title") || "Age Suitability",
    introHeading: get("intro_heading") || "Age suitability and safety",
    introHtml: get("intro") || get("hero_description") || get("hero_content") || "",
    sections: safeJsonParse(get("sections"), DEFAULT_SECTIONS),
    sidebarHeading: get("sidebar_heading") || "Need to get in touch?",
    sidebarDescription:
      get("sidebar_description") ||
      "We are here to help with questions about age suitability, safety controls, and reporting.",
    heroImage: get("hero_image") || null,
  };

  return <AgeSuitabilityClient data={data} />;
}
