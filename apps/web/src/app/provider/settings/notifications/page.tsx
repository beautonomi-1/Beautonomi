"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Calendar, DollarSign, Star, Users, AlertCircle, Clock, FileText, TrendingUp, Wallet, Volume2 } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface NotificationPreferences {
  booking_updates?: { email: boolean; sms: boolean; push: boolean };
  booking_cancellations?: { email: boolean; sms: boolean; push: boolean };
  booking_reminders?: { email: boolean; sms: boolean; push: boolean };
  new_reviews?: { email: boolean; sms: boolean; push: boolean };
  review_responses?: { email: boolean; sms: boolean; push: boolean };
  client_messages?: { email: boolean; sms: boolean; push: boolean };
  payment_received?: { email: boolean; sms: boolean; push: boolean };
  payout_updates?: { email: boolean; sms: boolean; push: boolean };
  waitlist_notifications?: { email: boolean; sms: boolean; push: boolean };
  system_updates?: { email: boolean; sms: boolean; push: boolean };
  marketing?: { email: boolean; sms: boolean; push: boolean };
  unsubscribe_marketing?: boolean;
  /** In-browser sound when a new booking is created (if platform configures a normal-booking ringtone). */
  booking_alert_sound?: boolean;
}

const notificationSections = [
  { id: "booking_updates", titleKey: "booking_updates", icon: Calendar },
  { id: "booking_cancellations", titleKey: "booking_cancellations", icon: AlertCircle },
  { id: "booking_reminders", titleKey: "booking_reminders", icon: Clock },
  { id: "new_reviews", titleKey: "new_reviews", icon: Star },
  { id: "review_responses", titleKey: "review_responses", icon: MessageSquare },
  { id: "client_messages", titleKey: "client_messages", icon: MessageSquare },
  { id: "payment_received", titleKey: "payment_received", icon: DollarSign },
  { id: "payout_updates", titleKey: "payout_updates", icon: Wallet },
  { id: "waitlist_notifications", titleKey: "waitlist_notifications", icon: Users },
  { id: "system_updates", titleKey: "system_updates", icon: FileText },
  { id: "marketing", titleKey: "marketing", icon: TrendingUp },
];

export default function ProviderNotificationPreferences() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: NotificationPreferences }>(
        "/api/provider/notification-preferences"
      );
      setPreferences(response.data || {});
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.notifications.loadFailed");
      setError(errorMessage);
      console.error("Error loading notification preferences:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = async (
    sectionId: string,
    prefs: { email: boolean; sms: boolean; push: boolean; whatsapp: boolean },
  ) => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/notification-preferences", {
        [sectionId]: prefs,
      });
      
      setPreferences((prev) => ({
        ...prev,
        [sectionId]: prefs,
      }));
      
      toast.success(t("web.provider.settings.pages.notifications.notificationPreferencesUpdated"));
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.notifications.updateFailed");
      toast.error(errorMessage);
      console.error("Error updating preferences:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePreference = (sectionId: string, channel: "email" | "sms" | "push" | "whatsapp") => {
    const currentPrefs = (preferences[sectionId as keyof NotificationPreferences] as {
      email: boolean;
      sms: boolean;
      push: boolean;
      whatsapp?: boolean;
    }) || { email: true, sms: true, push: false, whatsapp: false };
    const newPrefs = {
      ...currentPrefs,
      whatsapp: currentPrefs.whatsapp ?? false,
      [channel]: !currentPrefs[channel],
    };
    updatePreference(sectionId, newPrefs);
  };

  const setBookingAlertSound = async (enabled: boolean) => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/notification-preferences", {
        booking_alert_sound: enabled,
      });
      setPreferences((prev) => ({
        ...prev,
        booking_alert_sound: enabled,
      }));
      toast.success(
        enabled
          ? t("web.provider.settings.pages.notifications.alertSoundEnabled")
          : t("web.provider.settings.pages.notifications.alertSoundDisabled"),
      );
    } catch {
      toast.error(t("web.provider.settings.pages.notifications.failedToUpdateBookingAlertPreference"));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMarketing = async () => {
    try {
      setIsSaving(true);
      const newValue = !preferences.unsubscribe_marketing;
      await fetcher.patch("/api/provider/notification-preferences", {
        unsubscribe_marketing: newValue,
      });
      
      setPreferences((prev) => ({
        ...prev,
        unsubscribe_marketing: newValue,
      }));
      
      toast.success(
        newValue
          ? t("web.provider.settings.pages.notifications.unsubscribedMarketing")
          : t("web.provider.settings.pages.notifications.subscribedMarketing"),
      );
    } catch {
      toast.error(t("web.provider.settings.pages.notifications.failedToUpdateMarketingPreferences"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.notifications.notifications") },
        ]}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.notifications.loadingNotificationPreferences")} />
      </SettingsDetailLayout>
    );
  }

  if (error) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.notifications.notifications") },
        ]}
      >
        <EmptyState
          title={t("web.provider.settings.categories.account.items.notifications.title")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadPreferences,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.notifications.notifications") },
      ]}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.settings.pages.notifications.notificationPreferences")}
          subtitle={t("web.provider.settings.categories.account.items.notifications.description")}
        />

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Volume2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.notifications.bookingAlertSound")}</h3>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.pages.notifications.bookingAlertSoundDesc")}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.booking_alert_sound !== false}
              onCheckedChange={(v) => void setBookingAlertSound(v)}
              disabled={isSaving}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>

        {/* Marketing Unsubscribe */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.notifications.marketingComms")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.notifications.marketingCommsDesc")}
              </p>
            </div>
            <Switch
              checked={preferences.unsubscribe_marketing || false}
              onCheckedChange={toggleMarketing}
              disabled={isSaving}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        {/* Notification Sections */}
        <div className="space-y-4">
          {notificationSections.map((section) => {
            const Icon = section.icon;
            const sectionPrefs = (preferences[section.id as keyof NotificationPreferences] as {
              email: boolean;
              sms: boolean;
              push: boolean;
              whatsapp?: boolean;
            }) || { email: true, sms: true, push: false, whatsapp: false };

            return (
              <div key={section.id} className="bg-white border rounded-lg p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{t(`web.provider.settings.pages.notifications.sections.${section.titleKey}.title`)}</h3>
                    <p className="text-sm text-gray-600">{t(`web.provider.settings.pages.notifications.sections.${section.titleKey}.description`)}</p>
                  </div>
                </div>

                <div className="space-y-3 ps-14">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{t("web.provider.settings.pages.notifications.email")}</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.email}
                      onCheckedChange={() => togglePreference(section.id, 'email')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{t("web.provider.settings.pages.notifications.sms")}</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.sms}
                      onCheckedChange={() => togglePreference(section.id, 'sms')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium">{t("web.provider.settings.pages.notifications.whatsapp")}</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.whatsapp ?? false}
                      onCheckedChange={() => togglePreference(section.id, "whatsapp")}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-emerald-600"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{t("web.provider.settings.pages.notifications.push")}</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.push}
                      onCheckedChange={() => togglePreference(section.id, 'push')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
