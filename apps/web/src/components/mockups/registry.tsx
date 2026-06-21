"use client";

import React from "react";
import { MOCKUP_CATALOG } from "@beautonomi/learning-mockups";
import {
  ProviderBookingsOverviewScreen,
  ProviderCalendarScreen,
  ProviderDashboardScreen,
  ProviderFinanceScreen,
  ProviderHouseCallsScreen,
  ProviderMessagesScreen,
  ProviderMoreScreen,
  ProviderPackagesScreen,
  ProviderServicesScreen,
} from "./screens/provider-mobile";
import {
  CustomerBookingsScreen,
  CustomerChatsScreen,
  CustomerHomeScreen,
  CustomerOnDemandScreen,
  CustomerProfileScreen,
  CustomerShopScreen,
  CustomerWalletScreen,
} from "./screens/customer-mobile";
import {
  CustomerWebAccountScreen,
  CustomerWebManageBookingsScreen,
  CustomerWebShopScreen,
} from "./screens/customer-web";
import {
  ProviderWebCalendarScreen,
  ProviderWebCatalogueScreen,
  ProviderWebClientsScreen,
  ProviderWebFinanceScreen,
  ProviderWebMarketingScreen,
  ProviderWebOrdersScreen,
  ProviderWebReportsScreen,
  ProviderWebSettingsScreen,
  ProviderWebTeamScreen,
} from "./screens/provider-web";
import { CustomerWebBookingScreen, ProviderWebDashboardScreen } from "./screens/web";

export type MockupRenderFn = () => React.ReactNode;

export const MOCKUP_REGISTRY: Record<string, MockupRenderFn> = {
  "provider-mobile-calendar": () => <ProviderCalendarScreen />,
  "provider-mobile-bookings-overview": () => <ProviderBookingsOverviewScreen />,
  "provider-mobile-services": () => <ProviderServicesScreen />,
  "provider-mobile-messages": () => <ProviderMessagesScreen />,
  "provider-mobile-house-calls": () => <ProviderHouseCallsScreen />,
  "provider-mobile-dashboard": () => <ProviderDashboardScreen />,
  "provider-mobile-finance": () => <ProviderFinanceScreen />,
  "provider-mobile-packages": () => <ProviderPackagesScreen />,
  "provider-mobile-more": () => <ProviderMoreScreen />,
  "customer-mobile-home": () => <CustomerHomeScreen />,
  "customer-mobile-bookings": () => <CustomerBookingsScreen />,
  "customer-mobile-chats": () => <CustomerChatsScreen />,
  "customer-mobile-shop": () => <CustomerShopScreen />,
  "customer-mobile-wallet": () => <CustomerWalletScreen />,
  "customer-mobile-profile": () => <CustomerProfileScreen />,
  "customer-mobile-on-demand": () => <CustomerOnDemandScreen />,
  "provider-web-dashboard": () => <ProviderWebDashboardScreen />,
  "provider-web-calendar": () => <ProviderWebCalendarScreen />,
  "provider-web-finance": () => <ProviderWebFinanceScreen />,
  "provider-web-orders": () => <ProviderWebOrdersScreen />,
  "provider-web-clients": () => <ProviderWebClientsScreen />,
  "provider-web-team": () => <ProviderWebTeamScreen />,
  "provider-web-reports": () => <ProviderWebReportsScreen />,
  "provider-web-catalogue": () => <ProviderWebCatalogueScreen />,
  "provider-web-settings": () => <ProviderWebSettingsScreen />,
  "provider-web-marketing": () => <ProviderWebMarketingScreen />,
  "customer-web-booking": () => <CustomerWebBookingScreen />,
  "customer-web-account": () => <CustomerWebAccountScreen />,
  "customer-web-shop": () => <CustomerWebShopScreen />,
  "customer-web-manage-bookings": () => <CustomerWebManageBookingsScreen />,
};

if (process.env.NODE_ENV !== "production") {
  for (const entry of MOCKUP_CATALOG) {
    if (!MOCKUP_REGISTRY[entry.id]) {
      console.warn(`[mockups] Missing registry entry for catalog id: ${entry.id}`);
    }
  }
}
