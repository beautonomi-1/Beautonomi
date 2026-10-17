import {
  ADMIN_SECTION_ECOMMERCE,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_MARKETING_COMMS,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_PROVIDER_OPS,
  ADMIN_SECTION_USERS_TRUST,
  canAccessSection,
} from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";

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
  if (t === "provider_onboarding") return `/admin/provider-ops/tracker/${i}`;
  if (t === "user") return `/admin/users/${i}`;
  if (t === "provider") return `/admin/providers/${i}`;
  if (t === "lead") return `/admin/provider-ops/leads/${i}`;
  if (t === "payment") return `/admin/refunds?q=${encodeURIComponent(i)}`;
  if (t === "wallet_bank_refund") return `/admin/refunds?tab=bank&id=${encodeURIComponent(i)}`;
  if (t === "account") return `/admin/users/${i}`;
  return null;
}

/** Role-gated deep link — support agents see facts on the card only. */
export function adminSupportContextHrefForRole(
  role: UserRole,
  type?: string | null,
  id?: string | null,
): string | null {
  const t = String(type ?? "").trim();
  const i = String(id ?? "").trim();
  if (!t || !i) return null;
  if (t === "booking" && !canAccessSection(role, ADMIN_SECTION_PROVIDERS_OPERATIONS)) return null;
  if (t === "product_order" && !canAccessSection(role, ADMIN_SECTION_ECOMMERCE)) return null;
  if (t === "gift_card" && !canAccessSection(role, ADMIN_SECTION_MARKETING_COMMS)) return null;
  if (t === "payment" && !canAccessSection(role, ADMIN_SECTION_FINANCE)) return null;
  if (t === "wallet_bank_refund" && !canAccessSection(role, ADMIN_SECTION_FINANCE)) return null;
  if ((t === "account" || t === "user") && !canAccessSection(role, ADMIN_SECTION_USERS_TRUST)) return null;
  if (t === "provider" && !canAccessSection(role, ADMIN_SECTION_PROVIDERS_OPERATIONS)) return null;
  if ((t === "provider_onboarding" || t === "lead") && !canAccessSection(role, ADMIN_SECTION_PROVIDER_OPS)) {
    return null;
  }
  return adminSupportContextHref(type, id);
}

export function adminSupportContextActionLabel(type?: string | null): string {
  const t = String(type ?? "").trim();
  if (t === "booking") return "Open booking";
  if (t === "product_order") return "Open product order";
  if (t === "gift_card") return "Open gift card";
  if (t === "provider_onboarding") return "Open onboarding tracker";
  if (t === "user") return "Open user";
  if (t === "provider") return "Open provider";
  if (t === "lead") return "Open lead";
  if (t === "payment") return "Search refunds";
  if (t === "wallet_bank_refund") return "Open bank refund";
  if (t === "account") return "Open account";
  return "Open related record";
}

/** Admin SPA path that searches tickets by booking number, order number, or gift-card code. */
export function adminSupportTicketsSearchHref(query: string): string {
  const q = String(query ?? "").trim();
  if (!q) return "/admin/support-tickets";
  return `/admin/support-tickets?q=${encodeURIComponent(q)}`;
}
