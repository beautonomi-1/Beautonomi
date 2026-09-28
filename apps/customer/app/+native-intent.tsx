/**
 * Maps HTTPS paths into expo-router routes for the customer app.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const isAbsolute = /^https?:\/\//i.test(path);
    const pathname = isAbsolute ? new URL(path).pathname : path.split("?")[0];
    const search = isAbsolute
      ? new URL(path).search
      : path.includes("?")
        ? path.slice(path.indexOf("?"))
        : "";

    if (pathname === "/booking" || pathname.startsWith("/booking/")) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const slug = params.get("slug");
      if (slug) {
        const embedSuffix = search.includes("embed=1") ? "&embed=1" : "";
        return `/(app)/book?slug=${encodeURIComponent(slug)}${embedSuffix}`;
      }
    }

    // /book/{providerSlug} (not express /book/l/… or checkout /book/continue)
    const bookMatch = pathname.match(/^\/book\/([^/]+)\/?$/);
    if (bookMatch && bookMatch[1] !== "l" && bookMatch[1] !== "continue") {
      const providerSlug = decodeURIComponent(bookMatch[1]);
      return `/(app)/book/${encodeURIComponent(providerSlug)}${search}`;
    }

    // Express link /book/l/{code}
    const expressMatch = pathname.match(/^\/book\/l\/([^/]+)\/?$/);
    if (expressMatch) {
      const linkSlug = decodeURIComponent(expressMatch[1]);
      return `/(app)/book/l/${encodeURIComponent(linkSlug)}${search}`;
    }
  } catch {
    // pass through
  }
  return path;
}
