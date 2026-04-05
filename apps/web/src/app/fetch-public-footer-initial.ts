import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getFooterLinks } from "@/app/api/public/footer-links/route";
import { GET as getFooterSettings } from "@/app/api/public/footer-settings/route";
import type {
  PublicFooterAppLinkRow,
  PublicFooterInitial,
  PublicFooterLinkRow,
} from "@/types/public-footer-initial";

/**
 * In-process footer CMS payload for first paint (no client waterfall on home).
 */
export async function fetchPublicFooterInitial(): Promise<PublicFooterInitial> {
  try {
    const [linksReq, settingsReq] = await Promise.all([
      createNextRequestFromHeaders("/api/public/footer-links"),
      createNextRequestFromHeaders("/api/public/footer-settings"),
    ]);
    const [linksRes, settingsRes] = await Promise.all([
      getFooterLinks(linksReq),
      getFooterSettings(settingsReq),
    ]);

    const linksJson = (await linksRes.json()) as {
      data?: { links?: PublicFooterLinkRow[]; appLinks?: PublicFooterAppLinkRow[] };
    };
    const settingsJson = (await settingsRes.json()) as {
      data?: Record<string, string>;
    };

    const bundle = linksJson?.data;
    const rawSettings = settingsJson?.data ?? {};

    return {
      links: Array.isArray(bundle?.links) ? bundle.links : [],
      appLinks: Array.isArray(bundle?.appLinks) ? bundle.appLinks : [],
      settings: {
        social_label: rawSettings.social_label,
        copyright_text: rawSettings.copyright_text,
      },
    };
  } catch (e) {
    console.warn("fetchPublicFooterInitial failed:", e);
    return { links: [], appLinks: [], settings: {} };
  }
}
