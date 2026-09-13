"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Gift, FileText, AlertCircle, Clock, HelpCircle } from "lucide-react";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { NotificationPreferences } from "../notification-preferences-types";

const tabs = [
  { value: "offersUpdates", labelKey: "tabOffersUpdates" },
  { value: "account", labelKey: "tabAccount" },
] as const;

/** Sections for the "Offers and updates" tab */
const offersUpdatesSections = [
  {
    id: "inspiration_and_offers",
    titleKey: "inspirationAndOffers",
    descriptionKey: "inspirationAndOffersDesc",
    icon: Gift,
  },
  {
    id: "news_and_programs",
    titleKey: "newsAndPrograms",
    descriptionKey: "newsAndProgramsDesc",
    icon: FileText,
  },
] as const;

/** Sections for the "Beautonomi updates" sub-group inside the Offers tab */
const beautonomiUpdatesSections = [
  {
    id: "feedback",
    titleKey: "feedback",
    descriptionKey: "feedbackDesc",
    icon: AlertCircle,
  },
  {
    id: "travel_regulations",
    titleKey: "travelRegulations",
    descriptionKey: "travelRegulationsDesc",
    icon: FileText,
  },
] as const;

/** Sections for the "Account" tab */
const accountSections = [
  {
    id: "account_activity",
    titleKey: "accountActivity",
    descriptionKey: "accountActivityDesc",
    icon: Bell,
  },
  {
    id: "client_policies",
    titleKey: "clientPolicies",
    descriptionKey: "clientPoliciesDesc",
    icon: FileText,
  },
  {
    id: "reminders",
    titleKey: "reminders",
    descriptionKey: "remindersDesc",
    icon: Clock,
  },
  {
    id: "subscription_renewal",
    titleKey: "subscriptionRenewal",
    descriptionKey: "subscriptionRenewalDesc",
    icon: Clock,
  },
  {
    id: "messages",
    titleKey: "messages",
    descriptionKey: "messagesDesc",
    icon: MessageSquare,
  },
] as const;

/** All sections combined — used only for rendering modals */
const notificationSections = [
  ...offersUpdatesSections,
  ...beautonomiUpdatesSections,
  ...accountSections,
];

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  preferences?: { email?: boolean; sms?: boolean; push?: boolean; whatsapp?: boolean };
  sectionId: string;
  onUpdate: (sectionId: string, prefs: { email: boolean; sms: boolean; push: boolean; whatsapp: boolean }) => Promise<void>;
}

