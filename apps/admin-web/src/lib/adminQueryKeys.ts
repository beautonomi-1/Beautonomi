/**
 * TanStack Query key factories — **always** prefix with `["admin", …]` so invalidation
 * and defaults can target the admin subtree (`queryKey: ["admin"]`).
 */
export const adminQueryKeys = {
  root: ["admin"] as const,

  bootstrap: () => [...adminQueryKeys.root, "bootstrap"] as const,
  sectionPermissions: () => [...adminQueryKeys.root, "section-permissions"] as const,
  navCounts: () => [...adminQueryKeys.root, "nav-counts"] as const,
  tenants: () => [...adminQueryKeys.root, "tenants"] as const,
  activity: () => [...adminQueryKeys.root, "activity"] as const,

  /** Superadmin safety incidents list (GET /api/admin/safety/logs). */
  safetyLogs: (signature: string) => [...adminQueryKeys.root, "safety-logs", signature] as const,

  dashboard: () => [...adminQueryKeys.root, "dashboard"] as const,
  /** Superadmin tenant-scoped acquisition & migration analytics (GET /api/admin/dashboard/marketing-insights). */
  dashboardMarketingInsights: () => [...adminQueryKeys.root, "dashboard", "marketing-insights"] as const,

  analytics: (period: string) => [...adminQueryKeys.root, "analytics", period] as const,

  godsEye: () => [...adminQueryKeys.root, "gods-eye"] as const,

  bookings: {
    all: () => [...adminQueryKeys.root, "bookings"] as const,
    list: (filters: { statusFilter: string; dateFilter: string; page?: number }) =>
      [...adminQueryKeys.bookings.all(), "list", filters] as const,
    detail: (id: string) => [...adminQueryKeys.bookings.all(), "detail", id] as const,
  },

  disputes: {
    all: () => [...adminQueryKeys.root, "disputes"] as const,
    list: (filters: { statusFilter: string; page?: number }) => [...adminQueryKeys.disputes.all(), "list", filters] as const,
  },

  supportTickets: {
    all: () => [...adminQueryKeys.root, "support-tickets"] as const,
    list: (queryString: string) => [...adminQueryKeys.supportTickets.all(), "list", queryString] as const,
  },

  providers: {
    all: () => [...adminQueryKeys.root, "providers"] as const,
    distanceList: () => [...adminQueryKeys.providers.all(), "distance-list"] as const,
    list: (q: string) => [...adminQueryKeys.providers.all(), "list", q] as const,
    detail: (id: string) => [...adminQueryKeys.providers.all(), "detail", id] as const,
    payoutAccounts: (providerId: string) =>
      [...adminQueryKeys.providers.all(), "payout-accounts", providerId] as const,
  },

  staff: (q: string) => [...adminQueryKeys.root, "staff", q] as const,

  reviews: (q: string) => [...adminQueryKeys.root, "reviews", q] as const,

  /** Provider→customer stars from `provider_client_ratings` (booking flow). */
  providerClientRatings: (page: number, limit: number) =>
    [...adminQueryKeys.root, "provider-client-ratings", page, limit] as const,

  userReports: (q: string) => [...adminQueryKeys.root, "user-reports", q] as const,

  refunds: (filters: { page: number; status: string }) => [...adminQueryKeys.root, "refunds", "list", filters] as const,

  supportTicketDetail: (id: string) => [...adminQueryKeys.root, "support-tickets", "detail", id] as const,

  supportTicketAssignees: () => [...adminQueryKeys.root, "support-ticket-assignees"] as const,

  userDetail: (id: string) => [...adminQueryKeys.root, "users", "detail", id] as const,

  userBookings: (id: string) => [...adminQueryKeys.root, "users", id, "bookings"] as const,

  userWalletTransactions: (id: string) => [...adminQueryKeys.root, "users", id, "wallet-transactions"] as const,

  userLoyalty: (id: string) => [...adminQueryKeys.root, "users", id, "loyalty"] as const,

  providerGamification: (id: string) => [...adminQueryKeys.root, "providers", id, "gamification"] as const,

  loyaltyRules: () => [...adminQueryKeys.root, "loyalty", "rules"] as const,

  loyaltyMilestones: () => [...adminQueryKeys.root, "loyalty", "milestones"] as const,

  giftCardDetail: (id: string) => [...adminQueryKeys.root, "gift-cards", "detail", id] as const,

  gamificationPointRules: () => [...adminQueryKeys.root, "gamification", "point-rules"] as const,

  gamificationBadges: (inc: string) => [...adminQueryKeys.root, "gamification", "badges", inc] as const,

  notificationTemplates: (q: string) => [...adminQueryKeys.root, "notification-templates", q] as const,

  notificationsConfig: () => [...adminQueryKeys.root, "notifications", "config"] as const,

  smsTemplates: (q: string) => [...adminQueryKeys.root, "sms-templates", q] as const,

  emailTemplates: (q: string) => [...adminQueryKeys.root, "email-templates", q] as const,

  automations: (q: string) => [...adminQueryKeys.root, "automations", q] as const,

  broadcastHistory: (q: string) => [...adminQueryKeys.root, "broadcast", "history", q] as const,

  mapboxConfig: () => [...adminQueryKeys.root, "mapbox", "config"] as const,

  serviceZones: (q: string) => [...adminQueryKeys.root, "service-zones", q] as const,

  serviceZoneDetail: (id: string) => [...adminQueryKeys.root, "service-zones", "detail", id] as const,

  serviceZoneRollout: (id: string) => [...adminQueryKeys.root, "service-zones", "rollout", id] as const,

  explorePosts: (q: string) => [...adminQueryKeys.root, "explore", "posts", q] as const,
  /** Invalidate every Explore list query regardless of URL filter string (TanStack prefix match). */
  explorePostsAll: () => [...adminQueryKeys.root, "explore", "posts"] as const,

  explorePostDetail: (id: string) => [...adminQueryKeys.root, "explore", "post", id] as const,

  catalogServices: (categoryId: string) => [...adminQueryKeys.root, "catalog", "services", categoryId] as const,

  learningArticles: (q: string) => [...adminQueryKeys.root, "learning", "articles", q] as const,
  /** Prefix-match invalidates all learning article list queries (any status filter). */
  learningArticlesAll: () => [...adminQueryKeys.root, "learning", "articles"] as const,

  addons: (q: string) => [...adminQueryKeys.root, "addons", q] as const,

  isoCodes: (tab: string) => [...adminQueryKeys.root, "iso-codes", tab] as const,

  finance: {
    all: () => [...adminQueryKeys.root, "finance"] as const,
    summary: (range: string) => [...adminQueryKeys.finance.all(), "summary", range] as const,
    transactions: (filters: { range: string; page: number; type: string; limit: number }) =>
      [...adminQueryKeys.finance.all(), "transactions", filters] as const,
    periodLocks: () => [...adminQueryKeys.finance.all(), "period-locks"] as const,
    walletReconciliation: () => [...adminQueryKeys.finance.all(), "wallet-reconciliation"] as const,
  },

  payouts: {
    all: () => [...adminQueryKeys.root, "payouts"] as const,
    list: (filters: { page: number; status: string }) => [...adminQueryKeys.payouts.all(), "list", filters] as const,
  },

  fees: {
    all: () => [...adminQueryKeys.root, "fees"] as const,
    configs: (q: string) => [...adminQueryKeys.fees.all(), "configs", q] as const,
    adjustmentsList: (filters: { page: number; limit: number }) =>
      [...adminQueryKeys.fees.all(), "adjustments", filters] as const,
    reconciliationsList: (filters: { page: number; limit: number }) =>
      [...adminQueryKeys.fees.all(), "reconciliations", filters] as const,
  },

  billing: {
    all: () => [...adminQueryKeys.root, "billing"] as const,
    invoices: (q: string) => [...adminQueryKeys.billing.all(), "invoices", q] as const,
  },

  taxes: () => [...adminQueryKeys.root, "taxes"] as const,

  platformFees: () => [...adminQueryKeys.root, "platform-fees"] as const,

  providerSubscriptions: (q: string) => [...adminQueryKeys.root, "provider-subscriptions", q] as const,

  subscriptionMetrics: (range: string) => [...adminQueryKeys.root, "subscription-metrics", range] as const,

  plans: () => [...adminQueryKeys.root, "plans"] as const,

  reports: {
    all: () => [...adminQueryKeys.root, "reports"] as const,
    detail: (slug: string, period: string) => [...adminQueryKeys.reports.all(), slug, period] as const,
  },

  users: {
    all: () => [...adminQueryKeys.root, "users"] as const,
    list: (q: string) => [...adminQueryKeys.users.all(), "list", q] as const,
  },

  verifications: (status: string) => [...adminQueryKeys.root, "verifications", status] as const,

  auditLogs: (q: string) => [...adminQueryKeys.root, "audit-logs", q] as const,

  productOrders: (q: string) => [...adminQueryKeys.root, "product-orders", q] as const,

  productOrderDetail: (id: string) => [...adminQueryKeys.root, "product-orders", "detail", id] as const,

  /** `periodKey` e.g. `all` or `2024-01-01|2024-01-31` for start/end query params */
  ecommerceOverview: (periodKey: string) => [...adminQueryKeys.root, "ecommerce", "overview", periodKey] as const,

  productReturns: (q: string) => [...adminQueryKeys.root, "product-returns", q] as const,

  productCatalog: (q: string) => [...adminQueryKeys.root, "product-catalog", q] as const,
  productCatalogDetail: (id: string) => [...adminQueryKeys.root, "product-catalog", "detail", id] as const,

  webhooks: () => [...adminQueryKeys.root, "webhooks", "endpoints"] as const,

  apiKeys: (q: string) => [...adminQueryKeys.root, "api-keys", q] as const,

  amplitude: (env: string) => [...adminQueryKeys.root, "amplitude", env] as const,

  paystackConfig: () => [...adminQueryKeys.root, "integrations", "paystack"] as const,

  promotions: () => [...adminQueryKeys.root, "promotions"] as const,

  giftCards: (q: string) => [...adminQueryKeys.root, "gift-cards", q] as const,

  systemHealth: (q: string) => [...adminQueryKeys.root, "system-health", q] as const,

  monitoringHealth: (hours: string) => [...adminQueryKeys.root, "monitoring-health", hours] as const,

  security: () => [...adminQueryKeys.root, "security"] as const,

  settings: () => [...adminQueryKeys.root, "settings", "platform"] as const,

  appVersion: () => [...adminQueryKeys.root, "app-version"] as const,

  featureFlags: () => [...adminQueryKeys.root, "feature-flags"] as const,

  customFields: (q: string) => [...adminQueryKeys.root, "custom-fields", q] as const,

  referrals: () => [...adminQueryKeys.root, "referrals"] as const,

  referralFaqs: () => [...adminQueryKeys.root, "referrals", "faqs"] as const,

  referralSources: (providerId: string) => [...adminQueryKeys.root, "referral-sources", providerId] as const,

  globalCategories: () => [...adminQueryKeys.root, "catalog", "global-categories"] as const,

  contentResources: () => [...adminQueryKeys.root, "content", "resources"] as const,

  contentFaqs: () => [...adminQueryKeys.root, "content", "faqs"] as const,

  contentAboutUs: () => [...adminQueryKeys.root, "content", "about-us"] as const,

  contentPages: () => [...adminQueryKeys.root, "content", "pages"] as const,

  contentFeaturedCities: () => [...adminQueryKeys.root, "content", "featured-cities"] as const,

  contentAppLinks: () => [...adminQueryKeys.root, "content", "app-links"] as const,

  verificationDetail: (id: string) => [...adminQueryKeys.root, "verifications", "detail", id] as const,

  tenantDomains: () => [...adminQueryKeys.root, "tenant-domains"] as const,

  ads: {
    all: () => [...adminQueryKeys.root, "ads"] as const,
    overview: () => [...adminQueryKeys.ads.all(), "overview"] as const,
    campaigns: (q: string) => [...adminQueryKeys.ads.all(), "campaigns", q] as const,
    campaignDetail: (id: string) => [...adminQueryKeys.ads.all(), "campaigns", "detail", id] as const,
  },

  analyticsGeo: () => [...adminQueryKeys.root, "analytics", "geo"] as const,

  providerOps: {
    all: () => [...adminQueryKeys.root, "provider-ops"] as const,
    dashboard: () => [...adminQueryKeys.providerOps.all(), "dashboard"] as const,
    leads: (q: string) => [...adminQueryKeys.providerOps.all(), "leads", q] as const,
    leadDetail: (id: string) => [...adminQueryKeys.providerOps.all(), "leads", "detail", id] as const,
    leadActivities: (id: string) => [...adminQueryKeys.providerOps.all(), "leads", id, "activities"] as const,
    pipelineStats: () => [...adminQueryKeys.providerOps.all(), "pipeline", "stats"] as const,
    tracker: (q: string) => [...adminQueryKeys.providerOps.all(), "tracker", q] as const,
    trackerStats: () => [...adminQueryKeys.providerOps.all(), "tracker", "stats"] as const,
    trackerDetail: (userId: string) => [...adminQueryKeys.providerOps.all(), "tracker", "detail", userId] as const,
    activationQueue: (q: string) => [...adminQueryKeys.providerOps.all(), "activation", q] as const,
    duplicates: () => [...adminQueryKeys.providerOps.all(), "duplicates"] as const,
    reportsFunnel: () => [...adminQueryKeys.providerOps.all(), "reports", "funnel"] as const,
    reportsDropoff: () => [...adminQueryKeys.providerOps.all(), "reports", "dropoff"] as const,
    settings: () => [...adminQueryKeys.providerOps.all(), "settings"] as const,
    categories: () => [...adminQueryKeys.providerOps.all(), "categories"] as const,
    providerLifecycle: (id: string) => [...adminQueryKeys.providerOps.all(), "provider", id, "lifecycle"] as const,
  },
  whatsapp: {
    all: () => [...adminQueryKeys.root, "whatsapp"] as const,
    sessions: () => [...adminQueryKeys.whatsapp.all(), "sessions"] as const,
    sessionDetail: (id: string) => [...adminQueryKeys.whatsapp.all(), "sessions", id] as const,
    templates: () => [...adminQueryKeys.whatsapp.all(), "templates"] as const,
    config: (env: string) => [...adminQueryKeys.whatsapp.all(), "config", env] as const,
    batches: () => [...adminQueryKeys.whatsapp.all(), "batches"] as const,
    batchDetail: (id: string) => [...adminQueryKeys.whatsapp.all(), "batches", id] as const,
    leadComms: (leadId: string) => [...adminQueryKeys.whatsapp.all(), "lead-comms", leadId] as const,
  },
} as const;
