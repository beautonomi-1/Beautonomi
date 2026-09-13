"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, CheckCircle2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface TaxSettingsData {
  tax_rate_percent: number;
  is_vat_registered: boolean;
  vat_number: string | null;
  isUsingPlatformDefault: boolean;
}

export default function TaxesSettings() {
  const { t } = useTranslation();
  const [isVatRegistered, setIsVatRegistered] = useState<boolean>(false);
  const [vatNumber, setVatNumber] = useState<string>("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetcher.get<{ data: TaxSettingsData }>(
          "/api/provider/settings/sales/taxes"
        );
        const data = res.data;
        setIsVatRegistered(data.is_vat_registered ?? false);
        setVatNumber(data.vat_number || "");
        setTaxRate(Number(data.tax_rate_percent || 0));
      } catch {
        toast.error(t("web.provider.settings.pages.sales/taxes.failedToLoadTaxSettings"));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      
      // Validate VAT number if VAT registered
      if (isVatRegistered && !vatNumber.trim()) {
        toast.error(t("web.provider.settings.pages.sales/taxes.vatNumberIsRequiredWhenVat"));
        return;
      }
      
      // Validate VAT number format (South African: 10 digits starting with 4)
      if (isVatRegistered && vatNumber.trim()) {
        const vatRegex = /^4\d{9}$/;
        if (!vatRegex.test(vatNumber.trim())) {
          toast.error(t("web.provider.settings.pages.sales/taxes.invalidVatNumberFormatMustBe"));
          return;
        }
      }

      const res = await fetcher.patch<{ data: TaxSettingsData }>(
        "/api/provider/settings/sales/taxes",
        {
          is_vat_registered: isVatRegistered,
          vat_number: isVatRegistered ? vatNumber.trim() : null,
          // Tax rate will be auto-set: 15% if VAT registered, 0% if not
        }
      );
      
      const data = res.data;
      setIsVatRegistered(data.is_vat_registered ?? false);
      setVatNumber(data.vat_number || "");
      setTaxRate(Number(data.tax_rate_percent || 0));
      
      toast.success(t("web.provider.settings.pages.sales/taxes.taxSettingsSavedSuccessfully"));
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/taxes.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-update tax rate when VAT registration changes
  useEffect(() => {
    if (isVatRegistered) {
      setTaxRate(15); // South African standard VAT rate
    } else {
      setTaxRate(0);
      setVatNumber(""); // Clear VAT number when unregistering
    }
  }, [isVatRegistered]);

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.sales/taxes.sales"), href: "/provider/settings/sales/yoco-integration" },
    { label: t("web.provider.settings.pages.sales/taxes.taxes") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title={t("web.provider.settings.categories.sales.items.taxes.title")} subtitle={t("web.provider.settings.categories.sales.items.taxes.description")} onSave={onSave} isSaving={isSaving} breadcrumbs={breadcrumbs}>
        <SectionCard>
          <div className="text-center py-8 text-gray-500">{t("web.provider.settings.pages.sales/taxes.loading")}</div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.sales/taxes.taxesVat")}
      subtitle={t("web.provider.settings.pages.sales/taxes.configureYourTaxRegistrationStatus")}
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6">
        {/* VAT Registration Status */}
        <SectionCard>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="vat-registered"
                checked={isVatRegistered}
                onCheckedChange={(checked) => setIsVatRegistered(checked === true)}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="vat-registered" className="text-base font-semibold cursor-pointer">
                  {t("web.provider.settings.pages.sales/taxes.vatRegisteredSars")}
                </Label>
                <p className="text-sm text-gray-600">
                  {t("web.provider.settings.pages.sales/taxes.vatRegistrationHint")}
                </p>
              </div>
            </div>

            {isVatRegistered && (
              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800">
                  <strong>{t("web.provider.settings.pages.sales/taxes.vatRegisteredStrong")}</strong> {t("web.provider.settings.pages.sales/taxes.vatRegisteredBody")}
                </AlertDescription>
              </Alert>
            )}

            {!isVatRegistered && (
              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-sm text-green-800">
                  <strong>{t("web.provider.settings.pages.sales/taxes.notVatRegisteredStrong")}</strong> {t("web.provider.settings.pages.sales/taxes.notVatRegisteredBody")}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SectionCard>

        {/* VAT Number (only shown if VAT registered) */}
        {isVatRegistered && (
          <SectionCard>
            <div className="space-y-2">
              <Label htmlFor="vat-number">
                {t("web.provider.settings.pages.sales/taxes.vatNumberSars")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vat-number"
                type="text"
                placeholder={t("web.provider.settings.pages.sales/taxes.n4123456789")}
                value={vatNumber}
                onChange={(e) => {
                  // Only allow digits
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 10) {
                    setVatNumber(value);
                  }
                }}
                maxLength={10}
                required
              />
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.sales/taxes.vatNumberHint")}
              </p>
              {vatNumber && vatNumber.length === 10 && !vatNumber.startsWith('4') && (
                <p className="text-sm text-red-600">
                  {t("web.provider.settings.pages.sales/taxes.vatMustStartWith4")}
                </p>
              )}
            </div>
          </SectionCard>
        )}

        {/* Tax Rate Display (read-only, auto-calculated) */}
        <SectionCard>
          <div className="space-y-2">
            <Label>{t("web.provider.settings.pages.sales/taxes.taxRate")}</Label>
            <Input
              type="number"
              value={taxRate}
              disabled
              className="bg-gray-50"
            />
            <p className="text-sm text-gray-600">
              {isVatRegistered 
                ? t("web.provider.settings.pages.sales/taxes.taxRateVatHint")
                : t("web.provider.settings.pages.sales/taxes.taxRateNonVatHint")}
            </p>
          </div>
        </SectionCard>

        {/* Information Section */}
        <SectionCard>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="space-y-2 text-sm text-gray-600">
                <p className="font-semibold text-gray-900">{t("web.provider.settings.pages.sales/taxes.aboutVat")}</p>
                <ul className="list-disc list-inside space-y-1 ms-2">
                  <li>{t("web.provider.settings.pages.sales/taxes.vatMandatory")} <strong>{t("web.provider.settings.pages.sales/taxes.mandatory")}</strong> {t("web.provider.settings.pages.sales/taxes.ifTurnoverMillionPlus")}</li>
                  <li>{t("web.provider.settings.pages.sales/taxes.vatMandatory")} <strong>{t("web.provider.settings.pages.sales/taxes.optional")}</strong> {t("web.provider.settings.pages.sales/taxes.ifTurnoverUnderMillion")}</li>
                  <li>{t("web.provider.settings.pages.sales/taxes.standardRateIs")} <strong>15%</strong></li>
                  <li>{t("web.provider.settings.pages.sales/taxes.mustRemit")} <strong>{t("web.provider.settings.pages.sales/taxes.biMonthly")}</strong> {t("web.provider.settings.pages.sales/taxes.everyTwoMonths")}</li>
                  <li>{t("web.provider.settings.pages.sales/taxes.taxCollectedIs")} <strong>{t("web.provider.settings.pages.sales/taxes.passThrough")}</strong> {t("web.provider.settings.pages.sales/taxes.excludedFromCommission")}</li>
                </ul>
                <p className="mt-3">
                  <a 
                    href="https://www.sars.gov.za/individuals/tax-types/value-added-tax-vat/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("web.provider.settings.pages.sales/taxes.learnMoreSars")}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </SettingsDetailLayout>
  );
}
