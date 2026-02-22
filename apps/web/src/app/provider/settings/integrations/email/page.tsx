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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ExternalLink, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface EmailIntegration {
  id?: string;
  provider_name: "sendgrid" | "mailchimp";
  api_key: string;
  api_secret?: string;
  from_email: string;
  from_name: string;
  is_enabled: boolean;
  test_status: "pending" | "success" | "failed";
  test_error?: string;
}

export default function EmailIntegrationPage() {
  const [integration, setIntegration] = useState<EmailIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  
  const [formData, setFormData] = useState({
    provider_name: "sendgrid" as "sendgrid" | "mailchimp",
    api_key: "",
    api_secret: "",
    from_email: "",
    from_name: "Beautonomi",
  });

  const [testEmail, setTestEmail] = useState("");
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: EmailIntegration | null }>(
        "/api/provider/email-integration"
      );
      
      const data = response.data;
      if (data) {
        setIntegration(data);
        setFormData({
          provider_name: data.provider_name,
          api_key: data.api_key ? "••••••••" : "",
          api_secret: data.api_secret ? "••••••••" : "",
          from_email: data.from_email || "",
          from_name: data.from_name || "Beautonomi",
        });
      }
    } catch (error: any) {
      console.error("Failed to load email integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load email integration";
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
    if (!formData.provider_name || !formData.api_key || !formData.from_email) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate API key is not masked when saving new
    if (!integration && formData.api_key === "••••••••") {
      toast.error("Please enter a valid API key");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetcher.put<{ data: EmailIntegration }>(
        "/api/provider/email-integration",
        {
          ...formData,
          is_enabled: integration?.is_enabled || false,
        }
      );
      
      setIntegration(response.data);
      toast.success("Email integration saved successfully");
      setShowKeys(false);
      await loadData();
    } catch (error: any) {
      console.error("Failed to save integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save email integration";
      if (error.code === "SUBSCRIPTION_REQUIRED" || errorMessage.includes("subscription")) {
        setSubscriptionRequired(true);
        toast.error("Subscription upgrade required to use custom email integrations");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!integration) {
      toast.error("Please configure the integration first");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetcher.put<{ data: EmailIntegration }>(
        "/api/provider/email-integration",
        {
          ...formData,
          is_enabled: enabled,
        }
      );
      setIntegration(response.data);
      toast.success(enabled ? "Email integration enabled" : "Email integration disabled");
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
    if (!testEmail) {
      toast.error("Please enter a test email address");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!integration || !integration.is_enabled) {
      toast.error("Please enable the integration first");
      return;
    }

    try {
      setIsTesting(true);
      await fetcher.post("/api/provider/email-integration/test", {
        test_email: testEmail,
      });
      toast.success("Test email sent successfully!");
      await loadData();
    } catch (error: any) {
      console.error("Failed to send test email:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to send test email";
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
    { label: "Email" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title="Email Marketing Integration" subtitle="Connect SendGrid or Mailchimp to run effective email marketing campaigns" breadcrumbs={breadcrumbs}>
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading email integration settings..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Email Integration" subtitle="Connect SendGrid or Mailchimp for email campaigns">
      <PageHeader
        title="Email Marketing Integration"
        subtitle="Connect SendGrid or Mailchimp to run effective email marketing campaigns"
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6">
        {/* Subscription Gate */}
        {subscriptionRequired && (
          <SubscriptionGate
            feature="email_integration"
            message="Custom email integrations require a subscription upgrade"
            upgradeMessage="Upgrade to Professional or Enterprise plan to connect your own SendGrid or Mailchimp account"
          />
        )}

        {/* Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Email Marketing Integration</h3>
              <p className="text-sm text-gray-600">
                Enable email marketing campaigns using SendGrid or Mailchimp
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
                disabled={isSaving || !integration}
              />
            </div>
          </div>

          {integration?.is_enabled && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Email marketing integration is active. You can now run email marketing campaigns to your clients.
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        {/* Provider Selection & Configuration */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Provider Configuration</h3>
              <p className="text-sm text-gray-600">
                Choose your email service provider and configure API credentials
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? "Hide" : "Show"} Configuration
            </Button>
          </div>

          {showKeys ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider_name">Email Provider</Label>
                <Select
                  value={formData.provider_name}
                  onValueChange={(value: "sendgrid" | "mailchimp") =>
                    setFormData({ ...formData, provider_name: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="mailchimp">Mailchimp (Transactional/Mandrill)</SelectItem>
                  </SelectContent>
                </Select>
                {formData.provider_name === "mailchimp" && (
                  <p className="text-xs text-blue-600 mt-1">
                    Note: For programmatic email sending, Mailchimp uses the Transactional API (Mandrill). 
                    Get your API key from Mailchimp → Account → Extras → API keys → Transactional API.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="api_key">
                  {formData.provider_name === "sendgrid" ? "SendGrid API Key" : "Mailchimp API Key"}
                </Label>
                <Input
                  id="api_key"
                  type="password"
                  placeholder={formData.provider_name === "sendgrid" ? "SG.xxx..." : "xxxx-us1 (includes datacenter)"}
                  value={formData.api_key}
                  onChange={(e) =>
                    setFormData({ ...formData, api_key: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.provider_name === "sendgrid" 
                    ? "Get your API key from SendGrid Settings → API Keys. Keep this key secure."
                    : "Get your API key from Mailchimp Account → Extras → API keys. Format: xxxxx-us1 (includes datacenter)."}
                </p>
              </div>

              <div>
                <Label htmlFor="from_email">From Email Address</Label>
                <Input
                  id="from_email"
                  type="email"
                  placeholder="noreply@yourbusiness.com"
                  value={formData.from_email}
                  onChange={(e) =>
                    setFormData({ ...formData, from_email: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.provider_name === "sendgrid" 
                    ? "This email must be verified in your SendGrid account (Settings → Sender Authentication)"
                    : "This email must be verified in your Mailchimp account. For Mandrill, use your verified sending domain."}
                </p>
              </div>

              <div>
                <Label htmlFor="from_name">From Name</Label>
                <Input
                  id="from_name"
                  type="text"
                  placeholder="Beautonomi"
                  value={formData.from_name}
                  onChange={(e) =>
                    setFormData({ ...formData, from_name: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save Configuration
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (integration) {
                      setFormData({
                        provider_name: integration.provider_name,
                        api_key: integration.api_key ? "••••••••" : "",
                        api_secret: "",
                        from_email: integration.from_email || "",
                        from_name: integration.from_name || "Beautonomi",
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
                <p>Configuration saved. Click "Show Configuration" to view or update it.</p>
              ) : (
                <p>No configuration found. Add your email provider credentials to get started.</p>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t space-y-2">
            {formData.provider_name === "sendgrid" ? (
              <a
                href="https://docs.sendgrid.com/api-reference/mail-send/mail-send"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View SendGrid API Documentation
              </a>
            ) : (
              <div className="space-y-2">
                <a
                  href="https://mailchimp.com/developer/transactional/api/messages/send-new-message/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Mailchimp Transactional API Documentation
                </a>
                <p className="text-xs text-gray-500">
                  We use Mailchimp Transactional (Mandrill) for sending marketing emails programmatically.
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Test Integration */}
        {integration && (
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Test Integration</h3>
                <p className="text-sm text-gray-600">
                  Send a test email to verify your integration is working
                </p>
              </div>
              {integration.test_status === "success" && (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Test Passed
                </Badge>
              )}
              {integration.test_status === "failed" && (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  Test Failed
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="test_email">Test Email Address</Label>
                <Input
                  id="test_email"
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Button onClick={handleTest} disabled={isTesting || !testEmail}>
                {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Test Email
              </Button>

              {integration.test_error && (
                <Alert variant="destructive">
                  <AlertDescription>{integration.test_error}</AlertDescription>
                </Alert>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
