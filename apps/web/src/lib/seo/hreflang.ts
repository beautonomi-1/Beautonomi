/**
 * SEO hreflang helpers for multi-market web (Phase 4).
 */
export type HreflangAlternate = {
  hrefLang: string;
  href: string;
};

export function buildHreflangAlternates(
  path: string,
  hosts: Array<{ hostname: string; locale: string; isPrimary?: boolean }>,
  protocol = "https",
): HreflangAlternate[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return hosts.map((h) => ({
    hrefLang: h.locale,
    href: `${protocol}://${h.hostname}${normalizedPath}`,
  }));
}

export function canonicalUrlForHost(hostname: string, path: string, protocol = "https"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${hostname}${normalizedPath}`;
}
