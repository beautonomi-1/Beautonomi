export type MockupPlatform = "provider-mobile" | "customer-mobile" | "provider-web" | "customer-web";

export interface MockupCatalogEntry {
  id: string;
  label: string;
  platform: MockupPlatform;
  description?: string;
}

/** Single source of truth for learning-article mockup ids. */
export const MOCKUP_CATALOG: readonly MockupCatalogEntry[] = [
  // Provider mobile
  {
    id: "provider-mobile-calendar",
    label: "Provider — Bookings (day view)",
    platform: "provider-mobile",
    description: "Daily calendar with appointments and day/week toggle.",
  },
  {
    id: "provider-mobile-bookings-overview",
    label: "Provider — Bookings overview",
    platform: "provider-mobile",
    description: "Metrics cards and booking list overview.",
  },
  {
    id: "provider-mobile-services",
    label: "Provider — Services catalogue",
    platform: "provider-mobile",
    description: "Service list with pricing and categories.",
  },
  {
    id: "provider-mobile-messages",
    label: "Provider — Messages inbox",
    platform: "provider-mobile",
    description: "Conversations list and chat thread preview.",
  },
  {
    id: "provider-mobile-house-calls",
    label: "Provider — House call appointment",
    platform: "provider-mobile",
    description: "House call journey steps and navigation.",
  },
  {
    id: "provider-mobile-dashboard",
    label: "Provider — Dashboard",
    platform: "provider-mobile",
    description: "Operational summary and quick stats.",
  },
  {
    id: "provider-mobile-finance",
    label: "Provider — Finance & payouts",
    platform: "provider-mobile",
    description: "Balance, payout requests, Yoco, and bank accounts.",
  },
  {
    id: "provider-mobile-packages",
    label: "Provider — Packages & memberships",
    platform: "provider-mobile",
    description: "Customer packages and membership offers.",
  },
  {
    id: "provider-mobile-more",
    label: "Provider — More menu",
    platform: "provider-mobile",
    description: "Finance, settings, setup checklist, and support shortcuts.",
  },
  // Customer mobile
  {
    id: "customer-mobile-home",
    label: "Customer — Home discovery",
    platform: "customer-mobile",
    description: "Featured providers and browse entry points.",
  },
  {
    id: "customer-mobile-bookings",
    label: "Customer — Bookings list",
    platform: "customer-mobile",
    description: "Upcoming and past appointments.",
  },
  {
    id: "customer-mobile-chats",
    label: "Customer — Chats",
    platform: "customer-mobile",
    description: "Messages with providers.",
  },
  {
    id: "customer-mobile-shop",
    label: "Customer — Shop",
    platform: "customer-mobile",
    description: "Products and packages in the app.",
  },
  {
    id: "customer-mobile-wallet",
    label: "Customer — Wallet & rewards",
    platform: "customer-mobile",
    description: "Wallet balance, coupons, loyalty, and saved cards.",
  },
  {
    id: "customer-mobile-profile",
    label: "Customer — Profile & account",
    platform: "customer-mobile",
    description: "Account hub, addresses, notifications, and support.",
  },
  {
    id: "customer-mobile-on-demand",
    label: "Customer — On-demand request",
    platform: "customer-mobile",
    description: "Request a provider without choosing one; waiting and accept offer.",
  },
  // Provider web
  {
    id: "provider-web-dashboard",
    label: "Provider web — Dashboard",
    platform: "provider-web",
    description: "Provider portal dashboard with KPIs and schedule.",
  },
  {
    id: "provider-web-calendar",
    label: "Provider web — Calendar",
    platform: "provider-web",
    description: "Week calendar with appointments and status.",
  },
  {
    id: "provider-web-finance",
    label: "Provider web — Finance & payouts",
    platform: "provider-web",
    description: "Earnings KPIs, payout requests, and bank accounts.",
  },
  {
    id: "provider-web-orders",
    label: "Provider web — Product orders",
    platform: "provider-web",
    description: "E-commerce order tabs and fulfilment workflow.",
  },
  {
    id: "provider-web-clients",
    label: "Provider web — Clients (CRM)",
    platform: "provider-web",
    description: "Client list, profiles, and lifetime value.",
  },
  {
    id: "provider-web-team",
    label: "Provider web — Team & permissions",
    platform: "provider-web",
    description: "Staff roles, shifts, and access control.",
  },
  {
    id: "provider-web-reports",
    label: "Provider web — Reports & analytics",
    platform: "provider-web",
    description: "Revenue, bookings, and trend charts.",
  },
  {
    id: "provider-web-catalogue",
    label: "Provider web — Catalogue",
    platform: "provider-web",
    description: "Services, products, packages, and memberships.",
  },
  {
    id: "provider-web-settings",
    label: "Provider web — Settings hub",
    platform: "provider-web",
    description: "Yoco, booking links, locations, subscription, security.",
  },
  {
    id: "provider-web-marketing",
    label: "Provider web — Marketing",
    platform: "provider-web",
    description: "Campaigns, promo codes, and automations.",
  },
  // Customer web
  {
    id: "customer-web-booking",
    label: "Customer web — Booking flow",
    platform: "customer-web",
    description: "Service selection and checkout in the browser.",
  },
  {
    id: "customer-web-account",
    label: "Customer web — Account hub",
    platform: "customer-web",
    description: "Receipts, addresses, wallet, and support tickets.",
  },
  {
    id: "customer-web-shop",
    label: "Customer web — Shop",
    platform: "customer-web",
    description: "Products, packages, and gift cards on the web.",
  },
  {
    id: "customer-web-manage-bookings",
    label: "Customer web — Booking detail",
    platform: "customer-web",
    description: "Reschedule, pay, message, and review from booking detail.",
  },
] as const;

export const MOCKUP_IDS = new Set(MOCKUP_CATALOG.map((m) => m.id));

export function getMockupCatalogEntry(id: string): MockupCatalogEntry | undefined {
  return MOCKUP_CATALOG.find((m) => m.id === id);
}

export function mockupsByPlatform(platform: MockupPlatform): MockupCatalogEntry[] {
  return MOCKUP_CATALOG.filter((m) => m.platform === platform);
}
