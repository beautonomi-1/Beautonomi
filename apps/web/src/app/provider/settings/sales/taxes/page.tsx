"use client";

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
        // keep defaults
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
        toast.error("VAT number is required when VAT registered");
        return;
      }
      
      // Validate VAT number format (South African: 10 digits starting with 4)
      if (isVatRegistered && vatNumber.trim()) {
        const vatRegex = /^4\d{9}$/;
        if (!vatRegex.test(vatNumber.trim())) {
          toast.error("Invalid VAT number format. Must be 10 digits starting with 4 (e.g., 4123456789)");
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
      
      toast.success("Tax settings saved successfully");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save tax settings");
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
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
    { label: "Taxes" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout title="Taxes" subtitle="Set up tax rates" onSave={onSave} isSaving={isSaving} breadcrumbs={breadcrumbs}>
        <SectionCard>
          <div className="text-center py-8 text-gray-500">Loading tax settings...</div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Taxes & VAT"
      subtitle="Configure your tax registration status"
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
                  I am VAT registered with SARS
                </Label>
                <p className="text-sm text-gray-600">
                  VAT registration is mandatory for businesses with annual turnover of R1 million or more.
                  If you make less than R1 million per year, you don't need to be VAT registered.
                </p>
              </div>
            </div>

            {isVatRegistered && (
              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800">
                  <strong>VAT Registered:</strong> You will collect 15% VAT from customers and are responsible for remitting it to SARS bi-monthly.
                </AlertDescription>
              </Alert>
            )}

            {!isVatRegistered && (
              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-sm text-green-800">
                  <strong>Not VAT Registered:</strong> No tax will be collected from customers. This is suitable for small businesses making less than R1 million per year.
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
                VAT Number (SARS) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vat-number"
                type="text"
                placeholder="4123456789"
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
                Your 10-digit SARS VAT registration number (must start with 4)
              </p>
              {vatNumber && vatNumber.length === 10 && !vatNumber.startsWith('4') && (
                <p className="text-sm text-red-600">
                  South African VAT numbers must start with 4
                </p>
              )}
            </div>
          </SectionCard>
        )}

        {/* Tax Rate Display (read-only, auto-calculated) */}
        <SectionCard>
          <div className="space-y-2">
            <Label>Tax Rate</Label>
            <Input
              type="number"
              value={taxRate}
              disabled
              className="bg-gray-50"
            />
            <p className="text-sm text-gray-600">
              {isVatRegistered 
                ? "Tax rate is automatically set to 15% (South African standard VAT rate) when VAT registered."
                : "Tax rate is 0% for non-VAT registered providers. No tax will be collected from customers."}
            </p>
          </div>
        </SectionCard>

        {/* Information Section */}
        <SectionCard>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="space-y-2 text-sm text-gray-600">
                <p className="font-semibold text-gray-900">About VAT in South Africa:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>VAT registration is <strong>mandatory</strong> if your annual turnover is R1 million or more</li>
                  <li>VAT registration is <strong>optional</strong> if your annual turnover is less than R1 million</li>
                  <li>Standard VAT rate in South Africa is <strong>15%</strong></li>
                  <li>VAT must be remitted to SARS <strong>bi-monthly</strong> (every 2 months)</li>
                  <li>Tax collected is a <strong>pass-through</strong> - excluded from platform commission</li>
                </ul>
                <p className="mt-3">
                  <a 
                    href="https://www.sars.gov.za/individuals/tax-types/value-added-tax-vat/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#FF0077] hover:underline"
                  >
                    Learn more about VAT registration on SARS website →
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