const NotificationModal = ({
  isOpen,
  onClose,
  title,
  description,
  preferences,
  sectionId,
  onUpdate,
}: NotificationModalProps) => {
  const { t } = useTranslation();
  const [localPrefs, setLocalPrefs] = useState<{ email: boolean; sms: boolean; push: boolean; whatsapp: boolean }>(
    preferences
      ? {
          email: preferences.email ?? true,
          sms: preferences.sms ?? true,
          push: preferences.push ?? false,
          whatsapp: preferences.whatsapp ?? false,
        }
      : { email: true, sms: true, push: false, whatsapp: false },
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        email: preferences.email ?? true,
        sms: preferences.sms ?? true,
        push: preferences.push ?? false,
        whatsapp: preferences.whatsapp ?? false,
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(sectionId, localPrefs);
      toast.success(t("web.accountSettings.notifications.prefsUpdated"));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.notifications.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl sm:rounded-3xl border-gray-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="pt-5">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-500 font-light mb-4">{description}</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="font-medium">{t("web.accountSettings.notifications.email")}</span>
              </div>
              <Switch
                checked={localPrefs.email}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, email: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <span className="font-medium">{t("web.accountSettings.notifications.sms")}</span>
              </div>
              <Switch
                checked={localPrefs.sms}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, sms: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">{t("web.accountSettings.notifications.whatsapp")}</span>
              </div>
              <Switch
                checked={localPrefs.whatsapp}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, whatsapp: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <p className="text-xs text-gray-500 font-light -mt-2">
              {t("web.accountSettings.notifications.whatsappHint")}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{t("web.accountSettings.notifications.browserNotifications")}</span>
                </div>
                <Switch
                  checked={localPrefs.push}
                  onCheckedChange={(checked) =>
                    setLocalPrefs({ ...localPrefs, push: checked })
                  }
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              <p className="text-sm text-gray-500 font-light">
                {localPrefs.push
                  ? t("web.accountSettings.notifications.pushOnHint")
                  : t("web.accountSettings.notifications.pushOffHint")}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors touch-manipulation"
            >
              {t("web.accountSettings.notifications.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary rounded-full disabled:opacity-50 shadow-sm touch-manipulation"
            >
              {isSaving ? t("web.accountSettings.notifications.saving") : t("web.accountSettings.notifications.save")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Page = ({ initialPreferences }: { initialPreferences: NotificationPreferences | null }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("offersUpdates");
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => initialPreferences ?? {});
  const [isLoading, setIsLoading] = useState(() => initialPreferences === null);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribeMarketing, setUnsubscribeMarketing] = useState(
    () => initialPreferences?.unsubscribe_marketing ?? false,
  );
  const skipHydrateLoadOnce = useRef(initialPreferences !== null);

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      return;
    }
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: NotificationPreferences }>(
        "/api/me/notification-preferences",
        { staleTimeMs: 30_000 }
      );
      setPreferences(response.data || {});
      setUnsubscribeMarketing(response.data?.unsubscribe_marketing || false);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.accountSettings.notifications.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.accountSettings.notifications.loadFailed");
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
      await fetcher.patch("/api/me/notification-preferences", {
        [sectionId]: prefs,
      });
      setPreferences((prev) => ({ ...prev, [sectionId]: prefs }));
    } catch (error: unknown) {
      throw error;
    }
  };

  const handleUnsubscribeMarketing = async (checked: boolean) => {
    const previousValue = unsubscribeMarketing;
    setUnsubscribeMarketing(checked);
    try {
      await fetcher.patch("/api/me/notification-preferences", {
        unsubscribe_marketing: checked,
      });
      toast.success(
        checked
          ? t("web.accountSettings.notifications.unsubscribedToast")
          : t("web.accountSettings.notifications.subscribedToast"),
      );
    } catch (error: unknown) {
      setUnsubscribeMarketing(previousValue);
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.notifications.updatePreferenceFailed"));
    }
  };

  const getPreferenceStatus = (sectionId: string) => {
    const prefs = preferences[sectionId as keyof NotificationPreferences] as {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
      whatsapp?: boolean;
    } | undefined;
    if (!prefs) return t("web.accountSettings.notifications.statusOnDefault");
    const channels = [];
    if (prefs.email) channels.push(t("web.accountSettings.notifications.email"));
    if (prefs.sms) channels.push(t("web.accountSettings.notifications.sms"));
    if (prefs.whatsapp) channels.push(t("web.accountSettings.notifications.whatsapp"));
    if (prefs.push) channels.push(t("web.accountSettings.notifications.channelPush"));
    return channels.length > 0
      ? t("web.accountSettings.notifications.statusOn", { channels: channels.join(", ") })
      : t("web.accountSettings.notifications.statusOff");
  };

  const openModal = (id: string) => setActiveModal(id);
  const closeModal = () => setActiveModal(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage={t("web.accountSettings.notifications.loading")} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <EmptyState
            title={t("web.accountSettings.unableLoadNotifications")}
            description={error}
            action={{ label: t("web.accountSettings.notifications.tryAgain"), onClick: () => loadPreferences() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <div
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-3xl p-6 md:p-8 mt-8 mb-12"
        >
          <BackButton href="/account-settings" />
          <Breadcrumb
            items={[
              { label: t("web.accountSettings.account"), href: "/account-settings" },
              { label: t("web.accountSettings.notifications.title") },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-gray-200/90 mb-6 pb-5 mt-4 md:mt-6">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              {t("web.accountSettings.notifications.title")}
            </h1>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto rounded-full border-gray-200 shrink-0">
              <Link href="/account-settings/notifications/inbox">{t("web.accountSettings.notifications.viewInbox")}</Link>
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 grid grid-cols-2 w-full h-auto p-1.5 bg-gray-100/90 rounded-2xl shadow-inner border border-gray-200/80">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-sm md:text-base font-medium text-gray-700 min-h-[44px] rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-100 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 transition-all duration-200 touch-manipulation"
                >
                  {t(`web.accountSettings.notifications.${tab.labelKey}`)}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="offersUpdates">
              <div
                className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-3xl p-6 md:p-8 space-y-6"
              >
                {offersUpdatesSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.id}
                      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                              <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">
                                {t(`web.accountSettings.notifications.${section.titleKey}`)}
                              </h3>
                              <p className="text-sm font-light text-gray-600 mb-2">
                                {getPreferenceStatus(section.id)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openModal(section.id)}
                          className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors touch-manipulation"
                        >
                          {t("web.accountSettings.notifications.edit")}
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-4">
                    {t("web.accountSettings.notifications.beautonomiUpdates")}
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    {t("web.accountSettings.notifications.beautonomiUpdatesDesc")}
                  </p>

                  {beautonomiUpdatesSections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <div
                        key={section.id}
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 mb-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                                <Icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {t(`web.accountSettings.notifications.${section.titleKey}`)}
                                </h3>
                                <p className="text-sm font-light text-gray-600 mb-2">
                                  {getPreferenceStatus(section.id)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openModal(section.id)}
                            className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors touch-manipulation"
                          >
                            {t("web.accountSettings.notifications.edit")}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div
                    className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 mt-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 mb-1">
                          {t("web.accountSettings.notifications.unsubscribeMarketing")}
                        </h3>
                        <p className="text-sm font-light text-gray-600">
                          {t("web.accountSettings.notifications.unsubscribeMarketingDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={unsubscribeMarketing}
                        onCheckedChange={handleUnsubscribeMarketing}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="account">
              <div
                className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-3xl p-6 md:p-8 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    {t("web.accountSettings.notifications.accountActivityPolicies")}
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    {t("web.accountSettings.notifications.accountActivityPoliciesDesc")}
                  </p>

                  {accountSections
                    .filter((s) => s.id === "account_activity" || s.id === "client_policies")
                    .map((section) => {
                      const Icon = section.icon;
                      return (
                        <div
                          key={section.id}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 mb-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                                  <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-base font-semibold text-gray-900">
                                    {t(`web.accountSettings.notifications.${section.titleKey}`)}
                                  </h3>
                                  <p className="text-sm font-light text-gray-600 mb-2">
                                    {getPreferenceStatus(section.id)}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openModal(section.id)}
                              className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors touch-manipulation"
                            >
                              {t("web.accountSettings.notifications.edit")}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      {t("web.accountSettings.notifications.reminders")}
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      {t("web.accountSettings.notifications.remindersSectionDesc")}
                    </p>

                    {accountSections
                      .filter((s) => s.id === "reminders" || s.id === "subscription_renewal")
                      .map((section) => {
                        const Icon = section.icon;
                        return (
                          <div
                            key={section.id}
                            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 mb-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                                    <Icon className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="text-base font-semibold text-gray-900">
                                      {t(`web.accountSettings.notifications.${section.titleKey}`)}
                                    </h3>
                                    <p className="text-sm font-light text-gray-600 mb-2">
                                      {getPreferenceStatus(section.id)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openModal(section.id)}
                                className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors touch-manipulation"
                              >
                                {t("web.accountSettings.notifications.edit")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      {t("web.accountSettings.notifications.messages")}
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      {t("web.accountSettings.notifications.messagesSectionDesc")}
                    </p>

                    {accountSections
                      .filter((s) => s.id === "messages")
                      .map((section) => {
                        const Icon = section.icon;
                        return (
                          <div
                            key={section.id}
                            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-5 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                                    <Icon className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="text-base font-semibold text-gray-900">
                                      {t(`web.accountSettings.notifications.${section.titleKey}`)}
                                    </h3>
                                    <p className="text-sm font-light text-gray-600 mb-2">
                                      {getPreferenceStatus(section.id)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openModal(section.id)}
                                className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors touch-manipulation"
                              >
                                {t("web.accountSettings.notifications.edit")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Help Section */}
                <div
                  className="pt-6 border-t border-gray-200"
                >
                  <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/50 p-4 sm:p-5">
                    <div className="p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shrink-0">
                      <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 mb-2">{t("web.accountSettings.notifications.needHelp")}</h3>
                      <p className="text-sm font-light text-gray-600 mb-3">
                        {t("web.accountSettings.notifications.helpBody")}
                      </p>
                      <a
                        href="/help"
                        className="inline-flex items-center rounded-full border border-primary/20 bg-white px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors touch-manipulation"
                      >
                        {t("web.accountSettings.notifications.visitHelpCentre")}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {notificationSections.map((section) => (
            <NotificationModal
              key={section.id}
              isOpen={activeModal === section.id}
              onClose={closeModal}
              title={t(`web.accountSettings.notifications.${section.titleKey}`)}
              description={t(`web.accountSettings.notifications.${section.descriptionKey}`)}
              preferences={
                preferences[section.id as keyof NotificationPreferences] as {
                  email: boolean;
                  sms: boolean;
                  push: boolean;
                }
              }
              sectionId={section.id}
              onUpdate={updatePreference}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Page;
