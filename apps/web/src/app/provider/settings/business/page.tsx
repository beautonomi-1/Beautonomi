"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Info } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import LoadingTimeout from "@/components/ui/loading-timeout";

type BusinessForm = {
  business_name: string;
  description: string;
  email: string;
  phone: string;
};

const EMPTY: BusinessForm = {
  business_name: "",
  description: "",
  email: "",
  phone: "",
};

function safeProviderReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/provider/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export default function ProviderBusinessSetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeProviderReturnTo(searchParams.get("returnTo"));

  const [form, setForm] = useState<BusinessForm>(EMPTY);
  const [original, setOriginal] = useState<BusinessForm>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const p = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.settings.pages.business.${key}`, opts) as string;

  useEffect(() => {
    void loadBusiness();
  }, []);

  const loadBusiness = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: BusinessForm & { description: string | null } }>(
        "/api/provider/settings/business",
      );
      const data = response.data;
      const next: BusinessForm = {
        business_name: data.business_name ?? "",
        description: data.description ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
      };
      setForm(next);
      setOriginal(next);
    } catch (error) {
      console.error("Error loading business:", error);
      toast.error(p("failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(original),
    [form, original],
  );

  const descTrim = form.description.trim();
  const nameTrim = form.business_name.trim();

  const handleSave = async () => {
    if (nameTrim.length <= 1) {
      toast.error(p("validationBusinessName"));
      return;
    }
    if (descTrim.length < 10) {
      toast.error(p("validationDescriptionMin"));
      return;
    }
    if (descTrim.length > 2000) {
      toast.error(t("web.provider.settings.pages.business-description.descriptionMustBe2000CharactersOr"));
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      toast.error(p("validationEmail"));
      return;
    }
    if (form.phone.trim() && !isCompleteE164(form.phone)) {
      toast.error(p("validationPhone"));
      return;
    }

    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/business", {
        business_name: nameTrim,
        description: descTrim || null,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      setOriginal({ ...form, business_name: nameTrim, description: descTrim });
      invalidateSetupStatusCache();
      toast.success(p("savedSuccess"));
      if (returnTo) {
        router.push(returnTo);
      }
    } catch (error) {
      const errorMessage =
        error instanceof FetchError ? error.message : p("failedToUpdate");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    ...(returnTo
      ? [{ label: t("web.provider.settings.pages.locations.getStarted"), href: returnTo }]
      : []),
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.categories.appointmentActivity.items.businessSetup.title") },
  ];

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
        <LoadingTimeout loadingMessage={t("web.provider.settings.common.loading")} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="w-full max-w-full overflow-x-hidden">
        <PageHeader
          title={t("web.provider.settings.categories.appointmentActivity.items.businessSetup.title")}
          subtitle={t("web.provider.settings.categories.appointmentActivity.items.businessSetup.description")}
          breadcrumbs={breadcrumbs}
        />

        {returnTo && (
          <div className="mb-6 bg-gradient-to-r from-primary/10 to-primary-hover/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{p("setupBannerTitle")}</p>
              <p className="text-xs text-gray-600">{p("setupBannerBody")}</p>
            </div>
            <Link href={returnTo}>
              <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
                <ArrowLeft className="w-4 h-4 me-2" />
                {t("web.provider.settings.pages.locations.backToGetStarted")}
              </Button>
            </Link>
          </div>
        )}

        <div className="max-w-3xl mt-6">
          <Alert className="mb-6">
            <Info className="w-4 h-4 flex-shrink-0" />
            <AlertDescription>{p("contactHint")}</AlertDescription>
          </Alert>

          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 space-y-5">
            <div>
              <Label htmlFor="business_name">{p("businessNameLabel")}</Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                className="mt-2"
                placeholder={t("web.provider.onboarding.business.namePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="description">{p("descriptionLabel")}</Label>
              <p className="text-xs text-gray-500 mt-1 mb-2">{p("descriptionHint")}</p>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 2000) setForm((f) => ({ ...f, description: value }));
                }}
                className="min-h-[140px]"
                maxLength={2000}
                placeholder={t("web.provider.onboarding.business.descriptionPlaceholder")}
              />
              <p className="text-xs text-gray-500 mt-1 tabular-nums">
                {t("web.provider.onboarding.business.charsOf2000", { count: form.description.length })}
              </p>
            </div>

            <div>
              <Label htmlFor="email">{p("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-2"
                autoComplete="email"
              />
            </div>

            <div>
              <Label>{p("phoneLabel")}</Label>
              <div className="mt-2">
                <PhoneInput
                  value={form.phone}
                  onChange={(value) => setForm((f) => ({ ...f, phone: value }))}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving || !hasChanges}
                className="bg-primary hover:bg-primary-hover text-white w-full sm:w-auto"
              >
                {isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
