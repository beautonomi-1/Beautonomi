"use client";

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
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";

export default function YocoIntegrationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
      if (
        err?.code === "SUBSCRIPTION_REQUIRED" ||
        err?.error?.code === "SUBSCRIPTION_REQUIRED"
      ) {
        setSubscriptionRequired(true);
      } else if (err?.name !== "FetchTimeoutError" || !err?.__cancelled) {
        toast.error("Failed to load Yoco integration");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      toast.success("Yoco connected — you can now add Web POS devices.");
      void loadData();
    }
    if (errored) {
      toast.error(`Yoco connection failed: ${errored}`);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) throw new Error("Dismiss failed");
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error("Could not dismiss the banner");
    }
  };

  const oauthBadge = useMemo(() => {
    if (oauthConnected) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Web POS connected
        </Badge>
      );
    }
    if (credentialMode === "checkout") {
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-200">
          <AlertTriangle className="w-3 h-3 mr-1" /> Checkout only — reconnect for terminals
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <XCircle className="w-3 h-3 mr-1" /> Not connected
      </Badge>
    );
  }, [oauthConnected, credentialMode]);

  const handleConnectOauth = () => {
    const returnTo = "/provider/settings/sales/yoco-integration";
    window.location.href = `/api/provider/yoco/oauth/authorize?return_to=${encodeURIComponent(returnTo)}`;
  };

  const handleDisconnectOauth = async () => {
    if (!confirm("Disconnect Yoco Web POS? You'll need to reconnect to add new card terminals.")) {
      return;
    }
    try {
      setIsSaving(true);
      const res = await fetch("/api/provider/yoco/oauth/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      toast.success("Yoco disconnected");
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error("Could not disconnect Yoco");
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
      toast.success(enabled ? "Yoco integration enabled" : "Yoco integration disabled");
    } catch (error: unknown) {
      console.error("Failed to update integration:", error);
      const err = error as { code?: string; error?: { code?: string } };
      if (
        err?.code === "SUBSCRIPTION_REQUIRED" ||
        err?.error?.code === "SUBSCRIPTION_REQUIRED"
      ) {
        setSubscriptionRequired(true);
        toast.error("Subscription upgrade required to use Yoco integration");
      } else {
        toast.error("Failed to update integration");
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
      toast.success("Checkout API keys saved");
      setShowKeys(false);
    } catch (error: unknown) {
      console.error("Failed to save keys:", error);
      const err = error as { code?: string; error?: { code?: string } };
      if (
        err?.code === "SUBSCRIPTION_REQUIRED" ||
        err?.error?.code === "SUBSCRIPTION_REQUIRED"
      ) {
        setSubscriptionRequired(true);
        toast.error("Subscription upgrade required to configure Yoco integration");
      } else {
        toast.error("Failed to save API keys");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Yoco Integration" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Yoco Integration"
        subtitle="Connect your Yoco payment devices to accept card payments"
        breadcrumbs={breadcrumbs}
      >
        <div className="space-y-6">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Yoco Integration"
      subtitle="Connect your Yoco payment devices to accept card payments"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6">
        {subscriptionRequired && (
          <SubscriptionGate
            feature="yoco_integration"
            message="Yoco integration requires a subscription upgrade"
            upgradeMessage="Upgrade your platform plan under Subscription to connect Yoco devices."
          />
        )}

        {showReconnectBanner && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm flex items-start justify-between gap-3">
              <span>
                <strong>Card terminals now require a one-time Yoco reconnect.</strong>{" "}
                Your existing online checkout keys keep working — tap{" "}
                <em>Connect Yoco</em> below to enable Web POS card terminals.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-900 hover:text-amber-950 shrink-0"
                onClick={handleDismissReconnectBanner}
              >
                Dismiss
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
              <h3 className="text-lg font-semibold mb-1">Connect Yoco (recommended)</h3>
              <p className="text-sm text-gray-600">
                Sign in with Yoco to enable Web POS card terminals, payments,
                refunds and webhooks. This is the only way to accept in-person
                card payments through Beautonomi.
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
                      Connected as{" "}
                      <strong>
                        {integration?.oauth_business_name ||
                          integration?.oauth_user_email ||
                          "Yoco account"}
                      </strong>
                      .
                    </div>
                    <div className="text-xs">
                      Environment: <span className="uppercase">{environment}</span>
                      {integration?.oauth_expires_at ? (
                        <>
                          {" • "}token refreshes automatically (current expiry{" "}
                          {new Date(integration.oauth_expires_at).toLocaleString()})
                        </>
                      ) : null}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleConnectOauth} disabled={isSaving}>
                  Reconnect
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleDisconnectOauth}
                  disabled={isSaving}
                  className="text-red-600 hover:text-red-700"
                >
                  Disconnect
                </Button>
              </div>
              {integration?.oauth_last_refresh_error && (
                <Alert className="mt-3 bg-red-50 border-red-200">
                  <AlertDescription className="text-red-900 text-sm">
                    Last token refresh failed:{" "}
                    {integration.oauth_last_refresh_error}. Click <em>Reconnect</em>{" "}
                    to restore Web POS access.
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <>
              <Alert className="bg-blue-50 border-blue-200 mb-4">
                <AlertDescription className="text-blue-900 text-sm">
                  We will redirect you to <strong>yoco.com</strong> to authorise
                  Beautonomi. After you approve, you can add Web POS devices and
                  start charging cards.
                </AlertDescription>
              </Alert>
              <Button onClick={handleConnectOauth} disabled={isSaving} size="lg">
                <Plug className="w-4 h-4 mr-2" />
                Connect Yoco
              </Button>
            </>
          )}
        </SectionCard>
        )}

        {/* Master enable switch — only meaningful when something is configured */}
        <SectionCard>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Integration status</h3>
              <p className="text-sm text-gray-600">
                Master toggle for Yoco payments across the salon.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Enabled
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 mr-1" /> Disabled
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
                <strong>Refunds:</strong> Card refunds for Yoco payments are
                processed in your{" "}
                <a
                  href="https://dashboard.yoco.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Yoco dashboard
                </a>
                . When you refund a payment there, we will sync the refund to
                the booking automatically.
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        {/* Connected Devices */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Payment Devices</h3>
              <p className="text-sm text-gray-600">
                {credentialMode === "oauth"
                  ? "Manage your Yoco Web POS devices"
                  : "Connect Yoco first to add physical Web POS devices, or use Hosted Checkout for online payments."}
              </p>
            </div>
            <Link href="/provider/settings/sales/yoco-devices">
              <Button variant="outline" size="sm">
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Devices
              </Button>
            </Link>
          </div>

          {devices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">No devices connected</p>
              <Link href="/provider/settings/sales/yoco-devices">
                <Button variant="outline" size="sm" className="mt-3">
                  Add Your First Device
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
                      {device.location_name || "No location"} •{" "}
                      {device.total_transactions || 0} transactions
                    </p>
                  </div>
                  <Badge variant={device.is_active ? "default" : "secondary"}>
                    {device.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
              {devices.length > 3 && (
                <Link href="/provider/settings/sales/yoco-devices">
                  <Button variant="ghost" size="sm" className="w-full">
                    View all {devices.length} devices
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
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowAdvancedKeys((v) => !v)}
          >
            <div>
              <h3 className="text-lg font-semibold mb-1">
                Advanced &middot; Hosted Checkout keys
              </h3>
              <p className="text-sm text-gray-600">
                For taking <em>online</em> card payments via Yoco's hosted
                checkout (no card terminal). Not required if you've connected
                Yoco above.
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
                  <strong>Heads up:</strong> Pasting your dashboard secret key
                  here only enables Yoco's <strong>hosted checkout pages</strong>.
                  It will <strong>NOT</strong> enable physical card terminals —
                  for that you must use the <em>Connect Yoco</em> button above.
                </AlertDescription>
              </Alert>

              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-900 text-sm">
                  <p className="font-medium mb-1">How to find your keys</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Sign in to your Yoco business dashboard.</li>
                    <li>Open the API credentials / developer settings.</li>
                    <li>Copy your live public &amp; secret keys, then paste here.</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {integration?.secret_key === "***"
                    ? "Keys saved (masked). Click Edit to update."
                    : integration?.secret_key
                      ? "Keys saved."
                      : "No keys saved."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKeys((v) => !v)}
                >
                  {showKeys ? "Cancel" : "Edit"}
                </Button>
              </div>

              {showKeys && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="secret_key">Secret Key</Label>
                    <div className="relative mt-1">
                      <Input
                        id="secret_key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder="sk_live_..."
                        value={formData.secret_key}
                        onChange={(e) =>
                          setFormData({ ...formData, secret_key: e.target.value })
                        }
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecretKey((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
                        aria-label={showSecretKey ? "Hide secret key" : "Show secret key"}
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
                    <Label htmlFor="public_key">Public Key (optional)</Label>
                    <Input
                      id="public_key"
                      type="text"
                      placeholder="pk_live_..."
                      value={formData.public_key}
                      onChange={(e) =>
                        setFormData({ ...formData, public_key: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="webhook_secret">Webhook Secret (recommended)</Label>
                    <Input
                      id="webhook_secret"
                      type="password"
                      placeholder="whsec_..."
                      value={formData.webhook_secret}
                      onChange={(e) =>
                        setFormData({ ...formData, webhook_secret: e.target.value })
                      }
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Required for automatic hosted checkout completion. Use the signing secret from your Yoco Checkout webhook.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleSaveKeys} disabled={isSaving}>
                      Save Keys
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
                      Reset
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
                  View Yoco API docs
                </a>
              </div>
            </div>
          )}
        </SectionCard>

        {integration?.connected_date && (
          <SectionCard>
            <h3 className="text-lg font-semibold mb-3">Connection Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Connected:</span>
                <span>{new Date(integration.connected_date).toLocaleDateString()}</span>
              </div>
              {integration.last_sync && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Last sync:</span>
                  <span>{new Date(integration.last_sync).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Mode:</span>
                <span className="capitalize">{credentialMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Environment:</span>
                <span className="uppercase">{environment}</span>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
