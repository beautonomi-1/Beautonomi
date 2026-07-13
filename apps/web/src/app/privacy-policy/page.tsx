import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import PrivacyPolicyClient from "./privacy-policy-client";
import type { PrivacyPolicyData } from "./privacy-policy-client";

export const revalidate = 300;

const DEFAULT_ARTICLES = [
  {
    category: "Help",
    title: "Help centre",
    description: "Get answers and contact support.",
    link: "/help",
  },
  {
    category: "Learn",
    title: "Account & profile",
    description: "How account settings and privacy controls work on Beautonomi.",
    link: "/learn/article/account-profile-overview",
  },
  {
    category: "Learn",
    title: "Security & privacy overview",
    description: "Security practices and how to protect your account.",
    link: "/learn/article/security-privacy-overview",
  },
];

const DEFAULT_SUPPLEMENTAL_POLICIES = [
  { title: "Terms of Service", link: "/terms-and-condition" },
  { title: "Cookie Policy", link: "/cookie-policy" },
  { title: "Account & Data Deletion", link: "/data-deletion" },
  { title: "Identity verification & biometric data (in policy)", link: "/privacy-policy#identity-verification" },
  { title: "South Africa (POPIA summary in policy)", link: "/privacy-policy#rights-south-africa" },
  { title: "EEA, UK & Switzerland (GDPR summary in policy)", link: "/privacy-policy#rights-eea-uk" },
  { title: "United States (state privacy rights in policy)", link: "/privacy-policy#rights-united-states" },
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

export default async function PrivacyPolicyPage() {
  const content = await getPublicPageContent("privacy-policy");

  const get = (key: string) => content?.[key]?.content ?? "";

  const data: PrivacyPolicyData = {
    title: get("hero_title") || "Beautonomi Privacy",
    description:
      get("hero_description") ||
      "Our Privacy Policy explains what personal information we collect, how we use personal information, how personal information is shared, and privacy rights.",
    heroImage: get("hero_image") || null,
    supplementalPolicies: safeJsonParse(get("supplemental_policies"), DEFAULT_SUPPLEMENTAL_POLICIES),
    articles: safeJsonParse(get("related_articles"), DEFAULT_ARTICLES),
  };

  return <PrivacyPolicyClient data={data} />;
}
