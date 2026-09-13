"use client";

import React from "react";
import { useAppointmentSettings } from "@/hooks/useAppointmentSettings";
import { APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { useTranslation } from "@beautonomi/i18n";

export default function AppointmentSettingsPage() {
  const { t } = useTranslation();
  const { settings, isLoading, error, updateSettings } = useAppointmentSettings();

  const statusLabels: Record<string, string> = {
    pending: t("web.provider.common.status.pending"),
    booked: t("web.provider.common.status.booked"),
    started: t("web.provider.common.status.started"),
    completed: t("web.provider.common.status.completed"),
    cancelled: t("web.provider.common.status.cancelled"),
    no_show: t("web.provider.common.status.noShow"),
  };
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [isSaving, setIsSaving] = React.useState(false);
  const [originalSettings, setOriginalSettings] = React.useState(settings);
  const [acceptsCustomRequests, setAcceptsCustomRequests] = React.useState(true);
  const [originalAcceptsCustom, setOriginalAcceptsCustom] = React.useState(true);

  // Update local settings when settings change
  React.useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setOriginalSettings(settings);
    }
  }, [settings]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: { acceptsCustomRequests: boolean } }>(
          "/api/provider/settings/custom-requests",
        );
        if (!cancelled) {
          const v = res.data.acceptsCustomRequests !== false;
          setAcceptsCustomRequests(v);
          setOriginalAcceptsCustom(v);
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/custom-requests", { acceptsCustomRequests });
      await updateSettings(localSettings);
      setOriginalSettings(localSettings);
      setOriginalAcceptsCustom(acceptsCustomRequests);
      toast.success(t("web.provider.settings.appointments.saved"));
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.appointments.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    Boolean(originalSettings) &&
    (JSON.stringify(localSettings) !== JSON.stringify(originalSettings) ||
      acceptsCustomRequests !== originalAcceptsCustom);

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.appointments.breadcrumb") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.appointments.pageTitle")}
        subtitle={t("web.provider.settings.appointments.pageSubtitle")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.appointments.loading")} />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalSettings) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.appointments.pageTitle")}
        subtitle={t("web.provider.settings.appointments.pageSubtitle")}
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title={t("web.provider.settings.appointments.loadFailedTitle")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: () => window.location.reload(),
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.appointments.pageTitle")}
      subtitle={t("web.provider.settings.appointments.pageSubtitle")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6 sm:space-y-8">
          {/* Default Status Selection */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="default-status" className="text-base sm:text-lg font-medium block mb-2">
                {t("web.provider.settings.appointments.defaultAppointmentStatus")}
              </Label>
              <p className="text-sm text-gray-600 mb-4">
                {t("web.provider.settings.appointments.defaultAppointmentStatusHint")}
              </p>
              <Select
                value={localSettings?.defaultAppointmentStatus || APPOINTMENT_STATUS.BOOKED}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, defaultAppointmentStatus: value })
                }
              >
                <SelectTrigger id="default-status" className="w-full sm:w-auto min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPOINTMENT_STATUS).map(([key, value]) => (
                    <SelectItem key={key} value={value}>
                      {statusLabels[value] || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs sm:text-sm text-gray-500 mt-2">
                {t("web.provider.settings.appointments.defaultStatusFootnote")}
              </p>
            </div>
          </div>

          {/* Auto-Confirm Switch */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="auto-confirm" className="text-base sm:text-lg font-medium block mb-2">
                  {t("web.provider.settings.appointments.autoConfirm")}
                </Label>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.appointments.autoConfirmHint")}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Switch
                  id="auto-confirm"
                  checked={localSettings?.autoConfirmAppointments || false}
                  onCheckedChange={(checked) =>
                    setLocalSettings({ ...localSettings, autoConfirmAppointments: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Require Confirmation Switch */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="require-confirmation" className="text-base sm:text-lg font-medium block mb-2">
                  {t("web.provider.settings.appointments.requireConfirmation")}
                </Label>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.appointments.requireConfirmationHint")}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {t("web.provider.settings.appointments.requireConfirmationFootnote")}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Switch
                  id="require-confirmation"
                  checked={localSettings?.requireConfirmationForBookings || false}
                  onCheckedChange={(checked) =>
                    setLocalSettings({ ...localSettings, requireConfirmationForBookings: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Lifecycle timing */}
          <div className="border-t pt-6 space-y-5">
            <div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900">{t("web.provider.settings.appointments.lifecycleTitle")}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {t("web.provider.settings.appointments.lifecycleHint")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="confirmation-sla-hours">{t("web.provider.settings.appointments.confirmationSla")}</Label>
                <Input
                  id="confirmation-sla-hours"
                  type="number"
                  min={1}
                  max={72}
                  value={localSettings?.confirmationSlaHours ?? 2}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      confirmationSlaHours: Number(e.target.value) || 2,
                    })
                  }
                />
                <p className="text-xs text-gray-500">
                  {t("web.provider.settings.appointments.confirmationSlaHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unconfirmed-expire-hours">{t("web.provider.settings.appointments.releaseUnconfirmed")}</Label>
                <Input
                  id="unconfirmed-expire-hours"
                  type="number"
                  min={1}
                  max={48}
                  value={localSettings?.unconfirmedExpireHoursBeforeSlot ?? 2}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      unconfirmedExpireHoursBeforeSlot: Number(e.target.value) || 2,
                    })
                  }
                />
                <p className="text-xs text-gray-500">
                  {t("web.provider.settings.appointments.releaseUnconfirmedHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="closeout-grace-salon">{t("web.provider.settings.appointments.closeoutGraceSalon")}</Label>
                <Input
                  id="closeout-grace-salon"
                  type="number"
                  min={0}
                  max={240}
                  value={localSettings?.closeoutGraceMinutesSalon ?? 20}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      closeoutGraceMinutesSalon: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closeout-grace-at-home">{t("web.provider.settings.appointments.closeoutGraceAtHome")}</Label>
                <Input
                  id="closeout-grace-at-home"
                  type="number"
                  min={0}
                  max={240}
                  value={localSettings?.closeoutGraceMinutesAtHome ?? 30}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      closeoutGraceMinutesAtHome: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="late-arrival-grace">{t("web.provider.settings.appointments.lateArrivalGrace")}</Label>
                <Input
                  id="late-arrival-grace"
                  type="number"
                  min={0}
                  max={120}
                  value={localSettings?.lateArrivalGraceMinutes ?? 0}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      lateArrivalGraceMinutes: Number(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-gray-500">
                  {t("web.provider.settings.appointments.lateArrivalGraceHint")}
                </p>
              </div>
            </div>
          </div>

          {/* Custom service requests */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="accept-custom-requests" className="text-base sm:text-lg font-medium block mb-2">
                  {t("web.provider.settings.appointments.acceptCustomRequests")}
                </Label>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.appointments.acceptCustomRequestsHint")}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Switch
                  id="accept-custom-requests"
                  checked={acceptsCustomRequests}
                  onCheckedChange={setAcceptsCustomRequests}
                />
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              {t("web.provider.settings.appointments.infoAlert")}
            </AlertDescription>
          </Alert>

          {/* Last Updated */}
          {localSettings?.updatedAt && (
            <p className="text-xs text-gray-500 text-center pt-4 border-t">
              {t("web.provider.settings.appointments.lastUpdated", {
                date: new Date(localSettings.updatedAt).toLocaleString(),
              })}
            </p>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
