"use client";

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
          : "Failed to load business details";
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
      toast.success("Business details updated successfully");
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to update business details";
      toast.error(errorMessage);
      console.error("Error saving business details:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = originalData && JSON.stringify(formData) !== JSON.stringify(originalData);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Business Details" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Business details"
        subtitle="Configure your business information and preferences"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading business details..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalData) {
    return (
      <SettingsDetailLayout
        title="Business details"
        subtitle="Configure your business information and preferences"
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title="Failed to load business details"
          description={error}
          action={{
            label: "Retry",
            onClick: loadData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Business details"
      subtitle="Configure your business information and preferences"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      {/* Business Information */}
      <SectionCard title="Business Information" className="w-full">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="businessName" className="text-sm sm:text-base">
              Business Name *
            </Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              className="mt-1 w-full"
              placeholder="Enter your business name"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="timezone" className="text-sm sm:text-base">
                Timezone *
              </Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select timezone" />
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
                Time Format *
              </Label>
              <Select
                value={formData.timeFormat}
                onValueChange={(value) => setFormData({ ...formData, timeFormat: value as "12h" | "24h" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour</SelectItem>
                  <SelectItem value="12h">12-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="weekStart" className="text-sm sm:text-base">
                Week Start *
              </Label>
              <Select
                value={formData.weekStart}
                onValueChange={(value) => setFormData({ ...formData, weekStart: value as "monday" | "sunday" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="sunday">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="appointmentColorSource" className="text-sm sm:text-base">
                Appointment Color Source
              </Label>
              <Select
                value={formData.appointmentColorSource}
                onValueChange={(value) => setFormData({ ...formData, appointmentColorSource: value as "service" | "team" | "client" })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="team">Team Member</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Custom fields (platform-defined extra info) */}
      {formData.providerId && (
        <SectionCard title="Additional information" className="w-full">
          <p className="text-sm text-muted-foreground mb-4">
            Extra details defined by the platform (e.g. registration number, specialties). Save with the button below.
          </p>
          <CustomFieldsForm
            entityType="provider"
            entityId={formData.providerId}
            showSaveButton={true}
          />
        </SectionCard>
      )}

      {/* Language Settings */}
      <SectionCard title="Language Settings" className="w-full">
        <Alert className="mb-4 sm:mb-6 border-[#FF0077]/20 bg-[#FF0077]/5">
          <Info className="w-4 h-4 text-[#FF0077] flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            Language settings affect how notifications and communications are sent to clients and team members.
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <Label htmlFor="clientNotificationLanguage" className="text-sm sm:text-base">
              Client Notification Language
            </Label>
            <Select
              value={formData.clientNotificationLanguage}
              onValueChange={(value) => setFormData({ ...formData, clientNotificationLanguage: value })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="af">Afrikaans</SelectItem>
                <SelectItem value="zu">Zulu</SelectItem>
                <SelectItem value="xh">Xhosa</SelectItem>
                <SelectItem value="st">Sesotho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="defaultTeamLanguage" className="text-sm sm:text-base">
              Default Team Language
            </Label>
            <Select
              value={formData.defaultTeamLanguage}
              onValueChange={(value) => setFormData({ ...formData, defaultTeamLanguage: value })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="af">Afrikaans</SelectItem>
                <SelectItem value="zu">Zulu</SelectItem>
                <SelectItem value="xh">Xhosa</SelectItem>
                <SelectItem value="st">Sesotho</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Online Links */}
      <SectionCard title="Online Links" className="w-full">
        <Alert className="mb-4 sm:mb-6 border-[#FF0077]/20 bg-[#FF0077]/5">
          <Info className="w-4 h-4 text-[#FF0077] flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            Add your social media and website links to help clients find you online.
          </AlertDescription>
        </Alert>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="website" className="text-sm sm:text-base">
              Website
            </Label>
            <Input
              id="website"
              type="url"
              placeholder="https://www.example.com"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label htmlFor="facebook" className="text-sm sm:text-base">
                Facebook
              </Label>
              <Input
                id="facebook"
                type="url"
                placeholder="https://facebook.com/..."
                value={formData.facebook}
                onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="instagram" className="text-sm sm:text-base">
                Instagram
              </Label>
              <Input
                id="instagram"
                type="url"
                placeholder="https://instagram.com/..."
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="x" className="text-sm sm:text-base">
                X (Twitter)
              </Label>
              <Input
                id="x"
                type="url"
                placeholder="https://x.com/..."
                value={formData.x}
                onChange={(e) => setFormData({ ...formData, x: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="linkedin" className="text-sm sm:text-base">
                LinkedIn
              </Label>
              <Input
                id="linkedin"
                type="url"
                placeholder="https://linkedin.com/..."
                value={formData.linkedin}
                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                className="mt-1 w-full"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="other" className="text-sm sm:text-base">
              Other
            </Label>
            <Input
              id="other"
              type="url"
              placeholder="https://..."
              value={formData.other}
              onChange={(e) => setFormData({ ...formData, other: e.target.value })}
              className="mt-1 w-full"
            />
          </div>
        </div>
      </SectionCard>

      {/* Business Profile Information */}
      <SectionCard title="Business Profile Information" className="w-full">
        <Alert className="mb-4 sm:mb-6 border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm text-gray-700">
            This information helps customers find you and builds trust. It appears on your public profile.
          </AlertDescription>
        </Alert>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="yearsInBusiness" className="text-sm sm:text-base">
              Years in Business
            </Label>
            <Select
              value={formData.yearsInBusiness?.toString() || "none"}
              onValueChange={(value) => setFormData({ ...formData, yearsInBusiness: value === "none" ? null : parseInt(value) })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select years..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                <SelectItem value="0">Just starting (0 years)</SelectItem>
                <SelectItem value="1">1 year</SelectItem>
                <SelectItem value="2">2 years</SelectItem>
                <SelectItem value="3">3 years</SelectItem>
                <SelectItem value="4">4 years</SelectItem>
                <SelectItem value="5">5 years</SelectItem>
                <SelectItem value="6">6-10 years</SelectItem>
                <SelectItem value="11">11-15 years</SelectItem>
                <SelectItem value="16">16-20 years</SelectItem>
                <SelectItem value="21">20+ years</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Your experience helps build trust with customers.
            </p>
          </div>
          <div>
            <Label htmlFor="languagesSpoken" className="text-sm sm:text-base mb-2 block">
              Languages You Speak
            </Label>
            <p className="text-xs text-gray-600 mb-2">
              Select the human languages you can communicate in with clients (e.g., English, Zulu, Afrikaans, etc.).
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
                        ? "bg-[#FF0077] text-white border-2 border-[#FF0077]"
                        : "bg-white text-gray-700 border-2 border-gray-300 hover:border-[#FF0077] hover:text-[#FF0077]"
                    } ${isSelected && (formData.languagesSpoken || ["English"]).length === 1 ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                    disabled={isSelected && (formData.languagesSpoken || ["English"]).length === 1}
                    title={isSelected && (formData.languagesSpoken || ["English"]).length === 1 ? "At least one language is required" : ""}
                  >
                    {lang}
                    {isSelected && (formData.languagesSpoken || ["English"]).length > 1 && (
                      <span className="ml-1">×</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Selected: {(formData.languagesSpoken || ["English"]).join(", ")}
            </p>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
