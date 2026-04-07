/**
 * Top critical admin workflows for regression guardrails.
 * Keep in sync with docs/platform/admin-spa/ADMIN_REGRESSION_GUARDRAILS.md.
 *
 * - **route smoke:** `appPath` must appear in `App.tsx` as a `<Route path="…" />`.
 * - **RBAC:** `public` = login only; `section` = must call `useAdminSectionPage`; `superadmin` = must call `useSuperadminPage`.
 */
export type CriticalFlowRbac = "public" | "section" | "superadmin";

export interface CriticalAdminFlow {
  id: string;
  description: string;
  /** Path under React Router basename `/admin` (no leading slash). */
  appPath: string;
  /** Page module under `src/` (for static file audits). */
  pageModule: string;
  rbac: CriticalFlowRbac;
}

export const CRITICAL_ADMIN_FLOWS: CriticalAdminFlow[] = [
  {
    id: "login",
    description: "Unauthenticated entry — session gate for entire SPA",
    appPath: "login",
    pageModule: "routes/LoginPage.tsx",
    rbac: "public",
  },
  {
    id: "dashboard",
    description: "Default landing — overview metrics and bootstrap sanity",
    appPath: "dashboard",
    pageModule: "routes/DashboardPage.tsx",
    rbac: "section",
  },
  {
    id: "bookings",
    description: "High-volume operations — list, filters, bulk/export",
    appPath: "bookings",
    pageModule: "routes/bookings/BookingsPage.tsx",
    rbac: "section",
  },
  {
    id: "providers",
    description: "Provider registry — trust and marketplace health",
    appPath: "providers",
    pageModule: "routes/providers/ProvidersListPage.tsx",
    rbac: "section",
  },
  {
    id: "support-tickets",
    description: "Support queue — SLA and customer issues",
    appPath: "support-tickets",
    pageModule: "routes/SupportTicketsPage.tsx",
    rbac: "section",
  },
  {
    id: "payouts",
    description: "Finance — money movement approvals",
    appPath: "payouts",
    pageModule: "routes/finance/PayoutsPage.tsx",
    rbac: "section",
  },
  {
    id: "users",
    description: "User directory — trust, fraud, account ops",
    appPath: "users",
    pageModule: "routes/users/UsersListPage.tsx",
    rbac: "section",
  },
  {
    id: "feature-flags",
    description: "Platform config — kill switches and experiments",
    appPath: "settings/feature-flags",
    pageModule: "routes/settings/FeatureFlagsListPage.tsx",
    rbac: "section",
  },
  {
    id: "gods-eye",
    description: "Superadmin cross-tenant overview",
    appPath: "gods-eye",
    pageModule: "routes/GodsEyePage.tsx",
    rbac: "superadmin",
  },
  {
    id: "analytics",
    description: "Superadmin platform analytics and series",
    appPath: "analytics",
    pageModule: "routes/AnalyticsPage.tsx",
    rbac: "superadmin",
  },
  {
    id: "audit-logs",
    description: "Compliance — immutable activity trail",
    appPath: "audit-logs",
    pageModule: "routes/users/AuditLogsPage.tsx",
    rbac: "section",
  },
  {
    id: "control-plane-overview",
    description: "Superadmin platform hub — integrations, modules, maintenance",
    appPath: "control-plane/overview",
    pageModule: "routes/control-plane/ControlPlaneOverviewPage.tsx",
    rbac: "superadmin",
  },
  {
    id: "broadcast-compose",
    description: "Marketing — push/SMS/email broadcast send",
    appPath: "broadcast/compose",
    pageModule: "routes/marketing/BroadcastComposePage.tsx",
    rbac: "section",
  },
  {
    id: "team-permissions",
    description: "Superadmin — section role matrix (PUT)",
    appPath: "settings/team-permissions",
    pageModule: "routes/settings/TeamPermissionsMatrixPage.tsx",
    rbac: "superadmin",
  },
  {
    id: "tenant-domains",
    description: "Superadmin — hostname → tenant registry (CRUD)",
    appPath: "settings/tenant-domains",
    pageModule: "routes/settings/TenantDomainsListPage.tsx",
    rbac: "superadmin",
  },
  {
    id: "service-zones",
    description: "Operations — platform market coverage / geometry (API: ADMIN_SECTION_OPERATIONS)",
    appPath: "service-zones",
    pageModule: "routes/ops/ServiceZonesListPage.tsx",
    rbac: "section",
  },
  {
    id: "referral-sources",
    description: "Per-provider referral sources (bookings attribution)",
    appPath: "referral-sources",
    pageModule: "routes/providers/ReferralSourcesPage.tsx",
    rbac: "section",
  },
  {
    id: "ecommerce-overview",
    description: "E-commerce tenant snapshot — orders, catalog, returns",
    appPath: "ecommerce",
    pageModule: "routes/ecommerce/EcommerceOverviewPage.tsx",
    rbac: "section",
  },
];
