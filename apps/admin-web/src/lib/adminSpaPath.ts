/**
 * React Router lives under basename `/admin`. Returns a **root-absolute** path within the SPA
 * (must start with `/`) so `Link`/`navigate` targets are not resolved relative to the current route.
 * @example adminSpaTo("/admin/users/123") → "/users/123"
 */
export function adminSpaTo(href: string): string {
  let p = href.trim();
  if (!p.startsWith("/")) p = `/admin/${p}`;
  if (!p.startsWith("/admin")) p = `/admin${p.startsWith("/") ? p : `/${p}`}`;
  const rest = p.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
  if (!rest) return "/";
  return `/${rest}`;
}

/**
 * Absolute URL for non-React contexts (e.g. Mapbox `Popup` HTML). Uses basename `/admin/`.
 */
export function adminSpaAbsoluteUrl(href: string): string {
  if (typeof window === "undefined") return href;
  const spa = adminSpaTo(href);
  const origin = window.location.origin;
  const tail = spa === "/" ? "" : spa.startsWith("/") ? spa.slice(1) : spa;
  const base = `${origin}/admin`;
  return tail ? `${base}/${tail}` : `${base}/`;
}
