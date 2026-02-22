"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, ExternalLink, MessageSquare, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface TwilioIntegration {
  id?: string;
  account_sid: string;
  auth_token: string;
  sms_from_number?: string;
  whatsapp_from_number?: string;
  is_sms_enabled: boolean;
  is_whatsapp_enabled: boolean;
  sms_test_status: "pending" | "success" | "failed";
  whatsapp_test_status: "pending" | "success" | "failed";
  sms_test_error?: string;
  whatsapp_test_error?: string;
}

export default function TwilioIntegrationPage() {
  const [integration, setIntegration] = useState<TwilioIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  
  const [formData, setFormData] = useState({
    account_sid: "",
    auth_token: "",
    sms_from_number: "",
    whatsapp_from_number: "",
  });

  const [testPhone, setTestPhone] = useState("");
  const [testChannel, setTestChannel] = useState<"sms" | "whatsapp">("sms");
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: TwilioIntegration | null }>(
        "/api/provider/twilio-integration"
      );
      
      const data = response.data;
      if (data) {
        setIntegration(data);
        setFormData({
          account_sid: data.account_sid ? "••••••••" : "",
          auth_token: data.auth_token ? "••••••••" : "",
          sms_from_number: data.sms_from_number || "",
          whatsapp_from_number: data.whatsapp_from_number?.replace("whatsapp:", "") || "",
        });
      }
    } catch (error: any) {
      console.error("Failed to load Twilio integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load Twilio integration";
      if (error.code === "SUBSCRIPTION_REQUIRED" || errorMessage.includes("subscription")) {
        setSubscriptionRequired(true);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (!formData.account_sid || !formData.auth_token) {
      toast.error("Please fill in Account SID and Auth Token");
      return;
    }

    // Validate credentials are not masked when saving new
    if (!integration && (formData.account_sid === "••••••••" || formData.auth_token === "••••••••")) {
      toast.error("Please enter valid credentials");
      return;
    }

    // Validate Account SID format
    if (formData.account_sid !== "••••••••" && !formData.account_sid.startsWith("AC")) {
      toast.error("Account SID must start with 'AC'");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetcher.put<{ data: TwilioIntegration }>(
        "/api/provider/twilio-integration",
        {
          ...formData,
          is_sms_enabled: integration?.is_sms_enabled || false,
          is_whatsapp_enabled: integration?.is_whatsapp_enabled || false,
        }
      );
      
      setIntegration(response.data);
      toast.success("Twilio integration saved successfully");
      setShowKeys(false);
      await loadData();
    } catch (error: any) {
      console.error("Failed to save integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save Twilio integration";
      if (error.code === "SUBSCRIPTION_REQUIRED" || errorMessage.includes("subscription")) {
        setSubscriptionRequired(true);
        toast.error("Subscription upgrade required to use custom SMS/WhatsApp integrations");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (channel: "sms" | "whatsapp", enabled: boolean) => {
    if (!integration) {
      toast.error("Please configure the integration first");
      return;
    }

    // Validate required fields for the channel
    if (enabled) {
      if (channel === "sms" && !formData.sms_from_number) {
        toast.error("Please configure SMS from number first");
        return;
      }
      if (channel === "whatsapp" && !formData.whatsapp_from_number) {
        toast.error("Please configure WhatsApp from number first");
        return;
      }
    }

    try {
      setIsSaving(true);
      const response = await fetcher.put<{ data: TwilioIntegration }>(
        "/api/provider/twilio-integration",
        {
          ...formData,
          is_sms_enabled: channel === "sms" ? enabled : integration?.is_sms_enabled || false,
          is_whatsapp_enabled: channel === "whatsapp" ? enabled : integration?.is_whatsapp_enabled || false,
        }
      );
      setIntegration(response.data);
      toast.success(`${channel.toUpperCase()} ${enabled ? "enabled" : "disabled"}`);
    } catch (error: any) {
      console.error("Failed to update integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to update integration";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone) {
      toast.error("Please enter a test phone number");
      return;
    }

    // Validate phone number format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanPhone = testPhone.replace(/\D/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      toast.error("Please enter a valid phone number in E.164 format (e.g., +1234567890)");
      return;
    }

    if (!integration) {
      toast.error("Please configure the integration first");
      return;
    }

    if (testChannel === "sms" && (!integration.is_sms_enabled || !integration.sms_from_number)) {
      toast.error("Please enable and configure SMS first");
      return;
    }

    if (testChannel === "whatsapp" && (!integration.is_whatsapp_enabled || !integration.whatsapp_from_number)) {
      toast.error("Please enable and configure WhatsApp first");
      return;
    }

    try {
      setIsTesting(true);
      await fetcher.post("/api/provider/twilio-integration/test", {
        test_phone: testPhone,
        channel: testChannel,
      });
      toast.success(`Test ${testChannel.toUpperCase()} sent successfully!`);
      await loadData();
    } catch (error: any) {
      console.error("Failed to send test message:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to send test message";
      toast.error(errorMessage);
    } finally {
      setIsTesting(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Marketing Integrations", href: "/provider/settings/marketing-integrations" },
    { label: "Twilio" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title="SMS & WhatsApp Marketing Integration" subtitle="Connect Twilio to run effective SMS and WhatsApp marketing campaigns" breadcrumbs={breadcrumbs}>
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading Twilio integration settings..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Twilio Integration" subtitle="Connect Twilio for SMS and WhatsApp campaigns">
      <PageHeader
        title="SMS & WhatsApp Marketing Integration"
        subtitle="Connect Twilio to run effective SMS and WhatsApp marketing campaigns"
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6">
        {/* Subscription Gate */}
        {subscriptionRequired && (
          <SubscriptionGate
            feature="twilio_integration"
            message="Custom SMS & WhatsApp integrations require a subscription upgrade"
            upgradeMessage="Upgrade to Professional or Enterprise plan to connect your own Twilio account"
          />
        )}

        {/* SMS Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">SMS Marketing Integration</h3>
              <p className="text-sm text-gray-600">
                Enable SMS marketing campaigns using Twilio
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_sms_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 mr-1" />
                  Disabled
                </Badge>
              )}
              <Switch
                checked={integration?.is_sms_enabled || false}
                onCheckedChange={(enabled) => handleToggle("sms", enabled)}
                disabled={isSaving || !integration}
              />
            </div>
          </div>
        </SectionCard>

        {/* WhatsApp Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">WhatsApp Marketing Integration</h3>
              <p className="text-sm text-gray-600">
                Enable WhatsApp marketing campaigns using Twilio
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_whatsapp_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 mr-1" />
                  Disabled
                </Badge>
              )}
              <Switch
                checked={integration?.is_whatsapp_enabled || false}
                onCheckedChange={(enabled) => handleToggle("whatsapp", enabled)}
                disabled={isSaving || !integration}
              />
            </div>
          </div>
        </SectionCard>

        {/* Configuration */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Twilio Credentials</h3>
              <p className="text-sm text-gray-600">
                Configure your Twilio API credentials
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? "Hide" : "Show"} Credentials
            </Button>
          </div>

          {showKeys ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="account_sid">Account SID</Label>
                <Input
                  id="account_sid"
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={formData.account_sid}
                  onChange={(e) =>
                    setFormData({ ...formData, account_sid: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in your Twilio Console dashboard. Starts with "AC".
                </p>
              </div>

              <div>
                <Label htmlFor="auth_token">Auth Token</Label>
                <Input
                  id="auth_token"
                  type="password"
                  placeholder="Your Auth Token"
                  value={formData.auth_token}
                  onChange={(e) =>
                    setFormData({ ...formData, auth_token: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in your Twilio Console dashboard. Keep this token secure. Never share it publicly.
                </p>
              </div>

              <div>
                <Label htmlFor="sms_from_number">SMS From Number</Label>
                <Input
                  id="sms_from_number"
                  type="tel"
                  placeholder="+1234567890"
                  value={formData.sms_from_number}
                  onChange={(e) =>
                    setFormData({ ...formData, sms_from_number: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your Twilio phone number for sending SMS. Must be in E.164 format (e.g., +1234567890). 
                  Get a number from Twilio Console → Phone Numbers.
                </p>
              </div>

              <div>
                <Label htmlFor="whatsapp_from_number">WhatsApp From Number</Label>
                <Input
                  id="whatsapp_from_number"
                  type="tel"
                  placeholder="+14155238886"
                  value={formData.whatsapp_from_number}
                  onChange={(e) =>
                    setFormData({ ...formData, whatsapp_from_number: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your Twilio WhatsApp number in E.164 format (e.g., +14155238886). 
                  For sandbox testing, use +14155238886. For production, you need a verified WhatsApp Business number.
                  The system will automatically add the "whatsapp:" prefix.
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save Credentials
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (integration) {
                      setFormData({
                        account_sid: integration.account_sid ? "••••••••" : "",
                        auth_token: integration.auth_token ? "••••••••" : "",
                        sms_from_number: integration.sms_from_number || "",
                        whatsapp_from_number: integration.whatsapp_from_number?.replace("whatsapp:", "") || "",
                      });
                    }
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              {integration ? (
                <p>Credentials saved. Click "Show Credentials" to view or update them.</p>
              ) : (
                <p>No credentials configured. Add your Twilio credentials to get started.</p>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t space-y-2">
            <a
              href="https://www.twilio.com/docs/usage/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Twilio API Documentation
            </a>
            <a
              href="https://www.twilio.com/docs/whatsapp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Twilio WhatsApp Documentation
            </a>
          </div>
        </SectionCard>

        {/* Test Integration */}
        {integration && (
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Test Integration</h3>
                <p className="text-sm text-gray-600">
                  Send a test SMS or WhatsApp message to verify your integration
                </p>
              </div>
            </div>

            <Tabs value={testChannel} onValueChange={(v) => setTestChannel(v as "sms" | "whatsapp")}>
              <TabsList>
                <TabsTrigger value="sms">SMS</TabsTrigger>
                <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              </TabsList>
              
              <TabsContent value="sms" className="space-y-4 mt-4">
                {integration.sms_test_status === "success" && (
                  <Badge variant="default" className="bg-green-500 mb-2">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    SMS Test Passed
                  </Badge>
                )}
                {integration.sms_test_status === "failed" && (
                  <Badge variant="destructive" className="mb-2">
                    <XCircle className="w-3 h-3 mr-1" />
                    SMS Test Failed
                  </Badge>
                )}
                
                <div>
                  <Label htmlFor="test_phone_sms">Test Phone Number</Label>
                  <Input
                    id="test_phone_sms"
                    type="tel"
                    placeholder="+1234567890"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleTest} disabled={isTesting || !testPhone}>
                  {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
                  Send Test SMS
                </Button>

                {integration.sms_test_error && (
                  <Alert variant="destructive">
                    <AlertDescription>{integration.sms_test_error}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="whatsapp" className="space-y-4 mt-4">
                {integration.whatsapp_test_status === "success" && (
                  <Badge variant="default" className="bg-green-500 mb-2">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    WhatsApp Test Passed
                  </Badge>
                )}
                {integration.whatsapp_test_status === "failed" && (
                  <Badge variant="destructive" className="mb-2">
                    <XCircle className="w-3 h-3 mr-1" />
                    WhatsApp Test Failed
                  </Badge>
                )}
                
                <div>
                  <Label htmlFor="test_phone_whatsapp">Test Phone Number</Label>
                  <Input
                    id="test_phone_whatsapp"
                    type="tel"
                    placeholder="+1234567890"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleTest} disabled={isTesting || !testPhone}>
                  {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                  Send Test WhatsApp
                </Button>

                {integration.whatsapp_test_error && (
                  <Alert variant="destructive">
                    <AlertDescription>{integration.whatsapp_test_error}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </Tabs>
          </SectionCard>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
