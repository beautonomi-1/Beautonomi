/** Shared defaults for /career when CMS rows are missing (client + server safe). */

export const DEFAULT_CAREERS_PORTAL_URL =
  "https://beautonomi.zohorecruit.com/jobs/Careers";

/** HTTPS + Zoho Recruit host allowlist — use for any CMS-sourced careers URL. */
export function validateCareersPortalUrl(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "beautonomi.zohorecruit.com") return url.toString();
  if (host.endsWith(".zohorecruit.com")) return url.toString();
  return null;
}

export const DEFAULT_CAREER_META_TITLE = "Careers at Beautonomi";

export const DEFAULT_CAREER_META_DESCRIPTION =
  "Join Beautonomi. Explore open roles and help shape the future of beauty and wellness.";

export const DEFAULT_CAREER_HERO_EYEBROW = "We're hiring";

export const DEFAULT_CAREER_HERO_TITLE = "Build with us";

export const DEFAULT_CAREER_HERO_SUBTITLE =
  "Help connect people with great beauty and wellness experiences—and grow your career doing meaningful work.";

export const DEFAULT_CAREER_HERO_CTA_LABEL = "View open roles";
