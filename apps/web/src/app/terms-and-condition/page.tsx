import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import TermsClient from "./terms-client";
import type { TermsData } from "./terms-client";

export const revalidate = 300;

const DEFAULT_SECTIONS = [
  {
    title: "Terms of Service",
    content:
      "These terms are managed in Admin → Content → Pages (page slug terms-and-condition). Add section keys intro (HTML) and sections (JSON array of {title, content}).",
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

export default async function TermsOfServicePage() {
  const content = await getPublicPageContent("terms-and-condition");

  const get = (key: string) => content?.[key]?.content ?? "";

  const data: TermsData = {
    pageTitle: get("hero_title") || get("page_title") || "Terms of Service",
    introHeading: get("intro_heading") || "Applicability of Terms",
    introHtml: get("intro") || get("hero_description") || get("hero_content") || "",
    sections: safeJsonParse(get("sections"), DEFAULT_SECTIONS),
    sidebarHeading: get("sidebar_heading") || "Need to get in touch?",
    sidebarDescription:
      get("sidebar_description") || "We're here to help with any questions about our terms of service.",
    heroImage: get("hero_image") || null,
    supplementalPolicies: safeJsonParse(get("supplemental_policies"), [
      { title: "Privacy Policy", link: "/privacy-policy" },
      { title: "Cookie Policy", link: "/cookie-policy" },
      { title: "Account & Data Deletion", link: "/data-deletion" },
    ]),
    articles: safeJsonParse(get("related_articles"), []),
  };

  return <TermsClient data={data} />;
}
