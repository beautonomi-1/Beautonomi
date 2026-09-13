/**
 * Translate CMS footer titles at render time from href / English title.
 */

type Translate = (key: string, options?: { defaultValue?: string }) => string;

const HREF_TO_KEY: Array<[RegExp, string]> = [
  [/\/sitemap/i, "sitemap"],
  [/\/learn/i, "learningCenter"],
  [/\/careers/i, "careers"],
  [/\/about/i, "aboutUs"],
  [/\/contact/i, "contact"],
  [/\/blog/i, "blog"],
  [/\/press/i, "press"],
  [/\/help/i, "helpCenter"],
  [/become-a-partner|become-partner/i, "becomePartner"],
  [/\/pricing/i, "pricing"],
  [/gift-card/i, "giftCard"],
  [/terms-and-condition|\/terms/i, "terms"],
  [/\/privacy/i, "privacy"],
  [/cookie/i, "cookiePolicy"],
  [/community/i, "community"],
  [/accessibility/i, "accessibility"],
  [/media-assets|\/media/i, "media"],
  [/support/i, "customerSupport"],
  [/partners/i, "forPartners"],
  [/age-suitability|age_suitability/i, "ageSuitability"],
  [/sign-up|signup|register/i, "signUp"],
];

const TITLE_TO_KEY: Record<string, string> = {
  "about us": "aboutUs",
  about: "aboutUs",
  careers: "careers",
  contact: "contact",
  "contact us": "contact",
  blog: "blog",
  press: "press",
  "press releases": "press",
  help: "help",
  "help center": "helpCenter",
  "help centre": "helpCenter",
  "learning center": "learningCenter",
  "learning centre": "learningCenter",
  "become a partner": "becomePartner",
  "become a service provider": "becomePartner",
  pricing: "pricing",
  "for partners": "forPartners",
  "gift card": "giftCard",
  "gift card purchase": "giftCardPurchase",
  "terms of service": "terms",
  "terms of use": "termsOfUse",
  "privacy policy": "privacy",
  "cookie policy": "cookiePolicy",
  cookies: "cookies",
  sitemap: "sitemap",
  "community guidelines": "community",
  accessibility: "accessibility",
  "media assets": "media",
  "customer support": "customerSupport",
  support: "customerSupport",
  "age suitability": "ageSuitability",
  "sign up": "signUp",
  signup: "signUp",
};

function lookup(t: Translate, key: string): string | null {
  const translated = t(`web.layout.footer.links.${key}`);
  if (translated && translated !== `web.layout.footer.links.${key}`) return translated;
  return null;
}

export function translateFooterLinkTitle(
  t: Translate,
  href: string | undefined,
  title: string | undefined,
): string {
  const rawTitle = (title || "").trim();
  const path = (href || "").trim();

  for (const [pattern, key] of HREF_TO_KEY) {
    if (pattern.test(path)) {
      const translated = lookup(t, key);
      if (translated) return translated;
    }
  }

  const titleKey = TITLE_TO_KEY[rawTitle.toLowerCase()];
  if (titleKey) {
    const translated = lookup(t, titleKey);
    if (translated) return translated;
  }

  return rawTitle || path;
}
