/**
 * Primary customer account routes — prefetched once when AccountShell mounts
 * so navigations feel instant (same pattern as ProviderShell).
 */
export const CUSTOMER_PRIMARY_ROUTES = [
  "/account-settings",
  "/account-settings/personal-info",
  "/account-settings/identity-verification",
  "/account-settings/bookings",
  "/account-settings/orders",
  "/account-settings/returns",
  "/account-settings/wallet",
  "/account-settings/payments",
  "/account-settings/notifications",
  "/account-settings/addresses",
  "/account-settings/preferences",
  "/account-settings/messages",
  "/account-settings/wishlists",
  "/account-settings/wishlists/recently-viewed",
  "/account-settings/loyalty",
  "/account-settings/reviews",
] as const;

export type CustomerPrimaryRoute = (typeof CUSTOMER_PRIMARY_ROUTES)[number];

/** Quick-switcher chips (subset + hub) — order matches common tasks */
export const ACCOUNT_QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/account-settings", label: "Home" },
  { href: "/account-settings/personal-info", label: "Profile" },
  { href: "/account-settings/bookings", label: "Bookings" },
  { href: "/account-settings/orders", label: "Orders" },
  { href: "/account-settings/returns", label: "Returns" },
  { href: "/account-settings/wallet", label: "Wallet" },
  { href: "/account-settings/payments", label: "Payments" },
  { href: "/account-settings/notifications", label: "Alerts" },
  { href: "/account-settings/addresses", label: "Addresses" },
  { href: "/account-settings/preferences", label: "Prefs" },
  { href: "/account-settings/messages", label: "Messages" },
  { href: "/account-settings/wishlists", label: "Wishlists" },
  { href: "/account-settings/loyalty", label: "Loyalty" },
  { href: "/account-settings/reviews", label: "Reviews" },
];
