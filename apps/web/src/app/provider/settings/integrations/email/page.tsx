"use client";

import { useTranslation } from "@beautonomi/i18n";
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
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
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
  const { t } = useTranslation();
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
        : error?.error?.message || t("web.provider.settings.pages.integrations/email.loadFailed");
      if (error instanceof FetchError && isPlanGateErrorCode(error.code)) {
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
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseFillInAllRequiredFields"));
      return;
    }

    // Validate API key is not masked when saving new
    if (!integration && formData.api_key === "••••••••") {
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseEnterAValidApiKey"));
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
      toast.success(t("web.provider.settings.pages.integrations/email.emailIntegrationSavedSuccessfully"));
      setShowKeys(false);
      await loadData();
    } catch (error: any) {
      console.error("Failed to save integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.integrations/email.saveFailed");
      if (toastPlanGateError(error, errorMessage)) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!integration) {
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseConfigureTheIntegrationFirst"));
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
      toast.success(enabled ? t("web.provider.settings.pages.integrations/email.enabled") : t("web.provider.settings.pages.integrations/email.disabled"));
    } catch (error: any) {
      console.error("Failed to update integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.integrations/email.updateFailed");
      if (toastPlanGateError(error, errorMessage)) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseEnterATestEmailAddress"));
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseEnterAValidEmailAddress"));
      return;
    }

    if (!integration || !integration.is_enabled) {
      toast.error(t("web.provider.settings.pages.integrations/email.pleaseEnableTheIntegrationFirst"));
      return;
    }

    try {
      setIsTesting(true);
      await fetcher.post("/api/provider/email-integration/test", {
        test_email: testEmail,
      });
      toast.success(t("web.provider.settings.pages.integrations/email.testEmailSentSuccessfully"));
      await loadData();
    } catch (error: any) {
      console.error("Failed to send test email:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.integrations/email.testFailed");
      toast.error(errorMessage);
    } finally {
      setIsTesting(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.integrations/email.marketingIntegrations"), href: "/provider/settings/marketing-integrations" },
    { label: t("web.provider.settings.pages.integrations/email.email") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title={t("web.provider.settings.categories.marketingIntegrations.items.emailIntegration.title")} subtitle={t("web.provider.settings.categories.marketingIntegrations.items.emailIntegration.description")} breadcrumbs={breadcrumbs}>
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.integrations/email.loadingEmailIntegrationSettings")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title={t("web.provider.settings.categories.marketingIntegrations.items.emailIntegration.title")} subtitle={t("web.provider.settings.categories.marketingIntegrations.items.emailIntegration.description")}>
      <PageHeader
        title={t("web.provider.settings.pages.integrations/email.emailMarketingIntegration")}
        subtitle={t("web.provider.settings.pages.integrations/email.connectSendgridOrMailchimpToRun")}
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6">
        {/* Subscription Gate */}
        {subscriptionRequired && (
          <SubscriptionGate
            feature={t("web.provider.settings.pages.integrations/email.customEmailIntegrations")}
            message={getUpgradeMessage("integrations.custom")}
          />
        )}

        {/* Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/email.emailMarketingIntegration")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.integrations/email.enableCampaignsHint")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/email.connected")}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/email.disconnected")}
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
                {t("web.provider.settings.pages.integrations/email.activeHint")}
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        {/* Provider Selection & Configuration */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/email.providerConfiguration")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.integrations/email.chooseProviderHint")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? t("web.provider.settings.pages.integrations/email.hideConfiguration") : t("web.provider.settings.pages.integrations/email.showConfiguration")}
            </Button>
          </div>

          {showKeys ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider_name">{t("web.provider.settings.pages.integrations/email.emailProvider")}</Label>
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
                    <SelectItem value="sendgrid">{t("web.provider.settings.pages.integrations/email.sendGrid")}</SelectItem>
                    <SelectItem value="mailchimp">{t("web.provider.settings.pages.integrations/email.mailchimpTransactional")}</SelectItem>
                  </SelectContent>
                </Select>
                {formData.provider_name === "mailchimp" && (
                  <p className="text-xs text-blue-600 mt-1">
                    {t("web.provider.settings.pages.integrations/email.mailchimpNote")}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="api_key">
                  {formData.provider_name === "sendgrid" ? t("web.provider.settings.pages.integrations/email.sendGridApiKey") : t("web.provider.settings.pages.integrations/email.mailchimpApiKey")}
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
                    ? t("web.provider.settings.pages.integrations/email.sendGridKeyHint")
                    : t("web.provider.settings.pages.integrations/email.mailchimpKeyHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="from_email">{t("web.provider.settings.pages.integrations/email.fromEmail")}</Label>
                <Input
                  id="from_email"
                  type="email"
                  placeholder={t("web.provider.settings.pages.integrations/email.noreplyYourbusinessCom")}
                  value={formData.from_email}
                  onChange={(e) =>
                    setFormData({ ...formData, from_email: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.provider_name === "sendgrid" 
                    ? t("web.provider.settings.pages.integrations/email.sendGridFromHint")
                    : t("web.provider.settings.pages.integrations/email.mailchimpFromHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="from_name">{t("web.provider.settings.pages.integrations/email.fromName")}</Label>
                <Input
                  id="from_name"
                  type="text"
                  placeholder={t("web.provider.settings.pages.integrations/email.beautonomi")}
                  value={formData.from_name}
                  onChange={(e) =>
                    setFormData({ ...formData, from_name: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
                  {t("web.provider.settings.pages.integrations/email.saveConfiguration")}
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
                  {t("web.provider.common.reset")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              {integration ? (
                <p>{t("web.provider.settings.pages.integrations/email.savedShowHint")}</p>
              ) : (
                <p>{t("web.provider.settings.pages.integrations/email.noConfigHint")}</p>
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
                {t("web.provider.settings.pages.integrations/email.viewSendGridDocs")}
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
                  {t("web.provider.settings.pages.integrations/email.viewMailchimpDocs")}
                </a>
                <p className="text-xs text-gray-500">
                  {t("web.provider.settings.pages.integrations/email.mailchimpDocsHint")}
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
                <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/email.testIntegration")}</h3>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.pages.integrations/email.testHint")}
                </p>
              </div>
              {integration.test_status === "success" && (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/email.testPassed")}
                </Badge>
              )}
              {integration.test_status === "failed" && (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/email.testFailedBadge")}
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="test_email">{t("web.provider.settings.pages.integrations/email.testEmailAddress")}</Label>
                <Input
                  id="test_email"
                  type="email"
                  placeholder={t("web.provider.settings.pages.integrations/email.yourEmailCom")}
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Button onClick={handleTest} disabled={isTesting || !testEmail}>
                {isTesting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Mail className="w-4 h-4 me-2" />}
                {t("web.provider.settings.pages.integrations/email.sendTestEmail")}
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
