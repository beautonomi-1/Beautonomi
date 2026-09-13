"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import { settingsCategories } from "./settings-categories";

const TAB_LABEL_KEYS: Record<string, string> = {
  "appointment-activity": "web.provider.settings.tabs.appointmentActivity",
  clients: "web.provider.settings.tabs.clients",
  services: "web.provider.settings.tabs.services",
  sales: "web.provider.settings.tabs.sales",
  team: "web.provider.settings.tabs.team",
  "marketing-integrations": "web.provider.settings.tabs.marketing",
  account: "web.provider.settings.tabs.account",
};

export default function ProviderSettings() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalIntegrationsEnabled = useFeatureFlag("terminal_integrations_enabled");
  const terminalShopEnabled =
    useFeatureFlag("terminal_ecommerce_enabled") || useFeatureFlag("terminal_product_catalog_enabled");
  // Card machines hub requires PayCloud; Terminal Shop is a separate Settings entry.
  const cardMachinesHubVisible = paycloudEnabled;

  useEffect(() => {
    loadProviderInfo();
  }, []);

  const loadProviderInfo = async () => {
    try {
      // Try to get provider info from various possible endpoints
      try {
        const response = await fetcher.get<{ data: { business_type: string } }>(
          "/api/me/provider"
        );
        setBusinessType(response.data?.business_type || null);
      } catch {
        // Fallback: try to get from provider profile
        try {
          const response = await fetcher.get<{ data: { business_type: string } }>(
            "/api/provider/profile"
          );
          setBusinessType(response.data?.business_type || null);
        } catch (err) {
          console.error("Could not load provider info:", err);
        }
      }
    } catch (error) {
      console.error("Error loading provider info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("web.provider.settings.pageTitle")}
        subtitle={t("web.provider.settings.pageSubtitle")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings") },
        ]}
      />

      {/* Upgrade Banner for Freelancers */}
      {!isLoading && businessType === "freelancer" && (
        <Alert className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary-hover/5">
          <Sparkles className="w-4 h-4 text-primary" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <span className="font-medium text-primary">
                {t("web.provider.settings.upgradeBannerTitle")}
              </span>
              <span className="text-gray-700 ms-2">
                {t("web.provider.settings.upgradeBannerBody")}
              </span>
            </div>
            <Link href="/provider/settings/upgrade-to-salon">
              <button className="ms-4 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-md text-sm font-medium transition-colors">
                {t("web.provider.settings.upgradeNow")}
              </button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="appointment-activity" className="w-full max-w-full overflow-x-hidden">
        <div 
          className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="min-w-max sm:min-w-0">
            <TabsList className="inline-flex h-auto w-full sm:w-auto sm:grid sm:grid-cols-7 gap-1 sm:gap-2 bg-transparent p-0 sm:p-1.5 sm:bg-gray-100 rounded-none sm:rounded-xl border-b border-gray-200 sm:border-b-0 sm:border sm:border-gray-200">
              {Object.entries(TAB_LABEL_KEYS).map(([value, labelKey]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                {t(labelKey)}
              </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {settingsCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-6">
            <SectionCard>
              <h3 className="text-lg font-semibold mb-2">
                {t(`web.provider.settings.categories.${category.categoryKey}.title`)}
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {t(`web.provider.settings.categories.${category.categoryKey}.description`)}
              </p>
              <div className="space-y-2">
                {category.items
                  .filter((item) => {
                    if (!yocoEnabled && item.href.includes("/yoco")) {
                      return false;
                    }
                    if (!cardMachinesHubVisible && item.href.includes("/card-machines")) {
                      return false;
                    }
                    if (item.featureFlag === "payment_paycloud" && !paycloudEnabled) return false;
                    if (item.featureFlag === "payment_yoco" && !yocoEnabled) return false;
                    if (!paystackTerminalEnabled && item.href.includes("/paystack-terminal")) {
                      return false;
                    }
                    if (!terminalIntegrationsEnabled && item.href.includes("/terminal-integrations")) {
                      return false;
                    }
                    if (!terminalShopEnabled && item.href.includes("/terminal-shop")) {
                      return false;
                    }
                    // Only show upgrade option for freelancers
                    if (item.isUpgrade) {
                      return businessType === "freelancer";
                    }
                    if (item.staffOnly) {
                      return role === "provider_staff";
                    }
                    return true;
                  })
                  .map((item, index) => {
                    const isUpgrade = item.isUpgrade;
                    return (
                      <Link
                        key={index}
                        href={item.href}
                        className={`flex items-center justify-between p-4 border rounded-2xl transition-colors min-h-[44px] touch-manipulation ${
                          isUpgrade
                            ? "border-primary bg-gradient-to-r from-primary/5 to-primary-hover/5 hover:from-primary/10 hover:to-primary-hover/10"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isUpgrade && (
                            <Sparkles className="w-5 h-5 text-primary" />
                          )}
                          <div>
                            <h4
                              className={`font-medium ${
                                isUpgrade ? "text-primary" : ""
                              }`}
                            >
                              {t(
                                `web.provider.settings.categories.${category.categoryKey}.items.${item.itemKey}.title`,
                              )}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {t(
                                `web.provider.settings.categories.${category.categoryKey}.items.${item.itemKey}.description`,
                              )}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </Link>
                    );
                  })}
              </div>
            </SectionCard>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
