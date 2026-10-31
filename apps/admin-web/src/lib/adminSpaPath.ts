const TICKET_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Map customer help-center ticket URLs stored on notification rows to admin SPA routes.
 * Leaves admin support-ticket links and unrelated paths unchanged (before `adminSpaTo`).
 */
export function rewriteNotificationTicketLinkForAdmin(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;

  let pathPart = trimmed;
  let search = "";
  const q = pathPart.indexOf("?");
  if (q >= 0) {
    search = pathPart.slice(q);
    pathPart = pathPart.slice(0, q);
  }

  let path = pathPart.replace(/\/+$/, "") || "/";
  if (path.startsWith("/admin/")) {
    path = path.slice("/admin".length) || "/";
  } else if (path === "/admin") {
    path = "/";
  }

  const help = path.match(/^\/help\/my-tickets(?:\/([^/]+))?$/);
  if (help) {
    const seg = help[1];
    if (seg && TICKET_ID_RE.test(seg)) {
      return `/admin/support-tickets/${seg}${search}`;
    }
    return `/admin/support-tickets${search}`;
  }

  const legacy = path.match(/^\/support\/tickets(?:\/([^/]+))?$/);
  if (legacy) {
    const seg = legacy[1];
    if (seg && TICKET_ID_RE.test(seg)) {
      return `/admin/support-tickets/${seg}${search}`;
    }
    return `/admin/support-tickets${search}`;
  }

  return trimmed;
}

/** Notification / activity `link` → in-SPA path (rewrites customer ticket URLs first). */
export function adminSpaNotificationLink(href: string): string {
  return adminSpaTo(rewriteNotificationTicketLinkForAdmin(href));
}

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
