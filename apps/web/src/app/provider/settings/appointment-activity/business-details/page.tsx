"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";

interface BusinessDetailsData {
  providerId?: string;
  businessName: string;
  timezone: string;
  timeFormat: "12h" | "24h";
  weekStart: "monday" | "sunday";
  appointmentColorSource: "service" | "team" | "client";
  clientNotificationLanguage: string;
  defaultTeamLanguage: string;
  website: string;
  facebook: string;
  instagram: string;
  x: string;
  linkedin: string;
  other: string;
  yearsInBusiness: number | null;
  languagesSpoken: string[];
}

export default function BusinessDetailsSettings() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<BusinessDetailsData>({
    businessName: "",
    timezone: "Africa/Johannesburg",
    timeFormat: "24h",
    weekStart: "monday",
    appointmentColorSource: "service",
    clientNotificationLanguage: "en",
    defaultTeamLanguage: "en",
    website: "",
    facebook: "",
    instagram: "",
    x: "",
    linkedin: "",
    other: "",
    yearsInBusiness: null,
    languagesSpoken: ["English"],
  });
  const [originalData, setOriginalData] = useState<BusinessDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezones, setTimezones] = useState<string[]>([]);

  useEffect(() => {
    loadData();
    loadTimezones();
  }, []);

  const loadTimezones = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ name: string; code: string }> }>(
        "/api/public/preference-options?type=timezone"
      );
      // Extract IANA timezone codes from the response
      const tzList = response.data?.map(t => t.code || t.name).filter((tz): tz is string => Boolean(tz && tz.trim() !== "")) || [
        "Africa/Johannesburg",
        "Africa/Cape_Town",
        "Africa/Lagos",
        "Africa/Nairobi",
        "Africa/Cairo",
        "UTC",
      ];
      setTimezones(tzList);
    } catch {
      // Fallback to common timezones
      setTimezones([
        "Africa/Johannesburg",
        "Africa/Cape_Town",
        "Africa/Lagos",
        "Africa/Nairobi",
        "Africa/Cairo",
        "UTC",
      ]);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: BusinessDetailsData }>(
        "/api/provider/settings/business-details"
      );
      const data = response.data;
      setFormData(data);
      setOriginalData(data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.appointment-activity/business-details.failedToLoadBusinessDetails");
      setError(errorMessage);
      console.error("Error loading business details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/business-details", formData);
      setOriginalData(formData);
      invalidateSetupStatusCache();
      toast.success(t("web.provider.settings.pages.appointment-activity/business-details.businessDetailsUpdatedSuccessfully"));
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.appointment-activity/business-details.failedToUpdate");
      toast.error(errorMessage);
      console.error("Error saving business details:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = originalData && JSON.stringify(formData) !== JSON.stringify(originalData);

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.appointment-activity/business-details.businessDetails2") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.businessDetails.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.businessDetails.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.appointment-activity/business-details.loadingBusinessDetails")} />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalData) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.businessDetails.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.businessDetails.description")}
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title={t("web.provider.settings.pages.appointment-activity/business-details.failedToLoadBusinessDetails")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.appointment-activity/business-details.businessDetails")}
      subtitle={t("web.provider.settings.pages.appointment-activity/business-details.configureYourBusinessInformationAndPreferences")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      {/* Business Information */}
      <SectionCard title={t("web.provider.settings.pages.appointment-activity/business-details.businessInformation")} className="w-full">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="businessName" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.businessName")}
            </Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              className="mt-1 w-full"
              placeholder={t("web.provider.settings.pages.appointment-activity/business-details.enterYourBusinessName")}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="timezone" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.timezone")}
              </Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder={t("web.provider.settings.pages.appointment-activity/business-details.selectTimezone")} />
                </SelectTrigger>
                <SelectContent>
                  {timezones.filter(tz => tz && tz.trim() !== "").map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="timeFormat" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.timeFormat")}
              </Label>
              <Select
                value={formData.timeFormat}
                onValueChange={(value) => setFormData({ ...formData, timeFormat: value as "12h" | "24h" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t("web.provider.settings.pages.appointment-activity/business-details.hour24")}</SelectItem>
                  <SelectItem value="12h">{t("web.provider.settings.pages.appointment-activity/business-details.hour12")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="weekStart" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.weekStart")}
              </Label>
              <Select
                value={formData.weekStart}
                onValueChange={(value) => setFormData({ ...formData, weekStart: value as "monday" | "sunday" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">{t("web.provider.settings.pages.appointment-activity/business-details.monday")}</SelectItem>
                  <SelectItem value="sunday">{t("web.provider.settings.pages.appointment-activity/business-details.sunday")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="appointmentColorSource" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.appointmentColorSource")}
              </Label>
              <Select
                value={formData.appointmentColorSource}
                onValueChange={(value) => setFormData({ ...formData, appointmentColorSource: value as "service" | "team" | "client" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">{t("web.provider.common.service")}</SelectItem>
                  <SelectItem value="team">{t("web.provider.settings.pages.calendar/display-preferences.teamMember")}</SelectItem>
                  <SelectItem value="client">{t("web.provider.settings.pages.appointment-activity/business-details.client")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Custom fields (platform-defined extra info) */}
      {formData.providerId && (
        <SectionCard title={t("web.provider.settings.pages.appointment-activity/business-details.additionalInformation")} className="w-full">
          <p className="text-sm text-muted-foreground mb-4">
            {t("web.provider.settings.pages.appointment-activity/business-details.extraFieldsHint")}
          </p>
          <CustomFieldsForm
            entityType="provider"
            entityId={formData.providerId}
            showSaveButton={true}
          />
        </SectionCard>
      )}

      {/* Language Settings */}
      <SectionCard title={t("web.provider.settings.pages.appointment-activity/business-details.languageSettings")} className="w-full">
        <Alert className="mb-4 sm:mb-6 border-primary/20 bg-primary/5">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            {t("web.provider.settings.pages.appointment-activity/business-details.languageSettingsAlert")}
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <Label htmlFor="clientNotificationLanguage" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.clientNotificationLanguage")}
            </Label>
            <Select
              value={formData.clientNotificationLanguage}
              onValueChange={(value) => setFormData({ ...formData, clientNotificationLanguage: value })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("web.provider.settings.pages.appointment-activity/business-details.langEnglish")}</SelectItem>
                <SelectItem value="af">{t("web.provider.settings.pages.appointment-activity/business-details.langAfrikaans")}</SelectItem>
                <SelectItem value="zu">{t("web.provider.settings.pages.appointment-activity/business-details.langZulu")}</SelectItem>
                <SelectItem value="xh">{t("web.provider.settings.pages.appointment-activity/business-details.langXhosa")}</SelectItem>
                <SelectItem value="st">{t("web.provider.settings.pages.appointment-activity/business-details.langSesotho")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="defaultTeamLanguage" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.defaultTeamLanguage")}
            </Label>
            <Select
              value={formData.defaultTeamLanguage}
              onValueChange={(value) => setFormData({ ...formData, defaultTeamLanguage: value })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("web.provider.settings.pages.appointment-activity/business-details.langEnglish")}</SelectItem>
                <SelectItem value="af">{t("web.provider.settings.pages.appointment-activity/business-details.langAfrikaans")}</SelectItem>
                <SelectItem value="zu">{t("web.provider.settings.pages.appointment-activity/business-details.langZulu")}</SelectItem>
                <SelectItem value="xh">{t("web.provider.settings.pages.appointment-activity/business-details.langXhosa")}</SelectItem>
                <SelectItem value="st">{t("web.provider.settings.pages.appointment-activity/business-details.langSesotho")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Online Links */}
      <SectionCard title={t("web.provider.settings.pages.appointment-activity/business-details.onlineLinks")} className="w-full">
        <Alert className="mb-4 sm:mb-6 border-primary/20 bg-primary/5">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            {t("web.provider.settings.pages.appointment-activity/business-details.socialLinksHint")}
          </AlertDescription>
        </Alert>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="website" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.website")}
            </Label>
            <Input
              id="website"
              type="url"
              placeholder={t("web.provider.settings.pages.appointment-activity/business-details.httpsWwwExampleCom")}
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="facebook" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.facebook")}
              </Label>
              <Input
                id="facebook"
                type="url"
                placeholder={t("web.provider.settings.pages.appointment-activity/business-details.httpsFacebookCom")}
                value={formData.facebook}
                onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="instagram" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.instagram")}
              </Label>
              <Input
                id="instagram"
                type="url"
                placeholder={t("web.provider.settings.pages.appointment-activity/business-details.httpsInstagramCom")}
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="x" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.x")}
              </Label>
              <Input
                id="x"
                type="url"
                placeholder={t("web.provider.settings.pages.appointment-activity/business-details.httpsXCom")}
                value={formData.x}
                onChange={(e) => setFormData({ ...formData, x: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="linkedin" className="text-sm sm:text-base">
                {t("web.provider.settings.pages.appointment-activity/business-details.linkedin")}
              </Label>
              <Input
                id="linkedin"
                type="url"
                placeholder={t("web.provider.settings.pages.appointment-activity/business-details.httpsLinkedinCom")}
                value={formData.linkedin}
                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="other" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.other")}
            </Label>
            <Input
              id="other"
              type="url"
              placeholder={t("web.provider.settings.pages.appointment-activity/business-details.https")}
              value={formData.other}
              onChange={(e) => setFormData({ ...formData, other: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
        </div>
      </SectionCard>

      {/* Business Profile Information */}
      <SectionCard title={t("web.provider.settings.pages.appointment-activity/business-details.businessProfileInformation")} className="w-full">
        <Alert className="mb-4 sm:mb-6 border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            {t("web.provider.settings.pages.appointment-activity/business-details.profileInfoHint")}
          </AlertDescription>
        </Alert>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="yearsInBusiness" className="text-sm sm:text-base">
              {t("web.provider.settings.pages.appointment-activity/business-details.yearsInBusiness")}
            </Label>
            <Select
              value={formData.yearsInBusiness?.toString() || "none"}
              onValueChange={(value) => setFormData({ ...formData, yearsInBusiness: value === "none" ? null : parseInt(value) })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder={t("web.provider.settings.pages.appointment-activity/business-details.selectYears")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("web.provider.settings.pages.appointment-activity/business-details.notSpecified")}</SelectItem>
                <SelectItem value="0">{t("web.provider.settings.pages.appointment-activity/business-details.justStarting")}</SelectItem>
                <SelectItem value="1">{t("web.provider.settings.pages.appointment-activity/business-details.year1")}</SelectItem>
                <SelectItem value="2">{t("web.provider.settings.pages.appointment-activity/business-details.years2")}</SelectItem>
                <SelectItem value="3">{t("web.provider.settings.pages.appointment-activity/business-details.years3")}</SelectItem>
                <SelectItem value="4">{t("web.provider.settings.pages.appointment-activity/business-details.years4")}</SelectItem>
                <SelectItem value="5">{t("web.provider.settings.pages.appointment-activity/business-details.years5")}</SelectItem>
                <SelectItem value="6">{t("web.provider.settings.pages.appointment-activity/business-details.years6to10")}</SelectItem>
                <SelectItem value="11">{t("web.provider.settings.pages.appointment-activity/business-details.years11to15")}</SelectItem>
                <SelectItem value="16">{t("web.provider.settings.pages.appointment-activity/business-details.years16to20")}</SelectItem>
                <SelectItem value="21">{t("web.provider.settings.pages.appointment-activity/business-details.years20plus")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {t("web.provider.settings.pages.appointment-activity/business-details.experienceHint")}
            </p>
          </div>
          <div>
            <Label htmlFor="languagesSpoken" className="text-sm sm:text-base mb-2 block">
              {t("web.provider.settings.pages.appointment-activity/business-details.languagesYouSpeak")}
            </Label>
            <p className="text-xs text-gray-600 mb-2">
              {t("web.provider.settings.pages.appointment-activity/business-details.languagesHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {["English", "Afrikaans", "Zulu", "Xhosa", "Sesotho", "Tswana", "Venda", "Tsonga", "Swati", "Ndebele", "Southern Sotho", "Northern Sotho"].map((lang) => {
                const isSelected = (formData.languagesSpoken || ["English"]).includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      const current = formData.languagesSpoken || ["English"];
                      if (isSelected) {
                        // Don't allow removing if it's the only one
                        if (current.length > 1) {
                          setFormData({ ...formData, languagesSpoken: current.filter((l) => l !== lang) });
                        }
                      } else {
                        setFormData({ ...formData, languagesSpoken: [...current, lang] });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-primary text-white border-2 border-primary"
                        : "bg-white text-gray-700 border-2 border-gray-300 hover:border-primary hover:text-primary"
                    } ${isSelected && (formData.languagesSpoken || ["English"]).length === 1 ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                    disabled={isSelected && (formData.languagesSpoken || ["English"]).length === 1}
                    title={isSelected && (formData.languagesSpoken || ["English"]).length === 1 ? t("web.provider.settings.pages.appointment-activity/business-details.atLeastOneLanguage") : ""}
                  >
                    {t({
                      English: "web.provider.settings.pages.appointment-activity/business-details.langEnglish",
                      Afrikaans: "web.provider.settings.pages.appointment-activity/business-details.langAfrikaans",
                      Zulu: "web.provider.settings.pages.appointment-activity/business-details.langZulu",
                      Xhosa: "web.provider.settings.pages.appointment-activity/business-details.langXhosa",
                      Sesotho: "web.provider.settings.pages.appointment-activity/business-details.langSesotho",
                      Tswana: "web.provider.settings.pages.appointment-activity/business-details.langTswana",
                      Venda: "web.provider.settings.pages.appointment-activity/business-details.langVenda",
                      Tsonga: "web.provider.settings.pages.appointment-activity/business-details.langTsonga",
                      Swati: "web.provider.settings.pages.appointment-activity/business-details.langSwati",
                      Ndebele: "web.provider.settings.pages.appointment-activity/business-details.langNdebele",
                      "Southern Sotho": "web.provider.settings.pages.appointment-activity/business-details.langSouthernSotho",
                      "Northern Sotho": "web.provider.settings.pages.appointment-activity/business-details.langNorthernSotho",
                    }[lang] ?? lang)}
                    {isSelected && (formData.languagesSpoken || ["English"]).length > 1 && (
                      <span className="ms-1">×</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {t("web.provider.settings.pages.appointment-activity/business-details.selected", {
                list: (formData.languagesSpoken || ["English"])
                  .map((spoken) =>
                    t(
                      {
                        English: "web.provider.settings.pages.appointment-activity/business-details.langEnglish",
                        Afrikaans: "web.provider.settings.pages.appointment-activity/business-details.langAfrikaans",
                        Zulu: "web.provider.settings.pages.appointment-activity/business-details.langZulu",
                        Xhosa: "web.provider.settings.pages.appointment-activity/business-details.langXhosa",
                        Sesotho: "web.provider.settings.pages.appointment-activity/business-details.langSesotho",
                        Tswana: "web.provider.settings.pages.appointment-activity/business-details.langTswana",
                        Venda: "web.provider.settings.pages.appointment-activity/business-details.langVenda",
                        Tsonga: "web.provider.settings.pages.appointment-activity/business-details.langTsonga",
                        Swati: "web.provider.settings.pages.appointment-activity/business-details.langSwati",
                        Ndebele: "web.provider.settings.pages.appointment-activity/business-details.langNdebele",
                        "Southern Sotho": "web.provider.settings.pages.appointment-activity/business-details.langSouthernSotho",
                        "Northern Sotho": "web.provider.settings.pages.appointment-activity/business-details.langNorthernSotho",
                      }[spoken] ?? spoken,
                    ),
                  )
                  .join(", "),
              })}
            </p>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
