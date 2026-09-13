"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { useTranslation } from "@beautonomi/i18n";

interface VatIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vatId: string) => Promise<void>;
  initialData?: string | null;
}

export default function VatIdModal({ isOpen, onClose, onSave, initialData }: VatIdModalProps) {
  const { t } = useTranslation();
  const [vatId, setVatId] = useState("");
  const [country, setCountry] = useState("");
  const [nameOnRegistration, setNameOnRegistration] = useState("");
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    province: "",
    zip: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);

  useEffect(() => {
    if (isOpen) {
      // Load countries
      fetch("/api/public/countries")
        .then((res) => res.json())
        .then((data) => {
          setCountries(data.data || []);
        })
        .catch(() => {
          setCountries([
            { code: "EU", name: "European Union" },
            { code: "GB", name: "United Kingdom" },
            { code: "ZA", name: "South Africa" },
          ]);
        });

      // Pre-fill if editing
      if (initialData) {
        setVatId(initialData);
      }
    } else {
      // Reset form when closed
      setVatId("");
      setCountry("");
      setNameOnRegistration("");
      setAddress({ line1: "", line2: "", city: "", province: "", zip: "" });
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vatId.trim()) {
      return;
    }
    setIsLoading(true);
    try {
      await onSave(vatId);
    } catch {
      // Error handled in parent
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
          <h2 className="text-xl font-semibold text-gray-900">{t("web.accountSettings.vatIdModal.title")}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label={t("web.accountSettings.vatIdModal.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-sm text-gray-600">
            {t("web.accountSettings.vatIdModal.verificationHint")}{" "}
            {t("web.accountSettings.vatIdModal.moreInfo")}{" "}
            <Link href="/help-center" className="text-[#FF0077] hover:text-[#D60565] underline">
              {t("web.accountSettings.vatIdModal.here")}
            </Link>
            .
          </p>

          <div>
            <Label htmlFor="country" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.vatIdModal.countryLabel")}
            </Label>
            <Select value={country} onValueChange={setCountry} required>
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder={t("web.accountSettings.vatIdModal.countryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="vat_id" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.vatIdModal.vatIdLabel")}
            </Label>
            <Input
              id="vat_id"
              value={vatId}
              onChange={(e) => setVatId(e.target.value)}
              placeholder={t("web.accountSettings.vatIdModal.vatIdPlaceholder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="name" className="text-sm font-medium text-gray-700 mb-2 block">
              {t("web.accountSettings.vatIdModal.nameLabel")}
            </Label>
            <Input
              id="name"
              value={nameOnRegistration}
              onChange={(e) => setNameOnRegistration(e.target.value)}
              placeholder={t("web.accountSettings.vatIdModal.namePlaceholder")}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">{t("web.accountSettings.vatIdModal.addressOptional")}</h3>

            <div>
              <Label htmlFor="address1" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.vatIdModal.addressLine1")}
              </Label>
              <Input
                id="address1"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                placeholder={t("web.accountSettings.vatIdModal.addressLine1Placeholder")}
              />
            </div>

            <div>
              <Label htmlFor="address2" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.vatIdModal.addressLine2")}
              </Label>
              <Input
                id="address2"
                value={address.line2}
                onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                placeholder={t("web.accountSettings.vatIdModal.addressLine2Placeholder")}
              />
            </div>

            <div>
              <Label htmlFor="city" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.vatIdModal.city")}
              </Label>
              <Input
                id="city"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                placeholder={t("web.accountSettings.vatIdModal.cityPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="province" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.vatIdModal.province")}
              </Label>
              <Input
                id="province"
                value={address.province}
                onChange={(e) => setAddress({ ...address, province: e.target.value })}
                placeholder={t("web.accountSettings.vatIdModal.provincePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="zip" className="text-sm font-medium text-gray-700 mb-2 block">
                {t("web.accountSettings.vatIdModal.zip")}
              </Label>
              <Input
                id="zip"
                value={address.zip}
                onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                placeholder={t("web.accountSettings.vatIdModal.zipPlaceholder")}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {t("web.accountSettings.vatIdModal.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !vatId.trim() || !country}
              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
            >
              {isLoading ? t("web.accountSettings.vatIdModal.saving") : t("web.accountSettings.vatIdModal.add")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
