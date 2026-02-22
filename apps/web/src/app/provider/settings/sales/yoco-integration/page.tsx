"use client";

import React, { useState, useEffect } from "react";
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
import { CheckCircle2, XCircle, ExternalLink, CreditCard } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";

export default function YocoIntegrationPage() {
  const [integration, setIntegration] = useState<YocoIntegration | null>(null);
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  
  const [formData, setFormData] = useState({
    secret_key: "",
    public_key: "",
    webhook_secret: "",
  });

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [integrationData, devicesData] = await Promise.all([
          providerApi.getYocoIntegration(),
          providerApi.listYocoDevices(),
        ]);
        
        // Only update state if component is still mounted
        if (!isMounted) return;
        
        setIntegration(integrationData);
        setDevices(devicesData);
        // Only populate form if keys are not masked (API returns "***" for security)
        // If masked, leave form empty so user can enter keys
        setFormData({
          secret_key: integrationData.secret_key && integrationData.secret_key !== "***" ? integrationData.secret_key : "",
          public_key: integrationData.public_key && integrationData.public_key !== "***" ? integrationData.public_key : "",
          webhook_secret: integrationData.webhook_secret && integrationData.webhook_secret !== "***" ? integrationData.webhook_secret : "",
        });
      } catch (error: any) {
        // Don't update state or show errors if component unmounted
        if (!isMounted) return;
        
        // Ignore AbortError (cancelled requests)
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          return;
        }
        
        console.error("Failed to load Yoco integration:", error);
        if (error?.code === "SUBSCRIPTION_REQUIRED" || error?.error?.code === "SUBSCRIPTION_REQUIRED") {
          setSubscriptionRequired(true);
        } else if (error?.name !== 'FetchTimeoutError' || !(error as any).__cancelled) {
          // Only show error if not a cancelled request
          toast.error("Failed to load Yoco integration");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = async (enabled: boolean) => {
    try {
      setIsSaving(true);
      const updated = await providerApi.updateYocoIntegration({ is_enabled: enabled });
      setIntegration(updated);
      invalidateSetupStatusCache();
      toast.success(enabled ? "Yoco integration enabled" : "Yoco integration disabled");
    } catch (error: any) {
      console.error("Failed to update integration:", error);
      if (error?.code === "SUBSCRIPTION_REQUIRED" || error?.error?.code === "SUBSCRIPTION_REQUIRED") {
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
      toast.success("API keys saved successfully");
      setShowKeys(false);
    } catch (error: any) {
      console.error("Failed to save keys:", error);
      if (error?.code === "SUBSCRIPTION_REQUIRED" || error?.error?.code === "SUBSCRIPTION_REQUIRED") {
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
        {/* Subscription Gate */}
        {subscriptionRequired && (
          <SubscriptionGate
            feature="yoco_integration"
            message="Yoco integration requires a subscription upgrade"
            upgradeMessage="Upgrade to Starter plan or higher to connect Yoco payment devices"
          />
        )}

        {/* Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Yoco Integration</h3>
              <p className="text-sm text-gray-600">
                Enable Yoco Web POS to accept card payments on your devices
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 mr-1" />
                  Disconnected
                </Badge>
              )}
              <Switch
                checked={integration?.is_enabled || false}
                onCheckedChange={handleToggle}
                disabled={isSaving}
              />
            </div>
          </div>

          {integration?.is_enabled && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Yoco integration is active. You can now process payments through your connected devices.
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        {/* API Keys */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">API Credentials</h3>
              <p className="text-sm text-gray-600">
                Your Yoco API keys for secure payment processing
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? "Hide" : "Show"} Keys
            </Button>
          </div>

          {showKeys ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="secret_key">Secret Key</Label>
                <Input
                  id="secret_key"
                  type="password"
                  placeholder="sk_live_..."
                  value={formData.secret_key}
                  onChange={(e) =>
                    setFormData({ ...formData, secret_key: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Keep this key secure. Never share it publicly.
                </p>
              </div>

              <div>
                <Label htmlFor="public_key">Public Key</Label>
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
                <Label htmlFor="webhook_secret">Webhook Secret (Optional)</Label>
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
                <p className="text-xs text-gray-500 mt-1">
                  Used to verify webhook requests from Yoco
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveKeys} disabled={isSaving}>
                  Save Keys
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset to empty if keys are masked, otherwise reset to current values
                    setFormData({
                      secret_key: integration?.secret_key && integration.secret_key !== "***" ? integration.secret_key : "",
                      public_key: integration?.public_key && integration.public_key !== "***" ? integration.public_key : "",
                      webhook_secret: integration?.webhook_secret && integration.webhook_secret !== "***" ? integration.webhook_secret : "",
                    });
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              {integration?.secret_key && integration.secret_key !== "***" ? (
                <p>API keys are configured. Click "Show Keys" to view or update them.</p>
              ) : integration?.secret_key === "***" ? (
                <p>API keys are configured (masked for security). Click "Show Keys" to update them.</p>
              ) : (
                <p>No API keys configured. Add your Yoco API credentials to get started.</p>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t">
            <a
              href="https://developer.yoco.com/api-reference"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Yoco API Documentation
            </a>
          </div>
        </SectionCard>

        {/* Connected Devices */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Payment Devices</h3>
              <p className="text-sm text-gray-600">
                Manage your Yoco Web POS devices
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
                      {device.location_name || "No location"} • {device.total_transactions || 0} transactions
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

        {/* Connection Info */}
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
                  <span className="text-gray-600">Last Sync:</span>
                  <span>{new Date(integration.last_sync).toLocaleString()}</span>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
