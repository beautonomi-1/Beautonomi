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
export const AdminNotFoundPage = lazy(() =>
  import("@/routes/AdminNotFoundPage").then((m) => ({ default: m.AdminNotFoundPage }))
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
export const PeriodLocksPage = lazy(() =>
  import("@/routes/finance/PeriodLocksPage").then((m) => ({ default: m.PeriodLocksPage }))
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
export const WalletReconciliationPage = lazy(() =>
  import("@/routes/finance/WalletReconciliationPage").then((m) => ({ default: m.WalletReconciliationPage }))
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
export const VerificationDetailPage = lazy(() =>
  import("@/routes/users/VerificationDetailPage").then((m) => ({ default: m.VerificationDetailPage }))
);
export const AuditLogsPage = lazy(() =>
  import("@/routes/users/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage }))
);
export const EcommerceOverviewPage = lazy(() =>
  import("@/routes/ecommerce/EcommerceOverviewPage").then((m) => ({ default: m.EcommerceOverviewPage }))
);
export const ProductOrdersPage = lazy(() =>
  import("@/routes/ecommerce/ProductOrdersPage").then((m) => ({ default: m.ProductOrdersPage }))
);
export const ProductOrderDetailPage = lazy(() =>
  import("@/routes/ecommerce/ProductOrderDetailPage").then((m) => ({ default: m.ProductOrderDetailPage }))
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
export const PaystackConfigPage = lazy(() =>
  import("@/routes/integrations/PaystackConfigPage").then((m) => ({ default: m.PaystackConfigPage }))
);
export const PromotionsListPage = lazy(() =>
  import("@/routes/marketing/PromotionsListPage").then((m) => ({ default: m.PromotionsListPage }))
);
export const GiftCardsListPage = lazy(() =>
  import("@/routes/marketing/GiftCardsListPage").then((m) => ({ default: m.GiftCardsListPage }))
);
export const GiftCardDetailPage = lazy(() =>
  import("@/routes/marketing/GiftCardDetailPage").then((m) => ({ default: m.GiftCardDetailPage }))
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
export const TenantsListPage = lazy(() =>
  import("@/routes/settings/TenantsListPage").then((m) => ({ default: m.TenantsListPage }))
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
export const CpFeatureFlagsPage = lazy(() =>
  import("@/routes/control-plane/CpFeatureFlagsPage").then((m) => ({ default: m.CpFeatureFlagsPage }))
);
export const CpIntegrationsHubPage = lazy(() =>
  import("@/routes/control-plane/CpIntegrationsHubPage").then((m) => ({ default: m.CpIntegrationsHubPage }))
);
export const CpIntegrationSumsubPage = lazy(() =>
  import("@/routes/control-plane/CpIntegrationSumsubPage").then((m) => ({ default: m.CpIntegrationSumsubPage }))
);
export const CpIntegrationGeminiPage = lazy(() =>
  import("@/routes/control-plane/CpIntegrationGeminiPage").then((m) => ({ default: m.CpIntegrationGeminiPage }))
);
export const CpIntegrationAuraPage = lazy(() =>
  import("@/routes/control-plane/CpIntegrationAuraPage").then((m) => ({ default: m.CpIntegrationAuraPage }))
);
export const CpModuleDistancePage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleDistancePage }))
);
export const CpModuleOnDemandPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleOnDemandPage }))
);
export const CpModuleSafetyPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleSafetyPage }))
);
export const CpModuleRankingPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleRankingPage }))
);
export const CpModuleAiPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleAiPage }))
);
export const CpModuleAdsPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneModules").then((m) => ({ default: m.CpModuleAdsPage }))
);
export const CpSafetyLogsPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpSafetyLogsPage }))
);
export const CpAuditLogPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpAuditLogPage }))
);
export const CompliancePurgePage = lazy(() =>
  import("@/routes/control-plane/CompliancePurgePage").then((m) => ({ default: m.CompliancePurgePage }))
);
export const CpMaintenancePage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpMaintenancePage }))
);
export const CpMaintenanceSignupsPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpMaintenanceSignupsPage }))
);
export const CpAiUsagePage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpAiUsagePage }))
);
export const CpAiEntitlementsPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpAiEntitlementsPage }))
);
export const CpRankingScoresPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpRankingScoresPage }))
);
export const CpAiTemplatesPage = lazy(() =>
  import("@/routes/control-plane/CpControlPlaneOps").then((m) => ({ default: m.CpAiTemplatesPage }))
);
export const BroadcastComposePage = lazy(() =>
  import("@/routes/marketing/BroadcastComposePage").then((m) => ({ default: m.BroadcastComposePage }))
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
export const GamificationOperationsPage = lazy(() =>
  import("@/routes/marketing/GamificationOperationsPage").then((m) => ({ default: m.GamificationOperationsPage }))
);
export const NotificationTemplatesListPage = lazy(() =>
  import("@/routes/marketing/NotificationTemplatesListPage").then((m) => ({
    default: m.NotificationTemplatesListPage,
  }))
);
export const NotificationsConfigPage = lazy(() =>
  import("@/routes/marketing/NotificationsConfigPage").then((m) => ({ default: m.NotificationsConfigPage }))
);
export const SmsTemplatesListPage = lazy(() =>
  import("@/routes/marketing/SmsTemplatesListPage").then((m) => ({ default: m.SmsTemplatesListPage }))
);
export const EmailTemplatesListPage = lazy(() =>
  import("@/routes/marketing/EmailTemplatesListPage").then((m) => ({ default: m.EmailTemplatesListPage }))
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
export const ServiceZoneDetailPage = lazy(() =>
  import("@/routes/ops/ServiceZoneDetailPage").then((m) => ({ default: m.ServiceZoneDetailPage }))
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
export const ExplorePostDetailPage = lazy(() =>
  import("@/routes/content/ExplorePostDetailPage").then((m) => ({ default: m.ExplorePostDetailPage }))
);
export const CatalogServicesPage = lazy(() =>
  import("@/routes/content/CatalogServicesPage").then((m) => ({ default: m.CatalogServicesPage }))
);
export const GlobalCategoriesPage = lazy(() =>
  import("@/routes/catalog/GlobalCategoriesPage").then((m) => ({ default: m.GlobalCategoriesPage }))
);
export const ContentResourcesPage = lazy(() =>
  import("@/routes/content/ContentResourcesPage").then((m) => ({ default: m.ContentResourcesPage }))
);
export const ContentFaqsPage = lazy(() =>
  import("@/routes/content/ContentFaqsPage").then((m) => ({ default: m.ContentFaqsPage }))
);
export const ContentAboutUsPage = lazy(() =>
  import("@/routes/content/ContentAboutUsPage").then((m) => ({ default: m.ContentAboutUsPage }))
);
export const ContentPagesPage = lazy(() =>
  import("@/routes/content/ContentPagesPage").then((m) => ({ default: m.ContentPagesPage }))
);
export const ContentFeaturedCitiesPage = lazy(() =>
  import("@/routes/content/ContentFeaturedCitiesPage").then((m) => ({ default: m.ContentFeaturedCitiesPage }))
);
export const ContentAppLinksPage = lazy(() =>
  import("@/routes/content/ContentAppLinksPage").then((m) => ({ default: m.ContentAppLinksPage }))
);
export const ReferralSourcesPage = lazy(() =>
  import("@/routes/providers/ReferralSourcesPage").then((m) => ({ default: m.ReferralSourcesPage }))
);
export const AddonsListPage = lazy(() =>
  import("@/routes/ecommerce/AddonsListPage").then((m) => ({ default: m.AddonsListPage }))
);
export const AdminTeamPage = lazy(() =>
  import("@/routes/settings/AdminTeamPage").then((m) => ({ default: m.AdminTeamPage }))
);

export const AdsListPage = lazy(() =>
  import("@/routes/marketing/AdsListPage").then((m) => ({ default: m.AdsListPage }))
);
export const AdsCampaignDetailPage = lazy(() =>
  import("@/routes/marketing/AdsCampaignDetailPage").then((m) => ({ default: m.AdsCampaignDetailPage }))
);
export const AnalyticsGeoPage = lazy(() =>
  import("@/routes/AnalyticsGeoPage").then((m) => ({ default: m.AnalyticsGeoPage }))
);
export const ProviderOpsDashboardPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsDashboardPage").then((m) => ({ default: m.ProviderOpsDashboardPage }))
);
export const ProviderOpsLeadsPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsLeadsPage").then((m) => ({ default: m.ProviderOpsLeadsPage }))
);
export const ProviderOpsLeadDetailPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsLeadDetailPage").then((m) => ({ default: m.ProviderOpsLeadDetailPage }))
);
export const ProviderOpsLeadNewPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsLeadNewPage").then((m) => ({ default: m.ProviderOpsLeadNewPage }))
);
export const ProviderOpsTrackerPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsTrackerPage").then((m) => ({ default: m.ProviderOpsTrackerPage }))
);
export const ProviderOpsTrackerDetailPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsTrackerDetailPage").then((m) => ({ default: m.ProviderOpsTrackerDetailPage }))
);
export const ProviderOpsPipelinePage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsPipelinePage").then((m) => ({ default: m.ProviderOpsPipelinePage }))
);
export const ProviderOpsDuplicatesPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsDuplicatesPage").then((m) => ({ default: m.ProviderOpsDuplicatesPage }))
);
export const ProviderOpsActivationPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsActivationPage").then((m) => ({ default: m.ProviderOpsActivationPage }))
);
export const ProviderOpsReportsPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsReportsPage").then((m) => ({ default: m.ProviderOpsReportsPage }))
);
export const ProviderOpsSettingsPage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsSettingsPage").then((m) => ({ default: m.ProviderOpsSettingsPage }))
);
export const ProviderOpsLifecyclePage = lazy(() =>
  import("@/routes/provider-ops/ProviderOpsLifecyclePage").then((m) => ({ default: m.ProviderOpsLifecyclePage }))
);
export const WhatsAppSessionsPage = lazy(() =>
  import("@/routes/whatsapp/WhatsAppSessionsPage").then((m) => ({ default: m.WhatsAppSessionsPage }))
);
export const WhatsAppTemplatesPage = lazy(() =>
  import("@/routes/whatsapp/WhatsAppTemplatesPage").then((m) => ({ default: m.WhatsAppTemplatesPage }))
);
export const WhatsAppBatchDetailPage = lazy(() =>
  import("@/routes/whatsapp/WhatsAppBatchDetailPage").then((m) => ({ default: m.WhatsAppBatchDetailPage }))
);
export const CpIntegrationWasenderPage = lazy(() =>
  import("@/routes/control-plane/CpIntegrationWasenderPage").then((m) => ({ default: m.CpIntegrationWasenderPage }))
);
