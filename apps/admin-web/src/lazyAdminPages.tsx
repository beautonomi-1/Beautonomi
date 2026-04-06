import { lazy } from "react";

/**
 * Route-level code splitting: each import becomes its own async chunk after login.
 * Keep **`LoginPage`** and **`AdminChrome`** eager (fast first paint for auth + shell).
 */
export const DashboardPage = lazy(() =>
  import("@/routes/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
export const AnalyticsPage = lazy(() =>
  import("@/routes/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage }))
);
export const GodsEyePage = lazy(() =>
  import("@/routes/GodsEyePage").then((m) => ({ default: m.GodsEyePage }))
);
export const ReportsHubPage = lazy(() =>
  import("@/routes/ReportsHubPage").then((m) => ({ default: m.ReportsHubPage }))
);
export const WavePlaceholderPage = lazy(() =>
  import("@/routes/WavePlaceholderPage").then((m) => ({ default: m.WavePlaceholderPage }))
);
export const BookingsPage = lazy(() =>
  import("@/routes/bookings/BookingsPage").then((m) => ({ default: m.BookingsPage }))
);
export const BookingDetailPage = lazy(() =>
  import("@/routes/bookings/BookingDetailPage").then((m) => ({ default: m.BookingDetailPage }))
);
export const DisputesPage = lazy(() =>
  import("@/routes/DisputesPage").then((m) => ({ default: m.DisputesPage }))
);
export const SupportTicketsPage = lazy(() =>
  import("@/routes/SupportTicketsPage").then((m) => ({ default: m.SupportTicketsPage }))
);
export const ProviderDistanceSettingsPage = lazy(() =>
  import("@/routes/ProviderDistanceSettingsPage").then((m) => ({ default: m.ProviderDistanceSettingsPage }))
);
export const FinanceOverviewPage = lazy(() =>
  import("@/routes/finance/FinanceOverviewPage").then((m) => ({ default: m.FinanceOverviewPage }))
);
export const PayoutsPage = lazy(() =>
  import("@/routes/finance/PayoutsPage").then((m) => ({ default: m.PayoutsPage }))
);
export const FeesConfigsPage = lazy(() =>
  import("@/routes/finance/FeesConfigsPage").then((m) => ({ default: m.FeesConfigsPage }))
);
export const BillingPage = lazy(() =>
  import("@/routes/finance/BillingPage").then((m) => ({ default: m.BillingPage }))
);
export const TaxesPage = lazy(() =>
  import("@/routes/finance/TaxesPage").then((m) => ({ default: m.TaxesPage }))
);
export const ProviderSubscriptionsPage = lazy(() =>
  import("@/routes/finance/ProviderSubscriptionsPage").then((m) => ({ default: m.ProviderSubscriptionsPage }))
);
export const SubscriptionMetricsPage = lazy(() =>
  import("@/routes/finance/SubscriptionMetricsPage").then((m) => ({ default: m.SubscriptionMetricsPage }))
);
export const PlansListPage = lazy(() =>
  import("@/routes/finance/PlansListPage").then((m) => ({ default: m.PlansListPage }))
);
export const PlatformFeesPage = lazy(() =>
  import("@/routes/settings/PlatformFeesPage").then((m) => ({ default: m.PlatformFeesPage }))
);
export const ReportDetailPage = lazy(() =>
  import("@/routes/reports/ReportDetailPage").then((m) => ({ default: m.ReportDetailPage }))
);
export const UsersListPage = lazy(() =>
  import("@/routes/users/UsersListPage").then((m) => ({ default: m.UsersListPage }))
);
export const VerificationsListPage = lazy(() =>
  import("@/routes/users/VerificationsListPage").then((m) => ({ default: m.VerificationsListPage }))
);
export const AuditLogsPage = lazy(() =>
  import("@/routes/users/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage }))
);
export const ProductOrdersPage = lazy(() =>
  import("@/routes/ecommerce/ProductOrdersPage").then((m) => ({ default: m.ProductOrdersPage }))
);
export const ProductReturnsPage = lazy(() =>
  import("@/routes/ecommerce/ProductReturnsPage").then((m) => ({ default: m.ProductReturnsPage }))
);
export const ProductCatalogPage = lazy(() =>
  import("@/routes/ecommerce/ProductCatalogPage").then((m) => ({ default: m.ProductCatalogPage }))
);
export const WebhooksEndpointsPage = lazy(() =>
  import("@/routes/integrations/WebhooksEndpointsPage").then((m) => ({ default: m.WebhooksEndpointsPage }))
);
export const ApiKeysListPage = lazy(() =>
  import("@/routes/integrations/ApiKeysListPage").then((m) => ({ default: m.ApiKeysListPage }))
);
export const AmplitudeConfigPage = lazy(() =>
  import("@/routes/integrations/AmplitudeConfigPage").then((m) => ({ default: m.AmplitudeConfigPage }))
);
export const PromotionsListPage = lazy(() =>
  import("@/routes/marketing/PromotionsListPage").then((m) => ({ default: m.PromotionsListPage }))
);
export const GiftCardsListPage = lazy(() =>
  import("@/routes/marketing/GiftCardsListPage").then((m) => ({ default: m.GiftCardsListPage }))
);
export const SystemHealthPage = lazy(() =>
  import("@/routes/ops/SystemHealthPage").then((m) => ({ default: m.SystemHealthPage }))
);
export const MonitoringHealthPage = lazy(() =>
  import("@/routes/ops/MonitoringHealthPage").then((m) => ({ default: m.MonitoringHealthPage }))
);
export const SecurityPolicyPage = lazy(() =>
  import("@/routes/ops/SecurityPolicyPage").then((m) => ({ default: m.SecurityPolicyPage }))
);
export const GeneralSettingsPage = lazy(() =>
  import("@/routes/settings/GeneralSettingsPage").then((m) => ({ default: m.GeneralSettingsPage }))
);
export const AppVersionSettingsPage = lazy(() =>
  import("@/routes/settings/AppVersionSettingsPage").then((m) => ({ default: m.AppVersionSettingsPage }))
);
export const FeatureFlagsListPage = lazy(() =>
  import("@/routes/settings/FeatureFlagsListPage").then((m) => ({ default: m.FeatureFlagsListPage }))
);
export const CustomFieldsListPage = lazy(() =>
  import("@/routes/settings/CustomFieldsListPage").then((m) => ({ default: m.CustomFieldsListPage }))
);
export const ReferralsSettingsPage = lazy(() =>
  import("@/routes/settings/ReferralsSettingsPage").then((m) => ({ default: m.ReferralsSettingsPage }))
);
export const TenantDomainsListPage = lazy(() =>
  import("@/routes/settings/TenantDomainsListPage").then((m) => ({ default: m.TenantDomainsListPage }))
);
export const TeamPermissionsMatrixPage = lazy(() =>
  import("@/routes/settings/TeamPermissionsMatrixPage").then((m) => ({ default: m.TeamPermissionsMatrixPage }))
);
export const ControlPlaneOverviewPage = lazy(() =>
  import("@/routes/control-plane/ControlPlaneOverviewPage").then((m) => ({ default: m.ControlPlaneOverviewPage }))
);
export const ControlPlaneDeepLegacyPage = lazy(() =>
  import("@/routes/control-plane/ControlPlaneDeepLegacyPage").then((m) => ({ default: m.ControlPlaneDeepLegacyPage }))
);
export const ProvidersListPage = lazy(() =>
  import("@/routes/providers/ProvidersListPage").then((m) => ({ default: m.ProvidersListPage }))
);
export const ProviderDetailPage = lazy(() =>
  import("@/routes/providers/ProviderDetailPage").then((m) => ({ default: m.ProviderDetailPage }))
);
export const StaffListPage = lazy(() =>
  import("@/routes/staff/StaffListPage").then((m) => ({ default: m.StaffListPage }))
);
export const ReviewsListPage = lazy(() =>
  import("@/routes/reviews/ReviewsListPage").then((m) => ({ default: m.ReviewsListPage }))
);
export const UserReportsListPage = lazy(() =>
  import("@/routes/trust/UserReportsListPage").then((m) => ({ default: m.UserReportsListPage }))
);
export const RefundsListPage = lazy(() =>
  import("@/routes/refunds/RefundsListPage").then((m) => ({ default: m.RefundsListPage }))
);
export const SupportTicketDetailPage = lazy(() =>
  import("@/routes/support/SupportTicketDetailPage").then((m) => ({ default: m.SupportTicketDetailPage }))
);
export const UserDetailPage = lazy(() =>
  import("@/routes/users/UserDetailPage").then((m) => ({ default: m.UserDetailPage }))
);
export const LoyaltyRulesPage = lazy(() =>
  import("@/routes/marketing/LoyaltyRulesPage").then((m) => ({ default: m.LoyaltyRulesPage }))
);
export const GamificationPointRulesPage = lazy(() =>
  import("@/routes/marketing/GamificationPointRulesPage").then((m) => ({ default: m.GamificationPointRulesPage }))
);
export const GamificationBadgesPage = lazy(() =>
  import("@/routes/marketing/GamificationBadgesPage").then((m) => ({ default: m.GamificationBadgesPage }))
);
export const NotificationTemplatesListPage = lazy(() =>
  import("@/routes/marketing/NotificationTemplatesListPage").then((m) => ({
    default: m.NotificationTemplatesListPage,
  }))
);
export const NotificationsConfigPage = lazy(() =>
  import("@/routes/marketing/NotificationsConfigPage").then((m) => ({ default: m.NotificationsConfigPage }))
);
export const AutomationsListPage = lazy(() =>
  import("@/routes/marketing/AutomationsListPage").then((m) => ({ default: m.AutomationsListPage }))
);
export const BroadcastHubPage = lazy(() =>
  import("@/routes/marketing/BroadcastHubPage").then((m) => ({ default: m.BroadcastHubPage }))
);
export const BroadcastHistoryPage = lazy(() =>
  import("@/routes/marketing/BroadcastHistoryPage").then((m) => ({ default: m.BroadcastHistoryPage }))
);
export const MapboxConfigPage = lazy(() =>
  import("@/routes/integrations/MapboxConfigPage").then((m) => ({ default: m.MapboxConfigPage }))
);
export const IsoCodesPage = lazy(() =>
  import("@/routes/integrations/IsoCodesPage").then((m) => ({ default: m.IsoCodesPage }))
);
export const ServiceZonesListPage = lazy(() =>
  import("@/routes/ops/ServiceZonesListPage").then((m) => ({ default: m.ServiceZonesListPage }))
);
export const ContentHubPage = lazy(() =>
  import("@/routes/content/ContentHubPage").then((m) => ({ default: m.ContentHubPage }))
);
export const LearningArticlesPage = lazy(() =>
  import("@/routes/content/LearningArticlesPage").then((m) => ({ default: m.LearningArticlesPage }))
);
export const ExplorePostsPage = lazy(() =>
  import("@/routes/content/ExplorePostsPage").then((m) => ({ default: m.ExplorePostsPage }))
);
export const CatalogServicesPage = lazy(() =>
  import("@/routes/content/CatalogServicesPage").then((m) => ({ default: m.CatalogServicesPage }))
);
export const AddonsListPage = lazy(() =>
  import("@/routes/ecommerce/AddonsListPage").then((m) => ({ default: m.AddonsListPage }))
);
