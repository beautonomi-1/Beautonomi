/**
 * React Router lives under basename `/admin`. Convert absolute admin paths to `to` values.
 * @example adminSpaTo("/admin/users/123") → "users/123"
 */
export function adminSpaTo(href: string): string {
  let p = href.trim();
  if (!p.startsWith("/")) p = `/admin/${p}`;
  if (!p.startsWith("/admin")) p = `/admin${p.startsWith("/") ? p : `/${p}`}`;
  const rest = p.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
  return rest || ".";
}
