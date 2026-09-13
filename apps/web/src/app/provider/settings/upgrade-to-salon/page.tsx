"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, CheckCircle2, Users, MapPin, Calendar, DollarSign } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface ProviderInfo {
  business_type: string;
  capabilities?: any;
}

export default function UpgradeToSalonPage() {
  const { t } = useTranslation();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProviderInfo();
  }, []);

  const loadProviderInfo = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: ProviderInfo }>("/api/me/provider");
      if (response.data) {
        setProviderInfo(response.data);
      }
    } catch (error) {
      console.error("Error loading provider info:", error);
      // If endpoint doesn't exist, try alternative
      try {
        const altResponse = await fetcher.get<{ data: ProviderInfo }>("/api/provider/profile");
        if (altResponse.data) {
          setProviderInfo(altResponse.data);
        }
      } catch (altError) {
        console.error("Alternative endpoint also failed:", altError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setIsUpgrading(true);
      const response = await fetcher.post<{
        data: { upgraded: boolean; message: string };
      }>("/api/provider/upgrade-to-salon");
      
      toast.success(response.data.message || t("web.provider.settings.pages.upgrade-to-salon.successFallback"));
      setShowConfirmDialog(false);
      
      // Reload provider info
      await loadProviderInfo();
      
      // Show success message and redirect after delay
      setTimeout(() => {
        window.location.href = "/provider/settings";
      }, 2000);
    } catch (error: any) {
      console.error("Upgrade error:", error);
      toast.error(error.message || t("web.provider.settings.pages.upgrade-to-salon.failedFallback"));
    } finally {
      setIsUpgrading(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout 
        title={t("web.provider.settings.categories.appointmentActivity.items.upgradeToSalon.title")} 
        subtitle={t("common.loading")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon") }
        ]}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.upgrade-to-salon.loadingProviderInformation")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  // Check if already a salon
  if (providerInfo?.business_type === "salon") {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.upgradeToSalon.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon") }
        ]}
      >
        <SectionCard>
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
{t("web.provider.settings.pages.upgrade-to-salon.alreadySalonBody")}
            </AlertDescription>
          </Alert>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon")}
      subtitle={t("web.provider.settings.pages.upgrade-to-salon.convertYourFreelancerAccountToA")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon") }
      ]}
    >
      <div className="space-y-6">
        <SectionCard>
          <Alert className="mb-6 border-primary/20 bg-primary/5">
            <Info className="w-4 h-4 text-primary" />
            <AlertDescription className="text-sm text-gray-700">
{t("web.provider.settings.pages.upgrade-to-salon.upgradeIntro")}
            </AlertDescription>
          </Alert>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-4">
                {t("web.provider.settings.pages.upgrade-to-salon.whatYoullGet")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Users className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">{t("web.provider.settings.pages.upgrade-to-salon.teamManagement")}</h4>
                    <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.upgrade-to-salon.teamManagementBody")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">{t("web.provider.settings.pages.upgrade-to-salon.multipleLocations")}</h4>
                    <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.upgrade-to-salon.multipleLocationsBody")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Calendar className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">{t("web.provider.settings.pages.upgrade-to-salon.advancedScheduling")}</h4>
                    <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.upgrade-to-salon.advancedSchedulingBody")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <DollarSign className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">{t("web.provider.settings.pages.upgrade-to-salon.commissionTracking")}</h4>
                    <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.upgrade-to-salon.commissionTrackingBody")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-lg mb-4">{t("web.provider.settings.pages.upgrade-to-salon.whatHappens")}</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
{t("web.provider.settings.pages.upgrade-to-salon.happenUpgrade")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
{t("web.provider.settings.pages.upgrade-to-salon.happenOwner")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
{t("web.provider.settings.pages.upgrade-to-salon.happenPreserved")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
{t("web.provider.settings.pages.upgrade-to-salon.happenPrimary")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
{t("web.provider.settings.pages.upgrade-to-salon.happenAddTeam")}
                  </span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white"
                size="lg"
              >
                {t("web.provider.settings.pages.upgrade-to-salon.upgradeToSalon")}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.provider.settings.pages.upgrade-to-salon.confirmTitle")}</DialogTitle>
            <DialogDescription>
{t("web.provider.settings.pages.upgrade-to-salon.confirmIntro")}
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{t("web.provider.settings.pages.upgrade-to-salon.confirmType")}</li>
                <li>{t("web.provider.settings.pages.upgrade-to-salon.confirmTeam")}</li>
                <li>{t("web.provider.settings.pages.upgrade-to-salon.confirmLocations")}</li>
                <li>{t("web.provider.settings.pages.upgrade-to-salon.confirmOwner")}</li>
              </ul>
              <p className="mt-3 font-medium">
{t("web.provider.settings.pages.upgrade-to-salon.confirmFooter")}
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isUpgrading}
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              onClick={handleUpgrade}
              disabled={isUpgrading}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {isUpgrading ? t("web.provider.settings.pages.upgrade-to-salon.upgrading") : t("web.provider.settings.pages.upgrade-to-salon.confirmUpgrade")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
