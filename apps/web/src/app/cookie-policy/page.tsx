import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import CookiePolicyClient from "./cookie-policy-client";
import type { CookiePolicyData } from "./cookie-policy-client";

export const revalidate = 300;

const DEFAULT_SECTIONS = [
  {
    title: "Cookie Policy",
    content:
      "This content is managed in Admin → Content → Pages (page slug cookie-policy). Add section keys intro (HTML) and sections (JSON array of {title, content}).",
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

export default async function CookiePolicyPage() {
  const content = await getPublicPageContent("cookie-policy");

  const get = (key: string) => content?.[key]?.content ?? "";

  const data: CookiePolicyData = {
    pageTitle: get("hero_title") || get("page_title") || "Cookie Policy",
    introHeading: get("intro_heading") || "Cookies and similar technologies",
    introHtml: get("intro") || get("hero_description") || get("hero_content") || "",
    sections: safeJsonParse(get("sections"), DEFAULT_SECTIONS),
    sidebarHeading: get("sidebar_heading") || "Need to get in touch?",
    sidebarDescription:
      get("sidebar_description") ||
      "We are here to help with questions about cookies and tracking preferences.",
    heroImage: get("hero_image") || null,
  };

  return <CookiePolicyClient data={data} />;
}
