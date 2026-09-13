"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Check, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { useRouter } from "next/navigation";

export default function BusinessDescriptionPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadDescription();
  }, []);

  const loadDescription = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { description: string | null } }>(
        "/api/me/provider"
      );
      const desc = response.data?.description || "";
      setDescription(desc);
      setOriginalDescription(desc);
    } catch (error) {
      console.error("Error loading description:", error);
      toast.error(t("web.provider.settings.pages.business-description.failedToLoadBusinessDescription"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validation
      if (description.length > 2000) {
        toast.error(t("web.provider.settings.pages.business-description.descriptionMustBe2000CharactersOr"));
        return;
      }

      const response = await fetcher.patch<{ data?: any }>("/api/provider/profile", {
        description: description || null,
      });

      if (response?.data) {
        setOriginalDescription(description);
        toast.success(t("web.provider.settings.pages.business-description.businessDescriptionUpdatedSuccessfully"));
        router.push("/provider/settings");
      }
    } catch (error) {
      const errorMessage =
        error instanceof FetchError
          ? error.message
          : t("web.provider.settings.pages.business-description.failedToUpdate");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseTemplate = () => {
    const templates = [
      t("web.provider.settings.pages.business-description.template1"),
      t("web.provider.settings.pages.business-description.template2"),
      t("web.provider.settings.pages.business-description.template3"),
    ];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    setDescription(randomTemplate);
  };

  const hasChanges = description !== originalDescription;
  const isGoodLength = description.length >= 50 && description.length <= 2000;
  const showWarning = description.length > 0 && description.length < 50;

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
        <div className="w-full max-w-full overflow-x-hidden">
          <PageHeader 
          title={t("web.provider.settings.categories.appointmentActivity.items.businessDescription.title")} 
          subtitle={t("web.provider.settings.categories.appointmentActivity.items.businessDescription.description")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
            { label: t("web.provider.settings.pages.business-description.businessDescription") }
          ]}
        />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">{t("web.provider.settings.common.loading")}</p>
            </div>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="w-full max-w-full overflow-x-hidden">
        <PageHeader
          title={t("web.provider.settings.categories.appointmentActivity.items.businessDescription.title")}
          subtitle={t("web.provider.settings.categories.appointmentActivity.items.businessDescription.description")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
            { label: t("web.provider.settings.pages.business-description.businessDescription") }
          ]}
        />

        <div className="max-w-3xl mt-6 w-full max-w-full overflow-x-hidden">
          <Alert className="mb-6 w-full max-w-full">
            <Info className="w-4 h-4 flex-shrink-0" />
            <AlertDescription className="break-words">
              {t("web.provider.settings.pages.business-description.aboutHint")}
            </AlertDescription>
          </Alert>

          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 space-y-4 w-full max-w-full overflow-x-hidden">
            <div className="w-full">
              <Label htmlFor="description" className="block w-full">
                <span className="block sm:inline">{t("web.provider.common.description")}</span>
                <span className="text-gray-500 font-normal text-xs ms-0 sm:ms-2 block sm:inline">
{t("web.provider.settings.pages.business-description.recommended")}
                </span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 2000) {
                    setDescription(value);
                  }
                }}
                placeholder={t("web.provider.settings.pages.business-description.tellCustomersAboutYourBusinessYour")}
                className="min-h-[200px] mt-2 w-full max-w-full"
                maxLength={2000}
              />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 gap-2 w-full">
                <p className="text-xs text-gray-500 min-w-0 flex-1 w-full sm:w-auto">
                  {showWarning ? (
                    <span className="text-amber-600 flex items-start gap-1 flex-wrap">
                      <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="break-words flex-1 min-w-0">{t("web.provider.settings.pages.business-description.considerMore", { count: description.length })}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="whitespace-nowrap">{t("web.provider.onboarding.leftover3.charsOf2000", { count: description.length })}</span>
                      {isGoodLength && (
                        <span className="text-green-600 flex items-center gap-1 whitespace-nowrap">
                          <Check className="w-3 h-3 flex-shrink-0" />
<span>{t("web.provider.onboarding.leftover.goodLength")}</span>
                        </span>
                      )}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleUseTemplate}
                  className="text-xs text-primary hover:underline whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
                >
{t("web.provider.onboarding.leftover.useTemplate")}
                </button>
              </div>
            </div>

            {/* Preview */}
            {description && (
              <div className="mt-6 pt-6 border-t w-full">
                <Label className="text-sm font-medium mb-2 block">{t("web.provider.settings.pages.business-description.preview")}</Label>
                <div className="bg-gray-50 p-4 rounded-lg border w-full overflow-x-hidden">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed break-words">
                    {description}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
{t("web.provider.settings.pages.business-description.previewHow")}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t w-full">
              <Button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="bg-primary hover:bg-primary-hover text-white w-full sm:w-auto"
              >
                {isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDescription(originalDescription);
                  toast.info(t("web.provider.settings.pages.business-description.changesDiscarded"));
                }}
                disabled={!hasChanges || isSaving}
                className="w-full sm:w-auto"
              >
                {t("web.provider.common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
