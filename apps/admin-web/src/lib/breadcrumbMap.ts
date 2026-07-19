/**
 * Maps route path patterns (relative to /admin/) to human-readable labels and
 * their parent href.  Dynamic `:id` / `:slug` / `:userId` / `:batchId` segments
 * are represented by `[id]` for matching.
 *
 * AdminBreadcrumbs walks the current URL, normalises dynamic segments, and
 * looks up each prefix to build the trail. Pages can override the leaf label
 * via `useAdminBreadcrumbLeaf`.
 */

export interface BreadcrumbRoute {
  /** Display label shown in the breadcrumb trail. */
  label: string;
  /** Absolute href of the parent crumb, or null for root sections. */
  parentHref: string | null;
}

/**
 * Static map: normalised path (dynamic segments replaced with `[id]`) →
 * breadcrumb descriptor.
 *
 * List the most-specific paths first when patterns share a prefix, because
 * `breadcrumbsForPath` finds an exact match after normalisation.
 */
export const BREADCRUMB_MAP: Record<string, BreadcrumbRoute> = {
  // Overview
  dashboard: { label: "Dashboard", parentHref: null },
  analytics: { label: "Analytics", parentHref: null },
  "analytics/geo": { label: "Geo & Devices", parentHref: "/admin/analytics" },
  reports: { label: "Reports", parentHref: null },
  "reports/[id]": { label: "Report", parentHref: "/admin/reports" },
  "knowledge-base": { label: "Knowledge Base", parentHref: null },
  "knowledge-base/[id]": { label: "Article", parentHref: "/admin/knowledge-base" },

  // Operations
  "support-tickets": { label: "Support Tickets", parentHref: null },
  "support-tickets/[id]": { label: "Ticket", parentHref: "/admin/support-tickets" },
  bookings: { label: "Bookings", parentHref: null },
  "bookings/[id]": { label: "Booking", parentHref: "/admin/bookings" },
  "group-bookings": { label: "Group Bookings", parentHref: null },
  "gods-eye": { label: "Gods Eye", parentHref: null },
  "service-zones": { label: "Market Coverage", parentHref: null },
  "service-zones/[id]": { label: "Service Zone", parentHref: "/admin/service-zones" },

  // Trust & Safety
  disputes: { label: "Disputes", parentHref: null },
  refunds: { label: "Refunds", parentHref: null },
  reviews: { label: "Reviews & Ratings", parentHref: null },
  "user-reports": { label: "User Reports", parentHref: null },
  "fraud-cases": { label: "Fraud Cases", parentHref: null },
  verifications: { label: "Identity Verifications", parentHref: null },
  "verifications/[id]": { label: "Verification", parentHref: "/admin/verifications" },
  "control-plane/safety-logs": { label: "Safety Logs", parentHref: null },

  // Providers
  providers: { label: "Providers", parentHref: null },
  "providers/[id]": { label: "Provider", parentHref: "/admin/providers" },
  "providers/distance-settings": { label: "Provider Distance", parentHref: "/admin/providers" },
  staff: { label: "Staff", parentHref: null },
  "referral-sources": { label: "Referral Sources", parentHref: null },

  // Provider Onboarding
  "provider-ops": { label: "Dashboard", parentHref: null },
  "provider-ops/leads": { label: "Lead Inbox", parentHref: "/admin/provider-ops" },
  "provider-ops/leads/new": { label: "New Lead", parentHref: "/admin/provider-ops/leads" },
  "provider-ops/leads/[id]": { label: "Lead", parentHref: "/admin/provider-ops/leads" },
  "provider-ops/pipeline": { label: "Pipeline Board", parentHref: "/admin/provider-ops" },
  "provider-ops/tracker": { label: "Onboarding Tracker", parentHref: "/admin/provider-ops" },
  "provider-ops/tracker/[id]": { label: "Tracker", parentHref: "/admin/provider-ops/tracker" },
  "provider-ops/providers/[id]": { label: "Provider Lifecycle", parentHref: "/admin/provider-ops" },
  "provider-ops/activation": { label: "Activation Queue", parentHref: "/admin/provider-ops" },
  "provider-ops/duplicates": { label: "Duplicate Review", parentHref: "/admin/provider-ops" },
  "provider-ops/reports": { label: "Reports", parentHref: "/admin/provider-ops" },
  "provider-ops/settings": { label: "Settings", parentHref: "/admin/provider-ops" },

  // Customers
  users: { label: "Customers & Users", parentHref: null },
  "users/[id]": { label: "User", parentHref: "/admin/users" },
  "audit-logs": { label: "Audit Logs", parentHref: null },

  // Finance
  finance: { label: "Finance", parentHref: null },
  payouts: { label: "Payouts", parentHref: null },
  fees: { label: "Fee Management", parentHref: null },
  "settings/platform-fees": { label: "Platform Fees", parentHref: "/admin/settings" },
  taxes: { label: "Taxes", parentHref: null },
  "period-locks": { label: "Period Locks", parentHref: null },
  "wallet-reconciliation": { label: "Wallet Reconciliation", parentHref: null },
  "paystack-terminal": { label: "Paystack Terminal", parentHref: null },
  "provider-subscriptions": { label: "Provider Subscriptions", parentHref: null },
  "subscription-revenue": { label: "Subscription Revenue", parentHref: null },
  plans: { label: "Plans & Pricing", parentHref: null },
  billing: { label: "Billing", parentHref: null },

  // Commercial Operations (Terminal)
  "commercial/terminal-insights": { label: "Terminal Insights", parentHref: null },
  "commercial/terminal-products": { label: "Terminal Products", parentHref: null },
  "commercial/terminal-orders": { label: "Terminal Orders", parentHref: null },
  "commercial/terminal-campaigns": { label: "Terminal Campaigns", parentHref: null },
  "commercial/terminal-reporting": { label: "Terminal Reporting", parentHref: null },
  "commercial/terminal-vendors": { label: "Terminal Vendors", parentHref: null },
  "commercial/terminal-collection-locations": { label: "Pickup Locations", parentHref: null },

  // Commerce & Catalog
  ecommerce: { label: "E-commerce", parentHref: null },
  "ecommerce/orders": { label: "Product Orders", parentHref: "/admin/ecommerce" },
  "ecommerce/orders/[id]": { label: "Order", parentHref: "/admin/ecommerce/orders" },
  "ecommerce/returns": { label: "Product Returns", parentHref: "/admin/ecommerce" },
  "ecommerce/products": { label: "Product Catalog", parentHref: "/admin/ecommerce" },
  addons: { label: "Add-ons", parentHref: null },
  catalog: { label: "Service Catalog", parentHref: null },
  "catalog/global-categories": { label: "Global Categories", parentHref: "/admin/catalog" },
  "gift-cards": { label: "Gift Cards", parentHref: null },
  "gift-cards/[id]": { label: "Gift Card", parentHref: "/admin/gift-cards" },

  // Marketing
  ads: { label: "Ads & Campaigns", parentHref: null },
  "ads/[id]": { label: "Campaign", parentHref: "/admin/ads" },
  promotions: { label: "Promotions", parentHref: null },
  loyalty: { label: "Loyalty", parentHref: null },
  "gamification": { label: "Gamification", parentHref: null },
  "gamification/point-rules": { label: "Point Rules", parentHref: "/admin/gamification" },
  "gamification/badges": { label: "Provider Badges", parentHref: "/admin/gamification" },
  "gamification/operations": { label: "Gamification Ops", parentHref: "/admin/gamification" },
  automations: { label: "Automations", parentHref: null },
  "marketing-pricebook": { label: "Marketing Pricebook", parentHref: null },
  broadcast: { label: "Broadcast", parentHref: null },
  "broadcast/compose": { label: "Compose", parentHref: "/admin/broadcast" },
  "broadcast/history": { label: "History", parentHref: "/admin/broadcast" },

  // Communications
  notifications: { label: "Notifications", parentHref: null },
  "notification-templates": { label: "Notification Templates", parentHref: null },
  "sms-templates": { label: "SMS Templates", parentHref: null },
  "email-templates": { label: "Email Templates", parentHref: null },
  "whatsapp-content-templates": { label: "WhatsApp Content Templates", parentHref: null },
  "whatsapp/templates": { label: "WhatsApp Session Templates", parentHref: null },
  "whatsapp/sessions": { label: "WhatsApp Sessions", parentHref: null },
  "whatsapp/batches/[id]": { label: "Batch", parentHref: "/admin/whatsapp/sessions" },

  // Content
  content: { label: "Content Hub", parentHref: null },
  "content/learning": { label: "Learning Center", parentHref: "/admin/content" },
  "content/resources": { label: "CMS Resources", parentHref: "/admin/content" },
  "content/faqs": { label: "FAQs", parentHref: "/admin/content" },
  "content/about-us": { label: "About Us", parentHref: "/admin/content" },
  "content/pages": { label: "CMS Pages", parentHref: "/admin/content" },
  "content/featured-cities": { label: "Featured Cities", parentHref: "/admin/content" },
  "content/app-links": { label: "App Links", parentHref: "/admin/content" },
  explore: { label: "Explore Feed", parentHref: null },
  "explore/[id]": { label: "Post", parentHref: "/admin/explore" },

  // Integrations
  webhooks: { label: "Webhooks", parentHref: null },
  "api-keys": { label: "API Keys", parentHref: null },
  "integrations/paystack": { label: "Paystack", parentHref: null },
  "integrations/resend": { label: "Resend", parentHref: null },
  "integrations/slack": { label: "Slack", parentHref: null },
  "integrations/calls": { label: "Calls", parentHref: null },
  "integrations/amplitude": { label: "Amplitude", parentHref: null },
  mapbox: { label: "Mapbox", parentHref: null },
  "iso-codes": { label: "ISO Codes", parentHref: null },
  "integrations/yoco": { label: "Yoco Web POS", parentHref: null },
  "integrations/paycloud": { label: "PayCloud Card Machines", parentHref: null },
  "integrations/paycloud-operations": { label: "PayCloud Operations", parentHref: "/admin/integrations/paycloud" },
  "control-plane/integrations": { label: "Integrations Hub", parentHref: "/admin/control-plane/overview" },
  "control-plane/integrations/didit": { label: "Didit (KYC)", parentHref: "/admin/control-plane/integrations" },
  "control-plane/integrations/gemini": { label: "Gemini (AI)", parentHref: "/admin/control-plane/integrations" },
  "control-plane/integrations/aura": { label: "Aura", parentHref: "/admin/control-plane/integrations" },
  "control-plane/integrations/wasender": { label: "Wasender", parentHref: "/admin/control-plane/integrations" },

  // Platform & Access
  settings: { label: "Settings", parentHref: null },
  "settings/feature-flags": { label: "Feature Flags", parentHref: "/admin/settings" },
  "settings/app-version": { label: "App Version", parentHref: "/admin/settings" },
  "settings/custom-fields": { label: "Custom Fields", parentHref: "/admin/settings" },
  "settings/referrals": { label: "Referral Settings", parentHref: "/admin/settings" },
  "settings/admin-team": { label: "Admin Team", parentHref: "/admin/settings" },
  "settings/team-permissions": { label: "Roles & Permissions", parentHref: "/admin/settings" },
  "settings/tenants": { label: "Markets", parentHref: "/admin/settings" },
  "settings/tenant-domains": { label: "Tenant Domains", parentHref: "/admin/settings" },
  security: { label: "Security Policy", parentHref: null },
  "system-health": { label: "Platform Health", parentHref: null },
  monitoring: { label: "Platform Health", parentHref: null },

  // Control Plane (Platform Advanced)
  "control-plane/overview": { label: "Platform Advanced", parentHref: null },
  "control-plane/feature-flags": { label: "Feature Flags (Environment)", parentHref: "/admin/control-plane/overview" },
  "control-plane/audit-log": { label: "Config Change Log", parentHref: "/admin/audit-logs" },
  "control-plane/compliance": { label: "Compliance Purge", parentHref: "/admin/settings" },
  "control-plane/tenant-reset": { label: "Tenant Reset", parentHref: "/admin/settings" },
  "control-plane/maintenance": { label: "Maintenance", parentHref: "/admin/control-plane/overview" },
  "control-plane/maintenance/sign-ups": { label: "Sign-up Maintenance", parentHref: "/admin/control-plane/maintenance" },
  "control-plane/modules/distance": { label: "Distance Module", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/on-demand": { label: "On-Demand Module", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/safety": { label: "Safety Module", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/ranking": { label: "Ranking Module", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/ranking/scores": { label: "Ranking Scores", parentHref: "/admin/control-plane/modules/ranking" },
  "control-plane/modules/ai": { label: "AI Module", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/agents": { label: "Agentic Console", parentHref: "/admin/control-plane/overview" },
  "control-plane/modules/ai/usage": { label: "AI Usage", parentHref: "/admin/control-plane/modules/ai" },
  "control-plane/modules/ai/entitlements": { label: "AI Entitlements", parentHref: "/admin/control-plane/modules/ai" },
  "control-plane/modules/ai/templates": { label: "AI Templates", parentHref: "/admin/control-plane/modules/ai" },
  "control-plane/modules/ads": { label: "Ads Module", parentHref: "/admin/control-plane/overview" },
};

/**
 * UUID-like segment test — replaces dynamic route segments with `[id]` so
 * they match the pattern keys in BREADCRUMB_MAP.
 */
const DYNAMIC_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-zA-Z0-9_-]{20,}$/i;

export function normalisePath(path: string): string {
  return (
    path
      // Strip the /admin/ prefix whether the router provides a full absolute
      // path (/admin/bookings/…) or a basename-relative path (/bookings/…).
      // React Router with `basename="/admin"` returns the latter from
      // useLocation().pathname.
      .replace(/^\/admin\//, "")
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/")
      .filter(Boolean)
      .map((seg) => (DYNAMIC_SEGMENT_RE.test(seg) ? "[id]" : seg))
      .join("/")
  );
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Returns the ordered breadcrumb trail for a given absolute pathname
 * (e.g. `/admin/providers/abc-123`).
 *
 * The trail excludes "Home" since the sidebar always shows context; it starts
 * from the deepest named parent and ends at the current page.
 *
 * @param pathname - `window.location.pathname` or `useLocation().pathname`
 * @param leafLabelOverride - Optional label override for the last segment
 *   (set by detail pages once they know the entity name).
 */
export function breadcrumbsForPath(pathname: string, leafLabelOverride?: string): Crumb[] {
  const normalised = normalisePath(pathname);
  const entry = BREADCRUMB_MAP[normalised];
  if (!entry) return [];

  const crumbs: Crumb[] = [];

  // Walk parent chain
  let parentHref = entry.parentHref;
  const visited = new Set<string>();
  while (parentHref) {
    if (visited.has(parentHref)) break;
    visited.add(parentHref);
    const parentNorm = normalisePath(parentHref);
    const parentEntry = BREADCRUMB_MAP[parentNorm];
    if (parentEntry) {
      crumbs.unshift({ label: parentEntry.label, href: parentHref });
      parentHref = parentEntry.parentHref;
    } else {
      break;
    }
  }

  // Add leaf
  crumbs.push({
    label: leafLabelOverride ?? entry.label,
    href: pathname,
  });

  return crumbs;
}
