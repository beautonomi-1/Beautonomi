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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, ExternalLink, MessageSquare, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";

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
  const { t } = useTranslation();
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
        : error?.error?.message || t("web.provider.settings.pages.integrations/twilio.failedToLoadTwilioIntegration");
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
    if (!formData.account_sid || !formData.auth_token) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseFillInAccountSidAnd"));
      return;
    }

    // Validate credentials are not masked when saving new
    if (!integration && (formData.account_sid === "••••••••" || formData.auth_token === "••••••••")) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseEnterValidCredentials"));
      return;
    }

    // Validate Account SID format
    if (formData.account_sid !== "••••••••" && !formData.account_sid.startsWith("AC")) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.accountSidMustStartWithAc"));
      return;
    }

    const smsFrom = formData.sms_from_number?.trim() || "";
    const waFrom = formData.whatsapp_from_number?.trim() || "";
    if (smsFrom && !isCompleteE164(smsFrom)) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.smsFromNumberMustBeA"));
      return;
    }
    if (waFrom && !isCompleteE164(waFrom)) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.whatsappFromNumberMustBeA"));
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
      toast.success(t("web.provider.settings.pages.integrations/twilio.twilioIntegrationSavedSuccessfully"));
      setShowKeys(false);
      await loadData();
    } catch (error: any) {
      console.error("Failed to save integration:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.integrations/twilio.failedToSaveTwilioIntegration");
      if (toastPlanGateError(error, errorMessage)) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (channel: "sms" | "whatsapp", enabled: boolean) => {
    if (!integration) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseConfigureTheIntegrationFirst"));
      return;
    }

    // Validate required fields for the channel
    if (enabled) {
      if (channel === "sms" && !formData.sms_from_number) {
        toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseConfigureSmsFromNumberFirst"));
        return;
      }
      if (channel === "whatsapp" && !formData.whatsapp_from_number) {
        toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseConfigureWhatsappFromNumberFirst"));
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
        : error?.error?.message || t("web.provider.settings.pages.integrations/twilio.failedToUpdateIntegration");
      if (toastPlanGateError(error, errorMessage)) {
        setSubscriptionRequired(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone?.trim()) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseEnterATestPhoneNumber"));
      return;
    }
    if (!isCompleteE164(testPhone)) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseEnterAValidPhoneNumber"));
      return;
    }

    if (!integration) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseConfigureTheIntegrationFirst"));
      return;
    }

    if (testChannel === "sms" && (!integration.is_sms_enabled || !integration.sms_from_number)) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseEnableAndConfigureSmsFirst"));
      return;
    }

    if (testChannel === "whatsapp" && (!integration.is_whatsapp_enabled || !integration.whatsapp_from_number)) {
      toast.error(t("web.provider.settings.pages.integrations/twilio.pleaseEnableAndConfigureWhatsappFirst"));
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
        : error?.error?.message || t("web.provider.settings.pages.integrations/twilio.failedToSendTestMessage");
      toast.error(errorMessage);
    } finally {
      setIsTesting(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.integrations/twilio.marketingIntegrations"), href: "/provider/settings/marketing-integrations" },
    { label: t("web.provider.settings.pages.integrations/twilio.twilio") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title={t("web.provider.settings.categories.marketingIntegrations.items.twilioIntegration.title")} subtitle={t("web.provider.settings.categories.marketingIntegrations.items.twilioIntegration.description")} breadcrumbs={breadcrumbs}>
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.integrations/twilio.loadingTwilioIntegrationSettings")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title={t("web.provider.settings.categories.marketingIntegrations.items.twilioIntegration.title")} subtitle={t("web.provider.settings.categories.marketingIntegrations.items.twilioIntegration.description")}>
      <PageHeader
        title={t("web.provider.settings.pages.integrations/twilio.smsWhatsappMarketingIntegration")}
        subtitle={t("web.provider.settings.pages.integrations/twilio.connectTwilioToRunEffectiveSms")}
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6">
        {/* Subscription Gate */}
        {subscriptionRequired && (
          <SubscriptionGate
            feature={t("web.provider.settings.pages.integrations/twilio.customSmsWhatsapp")}
            message={getUpgradeMessage("integrations.custom")}
          />
        )}

        {/* SMS Integration Status */}
        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/twilio.smsMarketingIntegration")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.integrations/twilio.enableSmsCampaigns")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_sms_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/twilio.enabledBadge")}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/twilio.disabledBadge")}
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
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/twilio.whatsappMarketingIntegration")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.integrations/twilio.enableWhatsappCampaigns")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {integration?.is_whatsapp_enabled ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/twilio.enabledBadge")}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 me-1" />
                  {t("web.provider.settings.pages.integrations/twilio.disabledBadge")}
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
              <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/twilio.twilioCredentials")}</h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.integrations/twilio.configureTwilioCredentials")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? t("web.provider.settings.pages.integrations/twilio.hideCredentials") : t("web.provider.settings.pages.integrations/twilio.showCredentials")}
            </Button>
          </div>

          {showKeys ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="account_sid">{t("web.provider.settings.pages.integrations/twilio.accountSid")}</Label>
                <Input
                  id="account_sid"
                  type="text"
                  placeholder={t("web.provider.settings.pages.integrations/twilio.acxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")}
                  value={formData.account_sid}
                  onChange={(e) =>
                    setFormData({ ...formData, account_sid: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.settings.pages.integrations/twilio.accountSidHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="auth_token">{t("web.provider.settings.pages.integrations/twilio.authToken")}</Label>
                <Input
                  id="auth_token"
                  type="password"
                  placeholder={t("web.provider.settings.pages.integrations/twilio.yourAuthToken")}
                  value={formData.auth_token}
                  onChange={(e) =>
                    setFormData({ ...formData, auth_token: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.settings.pages.integrations/twilio.authTokenHint")}
                </p>
              </div>

              <div>
                <PhoneInput
                  inputId="twilio-sms-from"
                  label={t("web.provider.settings.pages.integrations/twilio.smsFromNumber")}
                  placeholder={t("web.provider.settings.pages.integrations/twilio.phoneNumber")}
                  value={formData.sms_from_number}
                  onChange={(e164) =>
                    setFormData({ ...formData, sms_from_number: e164 })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.settings.pages.integrations/twilio.smsFromNumberHint")}
                </p>
              </div>

              <div>
                <PhoneInput
                  inputId="twilio-whatsapp-from"
                  label={t("web.provider.settings.pages.integrations/twilio.whatsappFromNumber")}
                  placeholder={t("web.provider.settings.pages.integrations/twilio.phoneNumber")}
                  value={formData.whatsapp_from_number}
                  onChange={(e164) =>
                    setFormData({ ...formData, whatsapp_from_number: e164 })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.settings.pages.integrations/twilio.whatsappFromNumberHint")}
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
                  {t("web.provider.settings.pages.integrations/twilio.saveCredentials")}
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
                  {t("web.provider.settings.pages.integrations/twilio.reset")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              {integration ? (
                <p>{t("web.provider.settings.pages.integrations/twilio.credentialsSavedHint")}</p>
              ) : (
                <p>{t("web.provider.settings.pages.integrations/twilio.noCredentialsHint")}</p>
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
              {t("web.provider.settings.pages.integrations/twilio.viewTwilioApiDocs")}
            </a>
            <a
              href="https://www.twilio.com/docs/whatsapp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-pink-600 hover:text-pink-700 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {t("web.provider.settings.pages.integrations/twilio.viewTwilioWhatsappDocs")}
            </a>
          </div>
        </SectionCard>

        {/* Test Integration */}
        {integration && (
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">{t("web.provider.settings.pages.integrations/twilio.testIntegration")}</h3>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.pages.integrations/twilio.sendTestHint")}
                </p>
              </div>
            </div>

            <Tabs value={testChannel} onValueChange={(v) => setTestChannel(v as "sms" | "whatsapp")}>
              <TabsList>
                <TabsTrigger value="sms">{t("web.provider.settings.pages.integrations/twilio.sms")}</TabsTrigger>
                <TabsTrigger value="whatsapp">{t("web.provider.settings.pages.integrations/twilio.whatsapp")}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="sms" className="space-y-4 mt-4">
                {integration.sms_test_status === "success" && (
                  <Badge variant="default" className="bg-green-500 mb-2">
                    <CheckCircle2 className="w-3 h-3 me-1" />
                    {t("web.provider.settings.pages.integrations/twilio.smsTestPassed")}
                  </Badge>
                )}
                {integration.sms_test_status === "failed" && (
                  <Badge variant="destructive" className="mb-2">
                    <XCircle className="w-3 h-3 me-1" />
                    {t("web.provider.settings.pages.integrations/twilio.smsTestFailed")}
                  </Badge>
                )}
                
                <div>
                  <PhoneInput
                    inputId="twilio-test-phone-sms"
                    label={t("web.provider.settings.pages.integrations/twilio.testPhoneNumber")}
                    placeholder={t("web.provider.settings.pages.integrations/twilio.phoneNumber")}
                    value={testPhone}
                    onChange={setTestPhone}
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleTest} disabled={isTesting || !isCompleteE164(testPhone)}>
                  {isTesting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Phone className="w-4 h-4 me-2" />}
                  {t("web.provider.settings.pages.integrations/twilio.sendTestSms")}
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
                    <CheckCircle2 className="w-3 h-3 me-1" />
                    {t("web.provider.settings.pages.integrations/twilio.whatsappTestPassed")}
                  </Badge>
                )}
                {integration.whatsapp_test_status === "failed" && (
                  <Badge variant="destructive" className="mb-2">
                    <XCircle className="w-3 h-3 me-1" />
                    {t("web.provider.settings.pages.integrations/twilio.whatsappTestFailed")}
                  </Badge>
                )}
                
                <div>
                  <PhoneInput
                    inputId="twilio-test-phone-whatsapp"
                    label={t("web.provider.settings.pages.integrations/twilio.testPhoneNumber")}
                    placeholder={t("web.provider.settings.pages.integrations/twilio.phoneNumber")}
                    value={testPhone}
                    onChange={setTestPhone}
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleTest} disabled={isTesting || !isCompleteE164(testPhone)}>
                  {isTesting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <MessageSquare className="w-4 h-4 me-2" />}
                  {t("web.provider.settings.pages.integrations/twilio.sendTestWhatsapp")}
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
