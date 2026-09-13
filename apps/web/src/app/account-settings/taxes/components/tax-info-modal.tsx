"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/http/fetcher";
import { useTranslation } from "@beautonomi/i18n";

export type TaxInfoFormData = {
  country: string;
  tax_id: string;
  full_name: string;
  address: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
};

interface TaxInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TaxInfoFormData) => Promise<void>;
  initialData?: Partial<TaxInfoFormData> | null;
}

export default function TaxInfoModal({ isOpen, onClose, onSave, initialData }: TaxInfoModalProps) {
  const { t } = useTranslation();
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    country: "",
    tax_id: "",
    full_name: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
    },
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load countries
      fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/public/countries")
        .then((response) => {
          setCountries(response.data || []);
        })
        .catch(() => {
          // Fallback countries
          setCountries([
            { code: "US", name: "United States" },
            { code: "ZA", name: "South Africa" },
            { code: "GB", name: "United Kingdom" },
            { code: "CA", name: "Canada" },
          ]);
        });

      // Pre-fill form if editing
      if (initialData) {
        setFormData({
          country: initialData.country || "",
          tax_id: initialData.tax_id || "",
          full_name: initialData.full_name || "",
          address: {
            line1: initialData.address?.line1 || "",
            line2: initialData.address?.line2 || "",
            city: initialData.address?.city || "",
            state: initialData.address?.state || "",
            postal_code: initialData.address?.postal_code || "",
            country: initialData.address?.country || initialData.country || "",
          },
        });
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave(formData);
    } catch {
      // Error already handled in parent
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-gray-900">{t("web.accountSettings.taxInfoModal.title")}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label={t("web.accountSettings.taxInfoModal.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <Label htmlFor="country" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.taxInfoModal.countryLabel")}
            </Label>
            <Select
              value={formData.country}
              onValueChange={(value) => {
                setFormData({
                  ...formData,
                  country: value,
                  address: { ...formData.address, country: value },
                });
              }}
            >
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder={t("web.accountSettings.taxInfoModal.countryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country.code} value={country.name}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tax_id" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.taxInfoModal.taxIdLabel")}
            </Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder={t("web.accountSettings.taxInfoModal.taxIdPlaceholder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="full_name" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.taxInfoModal.fullNameLabel")}
            </Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder={t("web.accountSettings.taxInfoModal.fullNamePlaceholder")}
              required
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">{t("web.accountSettings.taxInfoModal.addressOptional")}</h3>

            <div>
              <Label htmlFor="address_line1" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.taxInfoModal.addressLine1")}
              </Label>
              <Input
                id="address_line1"
                value={formData.address.line1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, line1: e.target.value },
                  })
                }
                placeholder={t("web.accountSettings.taxInfoModal.streetAddress")}
              />
            </div>

            <div>
              <Label htmlFor="address_line2" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.taxInfoModal.addressLine2")}
              </Label>
              <Input
                id="address_line2"
                value={formData.address.line2}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, line2: e.target.value },
                  })
                }
                placeholder={t("web.accountSettings.taxInfoModal.aptSuite")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city" className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("web.accountSettings.taxInfoModal.city")}
                </Label>
                <Input
                  id="city"
                  value={formData.address.city}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, city: e.target.value },
                    })
                  }
                  placeholder={t("web.accountSettings.taxInfoModal.cityPlaceholder")}
                />
              </div>

              <div>
                <Label htmlFor="state" className="text-sm font-medium text-gray-700 mb-2 block">
                  {t("web.accountSettings.taxInfoModal.stateProvince")}
                </Label>
                <Input
                  id="state"
                  value={formData.address.state}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, state: e.target.value },
                    })
                  }
                  placeholder={t("web.accountSettings.taxInfoModal.statePlaceholder")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="postal_code" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.taxInfoModal.postalCode")}
              </Label>
              <Input
                id="postal_code"
                value={formData.address.postal_code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, postal_code: e.target.value },
                  })
                }
                placeholder={t("web.accountSettings.taxInfoModal.postalCodePlaceholder")}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {t("web.accountSettings.taxInfoModal.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.country || !formData.tax_id || !formData.full_name}
              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
            >
              {isLoading ? t("web.accountSettings.taxInfoModal.saving") : t("web.accountSettings.taxInfoModal.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
