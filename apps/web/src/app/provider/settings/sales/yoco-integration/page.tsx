"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { YocoIntegration, YocoDevice } from "@/lib/provider-portal/types";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  CreditCard,
  Eye,
  EyeOff,
  Plug,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getCsrfHeaders } from "@/lib/csrf";

export default function YocoIntegrationPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { bundle, isLoading: isConfigLoading } = useConfigBundle();
  const yocoEnabled = bundle?.flags?.payment_yoco?.enabled === true;
  const [integration, setIntegration] = useState<YocoIntegration | null>(null);
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showAdvancedKeys, setShowAdvancedKeys] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  const [formData, setFormData] = useState({
    secret_key: "",
    public_key: "",
    webhook_secret: "",
  });

  const loadData = useCallback(async () => {
    if (!yocoEnabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [integrationData, devicesData] = await Promise.all([
        providerApi.getYocoIntegration(),
        providerApi.listYocoDevices(),
      ]);
      setIntegration(integrationData);
      setDevices(devicesData);
      setFormData({
        secret_key:
          integrationData.secret_key && integrationData.secret_key !== "***"
            ? integrationData.secret_key
            : "",
        public_key:
          integrationData.public_key && integrationData.public_key !== "***"
            ? integrationData.public_key
            : "",
        webhook_secret:
          integrationData.webhook_secret && integrationData.webhook_secret !== "***"
            ? integrationData.webhook_secret
            : "",
      });
    } catch (error: unknown) {
      const err = error as {
        name?: string;
        message?: string;
        code?: string;
        error?: { code?: string };
        __cancelled?: boolean;
      };
      if (
        err?.name === "AbortError" ||
        (typeof err?.message === "string" && err.message.includes("aborted"))
      ) {
        return;
      }
      console.error("Failed to load Yoco integration:", error);
      if (error instanceof Error && isPlanGateErrorCode((error as { code?: string }).code)) {
        setSubscriptionRequired(true);
      } else if (err?.name !== "FetchTimeoutError" || !err?.__cancelled) {
        toast.error(t("web.provider.settings.pages.sales/yoco-integration.failedToLoadYocoIntegration"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [yocoEnabled]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Surface ?yoco_connected=1 / ?yoco_error=... query flags from the OAuth
  // callback, then strip them so a refresh doesn't re-fire the toast.
  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get("yoco_connected");
    const errored = searchParams.get("yoco_error");
    if (!connected && !errored) return;

    if (connected) {
      toast.success(t("web.provider.settings.pages.sales/yoco-integration.yocoConnectedYouCanNowAdd"));
      void loadData();
    }
    if (errored) {
      toast.error(t("web.provider.settings.pages.sales/yoco-integration.yocoConnectionFailed", { error: errored }));
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("yoco_connected");
    next.delete("yoco_error");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [searchParams, router, loadData]);

  const credentialMode = integration?.credential_mode ?? "none";
  const oauthConnected = integration?.oauth_connected === true;
  const environment = integration?.environment ?? "live";
  // §Yoco-OAuth 2026-05: feature-flag gate. When OFF, hide the OAuth call to
  // action everywhere except for providers who are already connected (they
  // keep the Reconnect/Disconnect controls so they aren't stranded).
  const oauthV2Enabled = integration?.oauth_v2_enabled === true;
  const showOauthSection = oauthV2Enabled || oauthConnected;
  const showReconnectBanner =
    oauthV2Enabled &&
    credentialMode === "checkout" &&
    !oauthConnected &&
    !integration?.reconnect_banner_dismissed_at;

  const handleDismissReconnectBanner = async () => {
    try {
      const res = await fetch("/api/provider/yoco/reconnect-banner", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) throw new Error(t("web.provider.settings.pages.sales/yoco-integration.dismissFailed"));
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(t("web.provider.settings.pages.sales/yoco-integration.couldNotDismissTheBanner"));
    }
  };

  const oauthBadge = useMemo(() => {
    if (oauthConnected) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="w-3 h-3 me-1" /> {t("web.provider.settings.pages.sales/yoco-integration.webPosConnected")}
        </Badge>
      );
    }
    if (credentialMode === "checkout") {
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-200">
          <AlertTriangle className="w-3 h-3 me-1" /> {t("web.provider.settings.pages.sales/yoco-integration.checkoutOnlyReconnect")}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <XCircle className="w-3 h-3 me-1" /> {t("web.provider.settings.pages.sales/yoco-integration.notConnected")}
      </Badge>
    );
  }, [oauthConnected, credentialMode, t]);

  const handleConnectOauth = () => {
    const returnTo = "/provider/settings/sales/yoco-integration";
    window.location.href = `/api/provider/yoco/oauth/authorize?return_to=${encodeURIComponent(returnTo)}`;
  };

  const handleDisconnectOauth = async () => {
    if (!confirm(t("web.provider.settings.pages.sales/yoco-integration.disconnectConfirm"))) {
      return;
    }
    try {
      setIsSaving(true);
      const res = await fetch("/api/provider/yoco/oauth/disconnect", {
        method: "POST",
        headers: getCsrfHeaders(),
        credentials: "include",
      });
if (!res.ok) throw new Error(t("web.provider.settings.pages.sales/yoco-integration.disconnectFailed"));
      toast.success(t("web.provider.settings.pages.sales/yoco-integration.yocoDisconnected"));
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(t("web.provider.settings.pages.sales/yoco-integration.couldNotDisconnectYoco"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      setIsSaving(true);
      const updated = await providerApi.updateYocoIntegration({ is_enabled: enabled });
      setIntegration(updated);
      invalidateSetupStatusCache();
toast.success(enabled ? t("web.provider.settings.pages.sales/yoco-integration.yocoIntegrationEnabled") : t("web.provider.settings.pages.sales/yoco-integration.yocoIntegrationDisabled"));
    } catch (error: unknown) {
      console.error("Failed to update integration:", error);
if (toastPlanGateError(error, t("web.provider.settings.pages.sales/yoco-integration.failedToUpdateIntegration"))) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveKeys = async () => {
    try {
      setIsSaving(true);
      const updated = await providerApi.updateYocoIntegration({
        secret_key: formData.secret_key,
        public_key: formData.public_key,
        webhook_secret: formData.webhook_secret,
      });
      setIntegration(updated);
      invalidateSetupStatusCache();
      toast.success(t("web.provider.settings.pages.sales/yoco-integration.checkoutApiKeysSaved"));
      setShowKeys(false);
    } catch (error: unknown) {
      console.error("Failed to save keys:", error);
if (toastPlanGateError(error, t("web.provider.settings.pages.sales/yoco-integration.failedToSaveApiKeys"))) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.sales/yoco-integration.yocoIntegration") },
  ];

  if (isConfigLoading || isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.sales.items.yocoIntegration.title")}
        subtitle={t("web.provider.settings.categories.sales.items.yocoIntegration.description")}
        breadcrumbs={breadcrumbs}
      >
        <div className="space-y-6">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (!yocoEnabled) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.sales/yoco-integration.yocoIntegration")}
        subtitle={t("web.provider.settings.pages.sales/yoco-integration.yocoIsCurrentlyUnavailable")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <div className="py-8 text-center">
            <CreditCard className="mx-auto mb-3 h-8 w-8 text-gray-400" />
<h2 className="text-base font-semibold text-gray-900">{t("web.provider.settings.pages.sales/yoco-integration.yocoPaymentsDisabled")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
{t("web.provider.settings.pages.sales/yoco-integration.yocoUnavailableBody")}
            </p>
          </div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.sales/yoco-integration.yocoIntegration")}
      subtitle={t("web.provider.settings.pages.sales/yoco-integration.connectYourYocoPaymentDevicesTo")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6">
        {subscriptionRequired && (
          <SubscriptionGate
            feature="Yoco"
            message={getUpgradeMessage("integrations.yoco")}
          />
        )}

        {showReconnectBanner && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm flex items-start justify-between gap-3">
              <span>
<strong>{t("web.provider.settings.pages.sales/yoco-integration.reconnectBanner")}</strong>{" "}
                {t("web.provider.settings.pages.sales/yoco-integration.reconnectBannerRest")}{" "}
                <em>{t("web.provider.settings.pages.sales/yoco-integration.connectYoco")}</em> {t("web.provider.settings.pages.sales/yoco-integration.reconnectBannerEnd")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-900 hover:text-amber-950 shrink-0"
                onClick={handleDismissReconnectBanner}
              >
{t("web.provider.common.dismiss")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/*
          §Yoco-OAuth 2026-05: PRIMARY connection flow is OAuth — that's what
          actually authenticates Yoco's api.yoco.com endpoints (Web POS,
          payments, refunds). Dashboard secret keys can ONLY drive the
          hosted-Checkout fallback at payments.yoco.com. Behind the
          yoco_oauth_v2 rollout flag — providers without the flag still see
          the legacy Checkout-keys section below.
        */}
        {showOauthSection && (
        <SectionCard>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
<h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.sales/yoco-integration.connectYocoRecommended")}</h3>
              <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.sales/yoco-integration.connectYocoBody")}
              </p>
            </div>
            <div className="shrink-0">{oauthBadge}</div>
          </div>

          {oauthConnected ? (
            <>
              <Alert className="bg-green-50 border-green-200 mb-4">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900 text-sm">
                  <div className="space-y-1">
                    <div>
{t("web.provider.settings.pages.sales/yoco-integration.connectedAs")}{" "}
                      <strong>
                        {integration?.oauth_business_name ||
                          integration?.oauth_user_email ||
t("web.provider.settings.pages.sales/yoco-integration.yocoAccount")}
                      </strong>
                      .
                    </div>
                    <div className="text-xs">
{t("web.provider.settings.pages.sales/yoco-integration.environment")} <span className="uppercase">{environment}</span>
                      {integration?.oauth_expires_at ? (
                        <>
{" • "}{t("web.provider.settings.pages.sales/yoco-integration.tokenRefreshes", { date: new Date(integration.oauth_expires_at).toLocaleString() })}
                        </>
                      ) : null}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleConnectOauth} disabled={isSaving}>
{t("web.provider.common.reconnect")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDisconnectOauth}
                  disabled={isSaving}
                  className="text-red-600 hover:text-red-700"
                >
{t("web.provider.settings.pages.sales/yoco-integration.disconnect")}
                </Button>
              </div>
              {integration?.oauth_last_refresh_error && (
                <Alert className="mt-3 bg-red-50 border-red-200">
                  <AlertDescription className="text-red-900 text-sm">
{t("web.provider.settings.pages.sales/yoco-integration.lastTokenRefreshFailed")}{" "}
                    {integration.oauth_last_refresh_error}. <em>{t("web.provider.common.reconnect")}</em>{" "}
                    {t("web.provider.settings.pages.sales/yoco-integration.reconnectToRestore")}
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <>
              <Alert className="bg-blue-50 border-blue-200 mb-4">
                <AlertDescription className="text-blue-900 text-sm">
{t("web.provider.settings.pages.sales/yoco-integration.redirectToYoco")} <strong>{t("web.provider.settings.pages.sales/yoco-integration.yocoCom")}</strong> {t("web.provider.settings.pages.sales/yoco-integration.redirectToYocoRest")}
                </AlertDescription>
              </Alert>
              <Button onClick={handleConnectOauth} disabled={isSaving} size="lg">
                <Plug className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.sales/yoco-integration.connectYoco")}
              </Button>
            </>
          )}
        </SectionCard>
        )}

        {/* Master enable switch — only meaningful when something is configured */}
        <SectionCard>
          <div className="flex items-center justify-between">
            <div>
<h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.sales/yoco-integration.integrationStatus")}</h3>
              <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.sales/yoco-integration.masterToggle")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_enabled ? (
                <Badge variant="default" className="bg-green-500">
<CheckCircle2 className="w-3 h-3 me-1" /> {t("web.provider.common.enabled")}
                </Badge>
              ) : (
                <Badge variant="secondary">
<XCircle className="w-3 h-3 me-1" /> {t("web.provider.common.disabled")}
                </Badge>
              )}
              <Switch
                checked={integration?.is_enabled || false}
                onCheckedChange={handleToggle}
                disabled={isSaving || credentialMode === "none"}
              />
            </div>
          </div>
          {integration?.is_enabled && (
            <Alert className="mt-3 bg-amber-50 border-amber-200">
              <AlertDescription className="text-amber-900 text-sm">
<strong>{t("web.provider.settings.pages.sales/yoco-integration.refundsLabel")}</strong> {t("web.provider.settings.pages.sales/yoco-integration.refundsBody")}{" "}
                <a
                  href="https://dashboard.yoco.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
{t("web.provider.settings.pages.sales/yoco-integration.yocoDashboard")}
                </a>
{t("web.provider.settings.pages.sales/yoco-integration.refundsBodyEnd")}
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        {/* Connected Devices */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
<h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.sales/yoco-integration.paymentDevices")}</h3>
              <p className="text-sm text-gray-600">
                {credentialMode === "oauth"
                  ? t("web.provider.settings.pages.sales/yoco-integration.manageOauthDevices")
                  : t("web.provider.settings.pages.sales/yoco-integration.connectFirstOrCheckout")}
              </p>
            </div>
            <Link href="/provider/settings/sales/yoco-devices">
              <Button variant="outline" size="sm">
                <CreditCard className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.sales/yoco-integration.manageDevices")}
              </Button>
            </Link>
          </div>

          {devices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-400" />
<p className="text-sm">{t("web.provider.settings.pages.sales/yoco-integration.noDevicesConnected")}</p>
              <Link href="/provider/settings/sales/yoco-devices">
                <Button variant="outline" size="sm" className="mt-3">
{t("web.provider.settings.pages.sales/yoco-integration.addYourFirstDevice")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.slice(0, 3).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{device.name}</p>
                    <p className="text-sm text-gray-600">
{device.location_name || t("web.provider.settings.pages.sales/yoco-integration.noLocation")} •{" "}
{t("web.provider.settings.pages.sales/yoco-integration.transactionsCount", { count: device.total_transactions || 0 })}
                    </p>
                  </div>
                  <Badge variant={device.is_active ? "default" : "secondary"}>
{device.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                  </Badge>
                </div>
              ))}
              {devices.length > 3 && (
                <Link href="/provider/settings/sales/yoco-devices">
                  <Button variant="ghost" size="sm" className="w-full">
{t("web.provider.settings.pages.sales/yoco-integration.viewAllDevices", { count: devices.length })}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </SectionCard>

        {/* Advanced — Checkout API keys (collapsed by default) */}
        <SectionCard>
          <button
            type="button"
            className="w-full flex items-center justify-between text-start"
            onClick={() => setShowAdvancedKeys((v) => !v)}
          >
            <div>
              <h3 className="text-lg font-semibold mb-1">
{t("web.provider.settings.pages.sales/yoco-integration.advancedHostedCheckout")}
              </h3>
              <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.sales/yoco-integration.advancedHostedHint")}
              </p>
            </div>
            {showAdvancedKeys ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {showAdvancedKeys && (
            <div className="mt-4 space-y-4">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-900 text-sm">
<strong>{t("web.provider.settings.pages.sales/yoco-integration.headsUp")}</strong> {t("web.provider.settings.pages.sales/yoco-integration.headsUpBody")} <strong>{t("web.provider.settings.pages.sales/yoco-integration.hostedCheckoutPages")}</strong>.
                  {t("web.provider.settings.pages.sales/yoco-integration.headsUpNot")} <strong>{t("web.provider.settings.pages.sales/yoco-integration.not")}</strong> {t("web.provider.settings.pages.sales/yoco-integration.headsUpEnd")} <em>{t("web.provider.settings.pages.sales/yoco-integration.connectYocoButton")}</em> {t("web.provider.settings.pages.sales/yoco-integration.headsUpButtonEnd")}
                </AlertDescription>
              </Alert>

              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-900 text-sm">
<p className="font-medium mb-1">{t("web.provider.settings.pages.sales/yoco-integration.howToFindKeys")}</p>
                  <ol className="list-decimal ps-5 space-y-1">
<li>{t("web.provider.settings.pages.sales/yoco-integration.findKeys1")}</li>
<li>{t("web.provider.settings.pages.sales/yoco-integration.findKeys2")}</li>
<li>{t("web.provider.settings.pages.sales/yoco-integration.findKeys3")}</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {integration?.secret_key === "***"
                    ? t("web.provider.settings.pages.sales/yoco-integration.keysSavedMasked")
                    : integration?.secret_key
                      ? t("web.provider.settings.pages.sales/yoco-integration.keysSaved")
                      : t("web.provider.settings.pages.sales/yoco-integration.noKeysSaved")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKeys((v) => !v)}
                >
{showKeys ? t("web.provider.common.cancel") : t("web.provider.common.edit")}
                </Button>
              </div>

              {showKeys && (
                <div className="space-y-4">
                  <div>
<Label htmlFor="secret_key">{t("web.provider.settings.pages.sales/yoco-integration.secretKey")}</Label>
                    <div className="relative mt-1">
                      <Input
                        id="secret_key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder={t("web.provider.settings.pages.sales/yoco-integration.skLive")}
                        value={formData.secret_key}
                        onChange={(e) =>
                          setFormData({ ...formData, secret_key: e.target.value })
                        }
                        className="pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecretKey((v) => !v)}
                        className="absolute inset-y-0 end-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
aria-label={showSecretKey ? t("web.provider.settings.pages.sales/yoco-integration.hideSecretKey") : t("web.provider.settings.pages.sales/yoco-integration.showSecretKey")}
                      >
                        {showSecretKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
<Label htmlFor="public_key">{t("web.provider.settings.pages.sales/yoco-integration.publicKeyOptional")}</Label>
                    <Input
                      id="public_key"
                      type="text"
                      placeholder={t("web.provider.settings.pages.sales/yoco-integration.pkLive")}
                      value={formData.public_key}
                      onChange={(e) =>
                        setFormData({ ...formData, public_key: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>

                  <div>
<Label htmlFor="webhook_secret">{t("web.provider.settings.pages.sales/yoco-integration.webhookSecretRecommended")}</Label>
                    <Input
                      id="webhook_secret"
                      type="password"
                      placeholder={t("web.provider.settings.pages.sales/yoco-integration.whsec")}
                      value={formData.webhook_secret}
                      onChange={(e) =>
                        setFormData({ ...formData, webhook_secret: e.target.value })
                      }
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-gray-500">
{t("web.provider.settings.pages.sales/yoco-integration.webhookSecretHint")}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleSaveKeys} disabled={isSaving}>
{t("web.provider.settings.pages.sales/yoco-integration.saveKeys")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFormData({
                          secret_key:
                            integration?.secret_key &&
                            integration.secret_key !== "***"
                              ? integration.secret_key
                              : "",
                          public_key:
                            integration?.public_key &&
                            integration.public_key !== "***"
                              ? integration.public_key
                              : "",
                          webhook_secret:
                            integration?.webhook_secret &&
                            integration.webhook_secret !== "***"
                              ? integration.webhook_secret
                              : "",
                        });
                      }}
                    >
{t("web.provider.common.reset")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t">
                <a
                  href="https://developer.yoco.com/api-reference"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
{t("web.provider.settings.pages.sales/yoco-integration.viewYocoApiDocs")}
                </a>
              </div>
            </div>
          )}
        </SectionCard>

        {integration?.connected_date && (
          <SectionCard>
<h3 className="text-lg font-semibold mb-3">{t("web.provider.settings.pages.sales/yoco-integration.connectionDetails")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.settings.pages.sales/yoco-integration.connected")}</span>
                <span>{new Date(integration.connected_date).toLocaleDateString()}</span>
              </div>
              {integration.last_sync && (
                <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.settings.pages.sales/yoco-integration.lastSync")}</span>
                  <span>{new Date(integration.last_sync).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.settings.pages.sales/yoco-integration.mode")}</span>
                <span className="capitalize">{credentialMode}</span>
              </div>
              <div className="flex justify-between">
<span className="text-gray-600">{t("web.provider.settings.pages.sales/yoco-integration.environment")}</span>
                <span className="uppercase">{environment}</span>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
