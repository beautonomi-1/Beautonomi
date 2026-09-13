"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Share2, Download, HelpCircle } from "lucide-react";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { getSupabaseClient } from "@/lib/supabase/client";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  canVerifySensitiveActionWithCode,
  describeReauthOtpDestination,
  isAuthSecurityLoaded,
  sensitiveActionSubmitReady,
  userHasPassword,
  type AuthSecuritySnapshot,
} from "@beautonomi/utils";
import { CookieSettingsFooterLink } from "@/components/cookie-consent/CookieSettingsFooterLink";
import { useTranslation } from "@beautonomi/i18n";
import type { PrivacyPageInitial } from "./privacy-initial-types";

const tabs = [
  { value: "account", label: "Account" },
  { value: "data", label: "Data" },
  { value: "sharing", label: "Sharing" },
  { value: "services", label: "Services" },
] as const;

type PrivacyTabValue = (typeof tabs)[number]["value"];

function isPrivacyTabValue(value: string): value is PrivacyTabValue {
  return tabs.some((tab) => tab.value === value);
}

const PrivacyPage = ({
  initial,
  initialTab = "account",
  accountHomeHref = "/account-settings",
  accountHomeLabel = "Account",
  loginSecurityHref = "/account-settings/login-and-security",
}: {
  initial: PrivacyPageInitial | null;
  initialTab?: PrivacyTabValue;
  accountHomeHref?: string;
  accountHomeLabel?: string;
  loginSecurityHref?: string;
}) => {
  const { t } = useTranslation();
  const s = initial?.settings;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Account tab states
  const [accountVisibility, setAccountVisibility] = useState(() => s?.accountVisibility ?? false);
  const [profileInformation, setProfileInformation] = useState(() => s?.profileInformation ?? false);
  const [analyticsConsent, setAnalyticsConsent] = useState(() => s?.analytics_consent ?? true);

  // Sharing tab states
  const [readReceipts, setReadReceipts] = useState(() => s?.readReceipts ?? false);
  const [includeInSearchEngines, setIncludeInSearchEngines] = useState(() => s?.includeInSearchEngines ?? false);
  const [showHomeCity, setShowHomeCity] = useState(() => s?.showHomeCity ?? false);
  const [showTripType, setShowTripType] = useState(() => s?.showTripType ?? false);
  const [showLengthOfStay, setShowLengthOfStay] = useState(() => s?.showLengthOfStay ?? false);

  // Data tab states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteVerificationNonce, setDeleteVerificationNonce] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [isRequestingData, setIsRequestingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isRequestingDeleteNonce, setIsRequestingDeleteNonce] = useState(false);
  const [deleteAuthSecurity, setDeleteAuthSecurity] = useState<AuthSecuritySnapshot | null>(null);
  const [deleteProfileEmail, setDeleteProfileEmail] = useState<string | null>(null);
  const [deleteProfilePhone, setDeleteProfilePhone] = useState<string | null>(null);

  const DELETE_CONFIRM_PHRASE = "DELETE";
  const deleteAuthSecurityLoaded = isAuthSecurityLoaded(deleteAuthSecurity);
  const deleteHasPassword = userHasPassword(deleteAuthSecurity);
  const deleteCanVerifyWithCode = canVerifySensitiveActionWithCode(deleteAuthSecurity);
  const deleteOtpDestination = useMemo(
    () =>
      describeReauthOtpDestination(deleteAuthSecurity, {
        email: deleteProfileEmail,
        phone: deleteProfilePhone,
      }),
    [deleteAuthSecurity, deleteProfileEmail, deleteProfilePhone],
  );
  const canConfirmDelete =
    deleteConfirmText?.trim().toUpperCase() === DELETE_CONFIRM_PHRASE &&
    sensitiveActionSubmitReady(deleteAuthSecurity, {
      password: deletePassword,
      verificationNonce: deleteVerificationNonce,
    });
  const [isLoadingSettings, setIsLoadingSettings] = useState(() => !initial);
  const [dataExportStatus, setDataExportStatus] = useState<{
    isReady: boolean;
    isPending: boolean;
    downloadUrl?: string;
    fileName?: string;
  } | null>(() => initial?.dataExportStatus ?? null);
  const skipHydrateLoadOnce = useRef(!!initial);

  useEffect(() => {
    if (skipHydrateLoadOnce.current && initial) {
      skipHydrateLoadOnce.current = false;
      setIsLoadingSettings(false);
      return;
    }
    void loadPrivacySettings();
    void loadDataExportStatus();
    void loadDeleteAuthProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is fixed for this navigation
  }, []);

  const loadDeleteAuthProfile = async () => {
    try {
      const res = await fetcher.get<{
        data?: { email?: string; phone?: string; auth_security?: AuthSecuritySnapshot | null };
        email?: string;
        phone?: string;
        auth_security?: AuthSecuritySnapshot | null;
      }>("/api/me/profile", { staleTimeMs: 30_000 });
      const profile = (res as { data?: Record<string, unknown> })?.data ?? res;
      const p = profile as { email?: string; phone?: string; auth_security?: AuthSecuritySnapshot | null };
      setDeleteAuthSecurity(p?.auth_security ?? null);
      setDeleteProfileEmail(p?.email ?? null);
      setDeleteProfilePhone(p?.phone ?? null);
    } catch {
      setDeleteAuthSecurity(null);
    }
  };

  const loadPrivacySettings = async () => {
    try {
      setIsLoadingSettings(true);
      const response = await fetcher.get<{
        data: {
          accountVisibility: boolean;
          profileInformation: boolean;
          readReceipts: boolean;
          includeInSearchEngines: boolean;
          showHomeCity: boolean;
          showTripType: boolean;
          showLengthOfStay: boolean;
          analytics_consent?: boolean;
        };
      }>("/api/me/privacy-settings", { staleTimeMs: 30_000 });

      type PrivacySettingsPayload = {
        accountVisibility?: boolean;
        profileInformation?: boolean;
        readReceipts?: boolean;
        includeInSearchEngines?: boolean;
        showHomeCity?: boolean;
        showTripType?: boolean;
        showLengthOfStay?: boolean;
        analytics_consent?: boolean;
      };
      const settings: PrivacySettingsPayload = response.data ?? (response as PrivacySettingsPayload);

      setAccountVisibility(settings.accountVisibility ?? false);
      setProfileInformation(settings.profileInformation ?? false);
      setReadReceipts(settings.readReceipts ?? false);
      setIncludeInSearchEngines(settings.includeInSearchEngines ?? false);
      setShowHomeCity(settings.showHomeCity ?? false);
      setShowTripType(settings.showTripType ?? false);
      setShowLengthOfStay(settings.showLengthOfStay ?? false);
      setAnalyticsConsent(settings.analytics_consent ?? true);
    } catch (error: unknown) {
      console.error("Failed to load privacy settings:", error);
      toast.error(t("web.accountSettings.privacyAndSharing.loadFailed"));
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const updatePrivacySetting = async (setting: string, value: boolean) => {
    try {
      await fetcher.patch("/api/me/privacy-settings", {
        [setting]: value,
      });
      toast.success(t("web.accountSettings.privacyAndSharing.settingUpdated"));
      await loadPrivacySettings();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.privacyAndSharing.updateFailed"));
      throw error;
    }
  };

  const loadDataExportStatus = async () => {
    try {
      const response = await fetcher.get<{
        data: {
          isReady: boolean;
          isPending: boolean;
          downloadUrl?: string;
          fileName?: string;
          requestedAt?: string;
          readyAt?: string;
        };
      }>("/api/me/request-data", { staleTimeMs: 30_000 });
      
      type DataExportStatusPayload = { isReady?: boolean; isPending?: boolean; downloadUrl?: string; fileName?: string };
      const responseData: DataExportStatusPayload = response.data ?? (response as DataExportStatusPayload);
      
      setDataExportStatus({
        isReady: responseData.isReady ?? false,
        isPending: responseData.isPending ?? false,
        downloadUrl: responseData.downloadUrl,
        fileName: responseData.fileName,
      });
    } catch (error: unknown) {
      console.error("Failed to load data export status:", error);
      // Set default state on error
      setDataExportStatus({
        isReady: false,
        isPending: false,
      });
    }
  };

  const handleRequestData = async () => {
    try {
      setIsRequestingData(true);
      const response = await fetcher.post<{
        data: {
          message: string;
          downloadUrl?: string;
          fileName?: string;
          requestedAt?: string;
        };
      }>("/api/me/request-data");

      type RequestDataResponse = { message?: string; downloadUrl?: string; fileName?: string; requestedAt?: string };
      const responseData: RequestDataResponse = response.data ?? (response as RequestDataResponse);

      if (responseData.downloadUrl) {
        setDataExportStatus({
          isReady: true,
          isPending: false,
          downloadUrl: responseData.downloadUrl,
          fileName: responseData.fileName || `beautonomi-data-export-${new Date().toISOString().split('T')[0]}.json`,
        });
        toast.success(t("web.accountSettings.privacyAndSharing.exportReadyToast"));

        // Trigger download
        if (responseData.downloadUrl.startsWith("data:")) {
          const link = document.createElement("a");
          link.href = responseData.downloadUrl;
          link.download = responseData.fileName || "beautonomi-data-export.json";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else if (responseData.downloadUrl) {
          // If it's a URL, open in new tab
          window.open(responseData.downloadUrl, '_blank');
        }
      } else {
        toast.success(responseData.message ?? t("web.accountSettings.privacyAndSharing.requestSubmitted"));
        await loadDataExportStatus();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.privacyAndSharing.requestFailed"));
    } finally {
      setIsRequestingData(false);
    }
  };

  const handleDownloadData = () => {
    if (dataExportStatus?.downloadUrl) {
      if (dataExportStatus.downloadUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = dataExportStatus.downloadUrl;
        link.download = dataExportStatus.fileName || "beautonomi-data-export.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // If it's a URL, open in new tab
        window.open(dataExportStatus.downloadUrl, '_blank');
      }
    } else {
      toast.error(t("web.accountSettings.privacyAndSharing.downloadUnavailable"));
    }
  };

  const handleRequestDeleteNonce = async () => {
    if (!deleteCanVerifyWithCode) {
      toast.error(deleteOtpDestination.codeSentMessage);
      return;
    }
    setIsRequestingDeleteNonce(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      toast.success(deleteOtpDestination.codeSentMessage);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.privacyAndSharing.sendCodeFailed"));
    } finally {
      setIsRequestingDeleteNonce(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAuthSecurityLoaded) {
      toast.error(t("web.accountSettings.privacyAndSharing.securityLoading"));
      return;
    }
    if (deleteHasPassword && !deletePassword.trim()) {
      toast.error(t("web.accountSettings.privacyAndSharing.passwordRequired"));
      return;
    }
    if (!deleteHasPassword && !deleteVerificationNonce.trim()) {
      toast.error(t("web.accountSettings.privacyAndSharing.codeRequired"));
      return;
    }
    if (deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
      toast.error(t("web.accountSettings.privacyAndSharing.typeDeleteToConfirm", { phrase: DELETE_CONFIRM_PHRASE }));
      return;
    }

    try {
      setIsDeletingAccount(true);
      const response = await fetcher.post<{
        scheduled?: boolean;
        message?: string;
        grace_days?: number;
      }>("/api/me/delete-account", {
        password: deleteHasPassword ? deletePassword.trim() : undefined,
        verificationNonce: deleteHasPassword ? undefined : deleteVerificationNonce.trim(),
        reason: deleteReason || null,
      });
      const scheduled = response?.scheduled === true;
      toast.success(
        response?.message ??
          (scheduled
            ? t("web.accountSettings.privacyAndSharing.deletedScheduled", { days: response?.grace_days ?? 30 })
            : t("web.accountSettings.privacyAndSharing.deletedImmediate")),
      );
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteVerificationNonce("");
      setDeleteConfirmText("");
      setDeleteReason("");
      setTimeout(() => {
        window.location.href = scheduled ? "/?deletion_scheduled=1" : "/";
      }, 2000);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.privacyAndSharing.deleteFailed"));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage={t("web.accountSettings.privacyAndSharing.loading")} />
          </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <div
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mt-8 mb-12"
          >
            <BackButton href={accountHomeHref} />
            <Breadcrumb
              items={[
                { label: accountHomeLabel, href: accountHomeHref },
                { label: t("web.accountSettings.privacyAndSharing.breadcrumb") },
              ]}
            />

            <h1
              className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 border-b border-gray-200 mb-6 pb-4 mt-4 md:mt-6"
            >
              {t("web.accountSettings.privacyAndSharing.title")}
            </h1>

            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                if (isPrivacyTabValue(value)) setActiveTab(value);
              }}
              className="w-full"
            >
              <TabsList className="mb-6 grid grid-cols-4 w-full h-auto p-1 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-xs md:text-sm font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                  >
                    {t(`web.accountSettings.privacyAndSharing.tab${tab.value.charAt(0).toUpperCase()}${tab.value.slice(1)}`)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="account">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      {t("web.accountSettings.privacyAndSharing.title")}
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      {t("web.accountSettings.privacyAndSharing.subtitle")}
                    </p>

                    <div className="space-y-6">
                      <div
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                <Eye className="w-5 h-5 text-[#FF0077]" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {t("web.accountSettings.privacyAndSharing.accountVisibility")}
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  {t("web.accountSettings.privacyAndSharing.accountVisibilityDesc")}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={accountVisibility}
                            disabled={isLoadingSettings}
                            onCheckedChange={async (checked) => {
                              const previousValue = accountVisibility;
                              setAccountVisibility(checked);
                              try {
                                await updatePrivacySetting("accountVisibility", checked);
                              } catch {
                                setAccountVisibility(previousValue);
                              }
                            }}
                            className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                          />
                        </div>
                      </div>

                      <div
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                <Share2 className="w-5 h-5 text-[#FF0077]" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {t("web.accountSettings.privacyAndSharing.profileInformation")}
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  {t("web.accountSettings.privacyAndSharing.profileInformationDesc")}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={profileInformation}
                            disabled={isLoadingSettings}
                            onCheckedChange={async (checked) => {
                              const previousValue = profileInformation;
                              setProfileInformation(checked);
                              try {
                                await updatePrivacySetting("profileInformation", checked);
                              } catch {
                                setProfileInformation(previousValue);
                              }
                            }}
                            className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                          />
                        </div>
                      </div>

                      {/* Product analytics */}
                      <div
                        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900">
                              {t("web.accountSettings.privacyAndSharing.productAnalytics")}
                            </h3>
                            <p className="text-sm font-light text-gray-600">
                              {t("web.accountSettings.privacyAndSharing.productAnalyticsDesc")}
                            </p>
                          </div>
                          <Switch
                            checked={analyticsConsent}
                            disabled={isLoadingSettings}
                            onCheckedChange={async (checked) => {
                              const previousValue = analyticsConsent;
                              setAnalyticsConsent(checked);
                              try {
                                await updatePrivacySetting("analytics_consent", checked);
                              } catch {
                                setAnalyticsConsent(previousValue);
                              }
                            }}
                            className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                          />
                        </div>
                      </div>

                      <div
                        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                      >
                        <h3 className="text-base font-semibold text-gray-900">{t("web.accountSettings.privacyAndSharing.thisBrowser")}</h3>
                        <p className="mt-2 text-sm font-light leading-relaxed text-gray-600">
                          {t("web.accountSettings.privacyAndSharing.thisBrowserBefore")}
                          <span className="text-gray-800">{t("web.accountSettings.privacyAndSharing.thisDevice")}</span>
                          {t("web.accountSettings.privacyAndSharing.thisBrowserMid")}
                          <CookieSettingsFooterLink variant="inline" className="inline p-0 align-baseline" />
                          {t("web.accountSettings.privacyAndSharing.thisBrowserAfter")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <div
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          {t("web.accountSettings.privacyAndSharing.committedTitle")}
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          {t("web.accountSettings.privacyAndSharing.committedBefore")}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            {t("web.accountSettings.privacyAndSharing.privacyPolicy")}
                          </a>
                          .
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="data">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      {t("web.accountSettings.privacyAndSharing.manageDataTitle")}
                    </h2>

                    <div className="space-y-6 mt-6">
                      <div
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                            <Download className="w-5 h-5 text-[#FF0077]" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                              {t("web.accountSettings.privacyAndSharing.requestPersonalData")}
                            </h3>
                            <p className="text-sm font-light text-gray-600">
                              {t("web.accountSettings.privacyAndSharing.requestPersonalDataDesc")}
                            </p>
                          </div>
                        </div>

                        {dataExportStatus?.isReady && dataExportStatus.downloadUrl ? (
                          <div className="space-y-3">
                            <p className="text-sm text-green-600 font-medium">
                              {t("web.accountSettings.privacyAndSharing.exportReady")}
                            </p>
                            <div className="flex gap-3">
                              <Button
                                onClick={handleDownloadData}
                                className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
                              >
                                <Download className="w-4 h-4 me-2" />
                                {t("web.accountSettings.privacyAndSharing.downloadYourData")}
                              </Button>
                              <Button
                                onClick={handleRequestData}
                                disabled={isRequestingData}
                                variant="outline"
                              >
                                {t("web.accountSettings.privacyAndSharing.requestNewExport")}
                              </Button>
                            </div>
                          </div>
                        ) : dataExportStatus?.isPending ? (
                          <div className="space-y-3">
                            <p className="text-sm text-yellow-600 font-medium">
                              {t("web.accountSettings.privacyAndSharing.exportProcessing")}
                            </p>
                            <Button onClick={loadDataExportStatus} variant="outline">
                              {t("web.accountSettings.privacyAndSharing.checkStatus")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={handleRequestData}
                            disabled={isRequestingData}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
                          >
                            {isRequestingData ? t("web.accountSettings.privacyAndSharing.requesting") : t("web.accountSettings.privacyAndSharing.requestYourData")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <div
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          {t("web.accountSettings.privacyAndSharing.committedTitle")}
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          {t("web.accountSettings.privacyAndSharing.committedBefore")}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            {t("web.accountSettings.privacyAndSharing.privacyPolicy")}
                          </a>
                          .
                        </p>
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">{t("web.accountSettings.privacyAndSharing.giveFeedback")}</h4>
                        <p className="text-sm font-light text-gray-600 mb-2">
                          {t("web.accountSettings.privacyAndSharing.feedbackBody")}
                        </p>
                        <a
                          href="/help-center?topic=data-export-feedback"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          {t("web.accountSettings.privacyAndSharing.shareFeedback")}
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200/80">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {t("web.accountSettings.privacyAndSharing.advanced")}
                    </p>
                    <p className="text-sm text-gray-500 font-light mb-3 max-w-xl">
                      {t("web.accountSettings.privacyAndSharing.deleteAccountHintBefore")}
                      <span className="font-mono font-medium text-gray-600">{DELETE_CONFIRM_PHRASE}</span>
                      {t("web.accountSettings.privacyAndSharing.deleteAccountHintMid")}
                      <a
                        href={loginSecurityHref}
                        className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
                      >
                        {t("web.accountSettings.privacyAndSharing.loginSecurity")}
                      </a>
                      {t("web.accountSettings.privacyAndSharing.deleteAccountHintEnd")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isDeletingAccount}
                      className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors disabled:opacity-50"
                    >
                      {t("web.accountSettings.privacyAndSharing.requestDeletion")}
                    </button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sharing">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      {t("web.accountSettings.privacyAndSharing.activitySharing")}
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      {t("web.accountSettings.privacyAndSharing.activitySharingDesc")}
                    </p>

                    <div className="space-y-6">
                      <div
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                <Eye className="w-5 h-5 text-[#FF0077]" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {t("web.accountSettings.privacyAndSharing.readReceipts")}
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  {t("web.accountSettings.privacyAndSharing.readReceiptsDesc")}
                                  <a
                                    href="/help-center"
                                    className="text-[#FF0077] hover:text-[#D60565] underline"
                                  >
                                    {t("web.accountSettings.privacyAndSharing.learnMore")}
                                  </a>
                                </p>
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={readReceipts}
                            disabled={isLoadingSettings}
                            onCheckedChange={async (checked) => {
                              const previousValue = readReceipts;
                              setReadReceipts(checked);
                              try {
                                await updatePrivacySetting("readReceipts", checked);
                              } catch {
                                setReadReceipts(previousValue);
                              }
                            }}
                            className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                          />
                        </div>
                      </div>

                      <div
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                <Share2 className="w-5 h-5 text-[#FF0077]" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {t("web.accountSettings.privacyAndSharing.includeInSearch")}
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  {t("web.accountSettings.privacyAndSharing.includeInSearchDesc")}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={includeInSearchEngines}
                            disabled={isLoadingSettings}
                            onCheckedChange={async (checked) => {
                              const previousValue = includeInSearchEngines;
                              setIncludeInSearchEngines(checked);
                              try {
                                await updatePrivacySetting("includeInSearchEngines", checked);
                              } catch {
                                setIncludeInSearchEngines(previousValue);
                              }
                            }}
                            className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        {t("web.accountSettings.privacyAndSharing.reviews")}
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        {t("web.accountSettings.privacyAndSharing.reviewsDesc")}
                        <a
                          href="/help-center"
                          className="text-[#FF0077] hover:text-[#D60565] underline"
                        >
                          {t("web.accountSettings.privacyAndSharing.learnMore")}
                        </a>
                      </p>

                      <div className="space-y-6">
                        <div
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                {t("web.accountSettings.privacyAndSharing.showHomeCity")}
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                {t("web.accountSettings.privacyAndSharing.showHomeCityDesc")}
                              </p>
                            </div>
                            <Switch
                              checked={showHomeCity}
                              disabled={isLoadingSettings}
                              onCheckedChange={async (checked) => {
                                const previousValue = showHomeCity;
                                setShowHomeCity(checked);
                                try {
                                  await updatePrivacySetting("showHomeCity", checked);
                                } catch {
                                  setShowHomeCity(previousValue);
                                }
                              }}
                              className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                            />
                          </div>
                        </div>

                        <div
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                {t("web.accountSettings.privacyAndSharing.showBookingType")}
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                {t("web.accountSettings.privacyAndSharing.showBookingTypeDesc")}
                              </p>
                            </div>
                            <Switch
                              checked={showTripType}
                              disabled={isLoadingSettings}
                              onCheckedChange={async (checked) => {
                                const previousValue = showTripType;
                                setShowTripType(checked);
                                try {
                                  await updatePrivacySetting("showTripType", checked);
                                } catch {
                                  setShowTripType(previousValue);
                                }
                              }}
                              className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                            />
                          </div>
                        </div>

                        <div
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                {t("web.accountSettings.privacyAndSharing.showServiceDuration")}
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                {t("web.accountSettings.privacyAndSharing.showServiceDurationDesc")}
                              </p>
                            </div>
                            <Switch
                              checked={showLengthOfStay}
                              disabled={isLoadingSettings}
                              onCheckedChange={async (checked) => {
                                const previousValue = showLengthOfStay;
                                setShowLengthOfStay(checked);
                                try {
                                  await updatePrivacySetting("showLengthOfStay", checked);
                                } catch {
                                  setShowLengthOfStay(previousValue);
                                }
                              }}
                              className="data-[state=checked]:bg-[#FF0077] data-[state=unchecked]:bg-gray-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <div
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          {t("web.accountSettings.privacyAndSharing.committedTitle")}
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          {t("web.accountSettings.privacyAndSharing.committedBefore")}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            {t("web.accountSettings.privacyAndSharing.privacyPolicy")}
                          </a>
                          .
                        </p>
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">{t("web.accountSettings.privacyAndSharing.giveFeedback")}</h4>
                        <p className="text-sm font-light text-gray-600">
                          {t("web.accountSettings.privacyAndSharing.sharingFeedbackBody")}
                          <a
                            href="/help-center?topic=data-export-feedback"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            {t("web.accountSettings.privacyAndSharing.shareFeedback")}
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="services">
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    {t("web.accountSettings.privacyAndSharing.connectedServices")}
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    {t("web.accountSettings.privacyAndSharing.connectedServicesDesc")}
                  </p>
                  <p className="text-sm md:text-base font-light text-gray-500">
                    {t("web.accountSettings.privacyAndSharing.noServicesConnected")}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Delete Account Confirmation Dialog */}
        <Dialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) {
              setDeletePassword("");
              setDeleteVerificationNonce("");
              setDeleteConfirmText("");
              setDeleteReason("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-red-700">{t("web.accountSettings.privacyAndSharing.deleteDialogTitle")}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    {t("web.accountSettings.privacyAndSharing.deleteDialogP1Before")}
                    <strong>{t("web.accountSettings.privacyAndSharing.permanently")}</strong>
                    {t("web.accountSettings.privacyAndSharing.deleteDialogP1Mid")}
                    <strong>{t("web.accountSettings.privacyAndSharing.cannotBeUndone")}</strong>
                    {t("web.accountSettings.privacyAndSharing.deleteDialogP1End")}
                  </p>
                  <p>{t("web.accountSettings.privacyAndSharing.deleteDialogP2")}</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!deleteAuthSecurityLoaded ? (
                <p className="text-sm text-gray-500">{t("web.accountSettings.privacyAndSharing.loadingVerification")}</p>
              ) : deleteHasPassword ? (
                <div>
                  <label htmlFor="delete-password" className="text-sm font-medium mb-2 block">
                    {t("web.accountSettings.privacyAndSharing.enterPassword")}
                  </label>
                  <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={t("web.accountSettings.privacyAndSharing.passwordPlaceholder")}
                    disabled={isDeletingAccount}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    {t("web.accountSettings.privacyAndSharing.otpConfirmHint", { hint: deleteOtpDestination.sendButtonHint })}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label htmlFor="delete-verification-code" className="text-sm font-medium mb-2 block">
                        {t("web.accountSettings.privacyAndSharing.verificationCode")}
                      </label>
                      <Input
                        id="delete-verification-code"
                        value={deleteVerificationNonce}
                        onChange={(e) => setDeleteVerificationNonce(e.target.value.replace(/\D/g, ""))}
                        placeholder={t("web.accountSettings.privacyAndSharing.enterCode")}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={isDeletingAccount}
                        className="w-full"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRequestDeleteNonce}
                      disabled={isRequestingDeleteNonce || !deleteCanVerifyWithCode || isDeletingAccount}
                    >
                      {isRequestingDeleteNonce ? t("web.accountSettings.privacyAndSharing.sending") : t("web.accountSettings.privacyAndSharing.sendCode")}
                    </Button>
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="delete-confirm-text" className="text-sm font-medium mb-2 block">
                  {t("web.accountSettings.privacyAndSharing.typePhraseToConfirm", { phrase: DELETE_CONFIRM_PHRASE })}
                </label>
                <Input
                  id="delete-confirm-text"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={DELETE_CONFIRM_PHRASE}
                  disabled={isDeletingAccount}
                  className="w-full font-mono"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="delete-reason" className="text-sm font-medium mb-2 block">
                  {t("web.accountSettings.privacyAndSharing.reasonOptional")}
                </label>
                <textarea
                  id="delete-reason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={t("web.accountSettings.privacyAndSharing.reasonPlaceholder")}
                  disabled={isDeletingAccount}
                  className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletePassword("");
                  setDeleteVerificationNonce("");
                  setDeleteConfirmText("");
                  setDeleteReason("");
                }}
                disabled={isDeletingAccount}
              >
                {t("web.accountSettings.privacyAndSharing.cancel")}
              </Button>
              <Button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || !canConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeletingAccount ? t("web.accountSettings.privacyAndSharing.deleting") : t("web.accountSettings.privacyAndSharing.permanentlyDeleteAccount")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default PrivacyPage;
