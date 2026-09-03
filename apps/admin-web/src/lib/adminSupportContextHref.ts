/** Admin SPA path for a support ticket's related record. */
export function adminSupportContextHref(
  type?: string | null,
  id?: string | null,
): string | null {
  const t = String(type ?? "").trim();
  const i = String(id ?? "").trim();
  if (!t || !i) return null;
  if (t === "booking") return `/admin/bookings/${i}`;
  if (t === "product_order") return `/admin/ecommerce/orders/${i}`;
  if (t === "gift_card") return `/admin/gift-cards/${i}`;
  return null;
}

export function adminSupportContextActionLabel(type?: string | null): string {
  const t = String(type ?? "").trim();
  if (t === "booking") return "Open booking";
  if (t === "product_order") return "Open product order";
  if (t === "gift_card") return "Open gift card";
  return "Open related record";
}

/** Admin SPA path that searches tickets by booking number, order number, or gift-card code. */
export function adminSupportTicketsSearchHref(query: string): string {
  const q = String(query ?? "").trim();
  if (!q) return "/admin/support-tickets";
  return `/admin/support-tickets?q=${encodeURIComponent(q)}`;
}
