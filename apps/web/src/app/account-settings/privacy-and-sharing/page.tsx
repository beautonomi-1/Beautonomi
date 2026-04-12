"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
import AuthGuard from "@/components/auth/auth-guard";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { CookieSettingsFooterLink } from "@/components/cookie-consent/CookieSettingsFooterLink";

const tabs = [
  { value: "account", label: "Account" },
  { value: "data", label: "Data" },
  { value: "sharing", label: "Sharing" },
  { value: "services", label: "Services" },
];

const PrivacyPage = () => {
  const [activeTab, setActiveTab] = useState("account");

  // Account tab states
  const [accountVisibility, setAccountVisibility] = useState(false);
  const [profileInformation, setProfileInformation] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);

  // Sharing tab states
  const [readReceipts, setReadReceipts] = useState(false);
  const [includeInSearchEngines, setIncludeInSearchEngines] = useState(false);
  const [showHomeCity, setShowHomeCity] = useState(false);
  const [showTripType, setShowTripType] = useState(false);
  const [showLengthOfStay, setShowLengthOfStay] = useState(false);

  // Data tab states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [isRequestingData, setIsRequestingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const DELETE_CONFIRM_PHRASE = "DELETE";
  const canConfirmDelete =
    !!deletePassword?.trim() &&
    deleteConfirmText?.trim().toUpperCase() === DELETE_CONFIRM_PHRASE;
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [dataExportStatus, setDataExportStatus] = useState<{
    isReady: boolean;
    isPending: boolean;
    downloadUrl?: string;
    fileName?: string;
  } | null>(null);

  useEffect(() => {
    loadPrivacySettings();
    loadDataExportStatus();
  }, []);

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
      toast.error("Failed to load privacy settings. Please try again.");
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const updatePrivacySetting = async (setting: string, value: boolean) => {
    try {
      await fetcher.patch("/api/me/privacy-settings", {
        [setting]: value,
      });
      toast.success("Setting updated successfully");
      await loadPrivacySettings();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update setting. Please try again.");
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
        toast.success("Your data export is ready for download!");

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
        toast.success(responseData.message ?? "Your data request has been submitted.");
        await loadDataExportStatus();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to request your data. Please try again.");
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
      toast.error("Download URL not available. Please request your data again.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error("Password is required to delete your account");
      return;
    }

    try {
      setIsDeletingAccount(true);
      await fetcher.post("/api/me/delete-account", {
        password: deletePassword,
        reason: deleteReason || null,
      });
      toast.success("Your account has been deleted. You will be signed out.");
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteConfirmText("");
      setDeleteReason("");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete your account. Please try again.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage="Loading privacy settings..." />
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mt-8 mb-12"
          >
            <BackButton href="/account-settings" />
            <Breadcrumb
              items={[
                { label: "Account", href: "/account-settings" },
                { label: "Privacy & sharing" },
              ]}
            />

            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
              className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 border-b border-gray-200 mb-6 pb-4 mt-4 md:mt-6"
            >
              Privacy and sharing
            </motion.h1>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 grid grid-cols-4 w-full h-auto p-1 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-xs md:text-sm font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-[#FF0077] data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="account">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      Privacy and sharing
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      Manage your privacy settings and how your information is shared.
                    </p>

                    <div className="space-y-6">
                      <motion.div
                        whileHover={{ scale: 1.01 }}
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
                                  Account visibility
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  Control who can see your profile and account information.
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
                      </motion.div>

                      <motion.div
                        whileHover={{ scale: 1.01 }}
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
                                  Profile information
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  Manage what information is visible on your public profile.
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
                      </motion.div>

                      {/* Product analytics */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900">
                              Product analytics
                            </h3>
                            <p className="text-sm font-light text-gray-600">
                              Allow Beautonomi to use analytics to improve the product (e.g. usage and performance). You can disable this at any time.
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
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                      >
                        <h3 className="text-base font-semibold text-gray-900">This browser</h3>
                        <p className="mt-2 text-sm font-light leading-relaxed text-gray-600">
                          Account-level analytics above applies to your profile. Cookies and similar storage on{" "}
                          <span className="text-gray-800">this device</span> are managed separately—use{" "}
                          <CookieSettingsFooterLink variant="inline" className="inline p-0 align-baseline" /> to adjust
                          optional cookies on this browser.
                        </p>
                      </motion.div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          Committed to privacy
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          Beautonomi is committed to keeping your data protected. See details in our{" "}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            Privacy Policy
                          </a>
                          .
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </TabsContent>

              <TabsContent value="data">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      Manage your account data
                    </h2>

                    <div className="space-y-6 mt-6">
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                            <Download className="w-5 h-5 text-[#FF0077]" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                              Request your personal data
                            </h3>
                            <p className="text-sm font-light text-gray-600">
                              We&apos;ll create a file for you to download your personal data.
                            </p>
                          </div>
                        </div>

                        {dataExportStatus?.isReady && dataExportStatus.downloadUrl ? (
                          <div className="space-y-3">
                            <p className="text-sm text-green-600 font-medium">
                              ✓ Your data export is ready!
                            </p>
                            <div className="flex gap-3">
                              <Button
                                onClick={handleDownloadData}
                                className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download your data
                              </Button>
                              <Button
                                onClick={handleRequestData}
                                disabled={isRequestingData}
                                variant="outline"
                              >
                                Request new export
                              </Button>
                            </div>
                          </div>
                        ) : dataExportStatus?.isPending ? (
                          <div className="space-y-3">
                            <p className="text-sm text-yellow-600 font-medium">
                              ⏳ Your data export is being processed...
                            </p>
                            <Button onClick={loadDataExportStatus} variant="outline">
                              Check status
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={handleRequestData}
                            disabled={isRequestingData}
                            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
                          >
                            {isRequestingData ? "Requesting..." : "Request your data"}
                          </Button>
                        )}
                      </motion.div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          Committed to privacy
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          Beautonomi is committed to keeping your data protected. See details in our{" "}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            Privacy Policy
                          </a>
                          .
                        </p>
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">Give feedback</h4>
                        <p className="text-sm font-light text-gray-600 mb-2">
                          Share feedback on requesting your personal data to help us improve your
                          experience
                        </p>
                        <a
                          href="/help-center?topic=data-export-feedback"
                          className="text-sm font-medium text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                        >
                          Share your feedback
                        </a>
                      </div>
                    </div>
                  </motion.div>

                  <div className="pt-6 border-t border-gray-200/80">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Advanced
                    </p>
                    <p className="text-sm text-gray-500 font-light mb-3 max-w-xl">
                      To permanently delete your account we require your password and typing{" "}
                      <span className="font-mono font-medium text-gray-600">DELETE</span> to confirm.
                      Prefer a break first? Use{" "}
                      <a
                        href="/account-settings/login-and-security"
                        className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
                      >
                        Login &amp; security
                      </a>{" "}
                      to deactivate.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isDeletingAccount}
                      className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors disabled:opacity-50"
                    >
                      Request permanent account deletion…
                    </button>
                  </div>
                </motion.div>
              </TabsContent>

              <TabsContent value="sharing">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-8"
                >
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      Activity sharing
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      Decide how your profile and activity are shown to others.
                    </p>

                    <div className="space-y-6">
                      <motion.div
                        whileHover={{ scale: 1.01 }}
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
                                  Read Receipts
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  When this is on, we&apos;ll show people that you&apos;ve read their messages.{" "}
                                  <a
                                    href="/help-center"
                                    className="text-[#FF0077] hover:text-[#D60565] underline"
                                  >
                                    Learn more
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
                      </motion.div>

                      <motion.div
                        whileHover={{ scale: 1.01 }}
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
                                  Include my listing(s) in search engines
                                </h3>
                                <p className="text-sm font-light text-gray-600">
                                  Turning this on means search engines, like Google, will display
                                  your listing page(s) in search results.
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
                      </motion.div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                        Reviews
                      </h2>
                      <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                        Choose what&apos;s shared when you write a review. Updating this setting will
                        change what&apos;s displayed for all past reviews.{" "}
                        <a
                          href="/help-center"
                          className="text-[#FF0077] hover:text-[#D60565] underline"
                        >
                          Learn more
                        </a>
                      </p>

                      <div className="space-y-6">
                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                Show my home city and country
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                When this is on, your home location (ex: city and country) may be
                                included with your reviews.
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
                        </motion.div>

                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                Show my booking type
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                When this is on, your booking type (ex: individual appointment, group booking, event booking, or special occasion) may be included with your reviews.
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
                        </motion.div>

                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900 mb-1">
                                Show my service duration
                              </h3>
                              <p className="text-sm font-light text-gray-600">
                                When this is on, an approximate service duration (ex: quick service, standard appointment, or extended session) may be included with your reviews.
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
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  {/* Help Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                    className="pt-6 border-t border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                        <HelpCircle className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">
                          Committed to privacy
                        </h3>
                        <p className="text-sm font-light text-gray-600 mb-3">
                          Beautonomi is committed to keeping your data protected. See details in our{" "}
                          <a
                            href="/privacy-policy"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            Privacy Policy
                          </a>
                          .
                        </p>
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">Give feedback</h4>
                        <p className="text-sm font-light text-gray-600">
                          Share feedback on requesting your personal data to help us improve your
                          experience.{" "}
                          <a
                            href="/help-center?topic=data-export-feedback"
                            className="text-[#FF0077] hover:text-[#D60565] underline transition-colors"
                          >
                            Share your feedback
                          </a>
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </TabsContent>

              <TabsContent value="services">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    Connected services
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    View services that you&apos;ve connected to your Beautonomi account
                  </p>
                  <p className="text-sm md:text-base font-light text-gray-500">
                    No services connected at the moment
                  </p>
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>

        {/* Delete Account Confirmation Dialog */}
        <Dialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) {
              setDeletePassword("");
              setDeleteConfirmText("");
              setDeleteReason("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-red-700">Permanently delete your account</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    This will <strong>permanently</strong> remove your account and all associated data,
                    including bookings, messages, preferences, and profile. This action{" "}
                    <strong>cannot be undone</strong>.
                  </p>
                  <p>If you prefer to take a break, use &quot;Deactivate account&quot; in Login &amp; security instead.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label htmlFor="delete-password" className="text-sm font-medium mb-2 block">
                  Enter your password
                </label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  disabled={isDeletingAccount}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="delete-confirm-text" className="text-sm font-medium mb-2 block">
                  Type <span className="font-mono font-bold text-red-600">{DELETE_CONFIRM_PHRASE}</span> to confirm
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
                  Reason (optional)
                </label>
                <textarea
                  id="delete-reason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Tell us why you're deleting your account..."
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
                  setDeleteConfirmText("");
                  setDeleteReason("");
                }}
                disabled={isDeletingAccount}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || !canConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeletingAccount ? "Deleting..." : "Permanently delete account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
};

export default PrivacyPage;
