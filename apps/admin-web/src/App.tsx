/**
 * Admin SPA routes must cover every sidebar `href` in `src/config/nav.ts`
 * (use the path after `/admin/`; add `<Navigate />` aliases for legacy URLs).
 * Unmatched paths render `AdminNotFoundPage`.
 */
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminChrome } from "@/components/layout/AdminChrome";
import { LoginPage } from "@/routes/LoginPage";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import * as P from "@/lazyAdminPages";

/** Full path under the site, e.g. `/admin/dashboard` (for `next=` parity with `proxy.ts`). */
function adminFullPath(pathname: string, search: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `/admin${p === "/" ? "" : p}${search}`;
}

function RequireAuth() {
  const { isLoading, isError, errorStatus, bootstrap, refetchBootstrap } = useAdminSession();
  const location = useLocation();
  const nextParam = encodeURIComponent(adminFullPath(location.pathname, location.search));

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-gray-600">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-gray-200 border-t-gray-800"
          role="status"
          aria-label="Loading admin session"
        />
        <p className="text-sm text-gray-500">Verifying session…</p>
      </div>
    );
  }

  if (isError && errorStatus === 403) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <PermissionDenied message="Your account is signed in but does not have administrator access. If you believe this is a mistake, contact your team lead." />
      </div>
    );
  }

  if (isError && errorStatus === 401) {
    return <Navigate to={`/login?next=${nextParam}`} replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center text-gray-700">
        <p className="text-sm">We could not verify your admin session.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
            onClick={() => void refetchBootstrap()}
          >
            Retry
          </button>
          <Link
            to={`/login?next=${nextParam}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  if (!bootstrap) {
    return <Navigate to={`/login?next=${nextParam}`} replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AdminChrome />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<P.DashboardPage />} />
          <Route path="analytics" element={<P.AnalyticsPage />} />
          <Route path="gods-eye" element={<P.GodsEyePage />} />
          <Route path="reports" element={<P.ReportsHubPage />} />
          <Route path="reports/:reportKey" element={<P.ReportDetailPage />} />
          <Route path="support-tickets" element={<P.SupportTicketsPage />} />
          <Route path="support-tickets/:id" element={<P.SupportTicketDetailPage />} />
          <Route path="bookings" element={<P.BookingsPage />} />
          <Route path="bookings/:id" element={<P.BookingDetailPage />} />
          <Route path="disputes" element={<P.DisputesPage />} />
          <Route path="providers/distance-settings" element={<P.ProviderDistanceSettingsPage />} />
          <Route path="providers/:id" element={<P.ProviderDetailPage />} />
          <Route path="providers" element={<P.ProvidersListPage />} />
          <Route path="staff" element={<P.StaffListPage />} />
          <Route path="reviews" element={<P.ReviewsListPage />} />
          <Route path="user-reports" element={<P.UserReportsListPage />} />
          <Route path="refunds" element={<P.RefundsListPage />} />
          <Route path="finance" element={<P.FinanceOverviewPage />} />
          <Route path="payouts" element={<P.PayoutsPage />} />
          <Route path="fees" element={<P.FeesConfigsPage />} />
          <Route path="billing" element={<P.BillingPage />} />
          <Route path="taxes" element={<P.TaxesPage />} />
          <Route path="provider-subscriptions" element={<P.ProviderSubscriptionsPage />} />
          <Route path="subscription-revenue" element={<P.SubscriptionMetricsPage />} />
          <Route path="plans" element={<P.PlansListPage />} />
          <Route path="pricing-plans" element={<Navigate to="../plans" replace />} />
          <Route path="subscription-plans" element={<Navigate to="../plans" replace />} />
          <Route path="settings/platform-fees" element={<P.PlatformFeesPage />} />
          <Route path="users/:id" element={<P.UserDetailPage />} />
          <Route path="users" element={<P.UsersListPage />} />
          <Route path="verifications/:id" element={<P.VerificationDetailPage />} />
          <Route path="verifications" element={<P.VerificationsListPage />} />
          <Route path="audit-logs" element={<P.AuditLogsPage />} />
          <Route path="ecommerce/orders/:id" element={<P.ProductOrderDetailPage />} />
          <Route path="ecommerce/orders" element={<P.ProductOrdersPage />} />
          <Route path="ecommerce/returns" element={<P.ProductReturnsPage />} />
          <Route path="ecommerce/products" element={<P.ProductCatalogPage />} />
          <Route path="ecommerce" element={<P.EcommerceOverviewPage />} />
          <Route path="addons" element={<P.AddonsListPage />} />
          <Route path="webhooks" element={<P.WebhooksEndpointsPage />} />
          <Route path="api-keys" element={<P.ApiKeysListPage />} />
          <Route path="integrations/amplitude" element={<P.AmplitudeConfigPage />} />
          <Route path="mapbox" element={<P.MapboxConfigPage />} />
          <Route path="iso-codes" element={<P.IsoCodesPage />} />
          <Route path="promotions" element={<P.PromotionsListPage />} />
          <Route path="gift-cards/:id" element={<P.GiftCardDetailPage />} />
          <Route path="gift-cards" element={<P.GiftCardsListPage />} />
          <Route path="loyalty" element={<P.LoyaltyRulesPage />} />
          <Route path="gamification/point-rules" element={<P.GamificationPointRulesPage />} />
          <Route path="gamification/badges" element={<P.GamificationBadgesPage />} />
          <Route path="gamification/operations" element={<P.GamificationOperationsPage />} />
          <Route path="notifications" element={<P.NotificationsConfigPage />} />
          <Route path="broadcast/history" element={<P.BroadcastHistoryPage />} />
          <Route path="broadcast/compose" element={<P.BroadcastComposePage />} />
          <Route path="broadcast" element={<P.BroadcastHubPage />} />
          <Route path="automations" element={<P.AutomationsListPage />} />
          <Route path="notification-templates" element={<P.NotificationTemplatesListPage />} />
          <Route path="system-health" element={<P.SystemHealthPage />} />
          <Route path="monitoring" element={<P.MonitoringHealthPage />} />
          <Route path="security" element={<P.SecurityPolicyPage />} />
          <Route path="service-zones" element={<P.ServiceZonesListPage />} />
          <Route path="settings" element={<P.GeneralSettingsPage />} />
          <Route path="settings/app-version" element={<P.AppVersionSettingsPage />} />
          <Route path="settings/feature-flags" element={<P.FeatureFlagsListPage />} />
          <Route path="settings/custom-fields" element={<P.CustomFieldsListPage />} />
          <Route path="custom-fields" element={<Navigate to="../settings/custom-fields" replace />} />
          <Route path="settings/referrals" element={<P.ReferralsSettingsPage />} />
          <Route path="referral-sources" element={<P.ReferralSourcesPage />} />
          <Route path="settings/tenant-domains" element={<P.TenantDomainsListPage />} />
          <Route path="settings/team-permissions" element={<P.TeamPermissionsMatrixPage />} />
          <Route path="content/learning" element={<P.LearningArticlesPage />} />
          <Route path="content/resources" element={<P.ContentResourcesPage />} />
          <Route path="content" element={<P.ContentHubPage />} />
          <Route path="explore/:id" element={<P.ExplorePostDetailPage />} />
          <Route path="explore" element={<P.ExplorePostsPage />} />
          <Route path="catalog/global-categories" element={<P.GlobalCategoriesPage />} />
          <Route path="catalog" element={<P.CatalogServicesPage />} />
          <Route path="control-plane" element={<Outlet />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<P.ControlPlaneOverviewPage />} />
            <Route path="feature-flags" element={<P.CpFeatureFlagsPage />} />
            <Route path="integrations" element={<P.CpIntegrationsHubPage />} />
            <Route path="integrations/sumsub" element={<P.CpIntegrationSumsubPage />} />
            <Route path="integrations/gemini" element={<P.CpIntegrationGeminiPage />} />
            <Route path="integrations/aura" element={<P.CpIntegrationAuraPage />} />
            <Route path="modules/distance" element={<P.CpModuleDistancePage />} />
            <Route path="modules/on-demand" element={<P.CpModuleOnDemandPage />} />
            <Route path="modules/safety" element={<P.CpModuleSafetyPage />} />
            <Route path="modules/ranking/scores" element={<P.CpRankingScoresPage />} />
            <Route path="modules/ranking" element={<P.CpModuleRankingPage />} />
            <Route path="modules/ai/usage" element={<P.CpAiUsagePage />} />
            <Route path="modules/ai/entitlements" element={<P.CpAiEntitlementsPage />} />
            <Route path="modules/ai/templates" element={<P.CpAiTemplatesPage />} />
            <Route path="modules/ai" element={<P.CpModuleAiPage />} />
            <Route path="modules/ads" element={<P.CpModuleAdsPage />} />
            <Route path="safety-logs" element={<P.CpSafetyLogsPage />} />
            <Route path="maintenance/sign-ups" element={<P.CpMaintenanceSignupsPage />} />
            <Route path="maintenance" element={<P.CpMaintenancePage />} />
            <Route path="audit-log" element={<P.CpAuditLogPage />} />
            <Route path="*" element={<P.AdminNotFoundPage />} />
          </Route>
          <Route path="sms-templates" element={<Navigate to="../notification-templates" replace />} />
          <Route path="email-templates" element={<Navigate to="../notification-templates" replace />} />
          <Route
            path="settings/integrations/analytics"
            element={<Navigate to="../../../integrations/amplitude" replace />}
          />
          <Route path="*" element={<P.AdminNotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
