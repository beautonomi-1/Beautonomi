"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { providerPortalFetch, fetcher } from "@/lib/http/fetcher";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  X,
  User,
  Mail,
  MapPin,
  Save,
  CalendarIcon,
  Bell,
  Globe,
  Heart,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { currencySelectLabel } from "@/lib/locale/currency";
import { useTranslation } from "@beautonomi/i18n";

interface Client {
  id?: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: Date;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  };
  emergency_contact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  preferred_language?: string;
  preferred_currency?: string;
  timezone?: string;
  communication_preferences?: {
    email_notifications: boolean;
    sms_notifications: boolean;
    push_notifications: boolean;
  };
  notes?: string;
}

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (client: Client) => void;
  defaultCountryCode?: string;
}

const LANGUAGES = [
  { value: "en" },
  { value: "af" },
  { value: "zu" },
  { value: "xh" },
  { value: "fr" },
];

const TIMEZONES = [
  { value: "Africa/Johannesburg", labelKey: "tzJohannesburg" },
  { value: "Africa/Cairo", labelKey: "tzCairo" },
  { value: "Africa/Lagos", labelKey: "tzLagos" },
  { value: "Africa/Nairobi", labelKey: "tzNairobi" },
  { value: "UTC", labelKey: "tzUtc" },
] as const;

const EMERGENCY_RELATIONSHIPS = [
  "Spouse",
  "Parent",
  "Sibling",
  "Child",
  "Friend",
  "Other",
] as const;

const ADD_CLIENT_COUNTRIES = ["ZA", "US", "GB", "KE", "NG", "GH"] as const;

export function AddClientDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultCountryCode,
}: AddClientDialogProps) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const tenantRegionCode = bundle?.meta?.tenant_region?.code ?? "ZA";
  const [currencyOptions, setCurrencyOptions] = useState<{ value: string; label: string }[]>(() => [
    { value: tenantCurrency, label: currencySelectLabel(tenantCurrency) },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState<string | undefined>(() => defaultCountryCode);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    setDefaultCountry(defaultCountryCode);
  }, [defaultCountryCode]);

  useEffect(() => {
    void (async () => {
      try {
        const json = await fetcher.get<{ data?: Array<{ code: string; name: string }> }>(
          "/api/public/preference-options?type=currency",
          { cache: "no-store" },
        );
        const rows = json?.data;
        if (Array.isArray(rows) && rows.length > 0) {
          setCurrencyOptions(rows.map((r) => ({ value: r.code, label: r.name })));
        }
      } catch {
        setCurrencyOptions([{ value: tenantCurrency, label: currencySelectLabel(tenantCurrency) }]);
      }
    })();
  }, [tenantCurrency]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<Client>({
    first_name: "",
    last_name: "",
    preferred_name: "",
    email: "",
    phone: "",
    date_of_birth: undefined,
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: tenantRegionCode,
    },
    emergency_contact: {
      name: "",
      phone: "",
      relationship: "",
    },
    preferred_language: "en",
    preferred_currency: tenantCurrency,
    timezone: "Africa/Johannesburg",
    communication_preferences: {
      email_notifications: true,
      sms_notifications: false,
      push_notifications: true,
    },
    notes: "",
  });

  /** When bundle loads after first paint, replace stale ZA default country (user edits preserved). */
  useEffect(() => {
    const code = bundle?.meta?.tenant_region?.code?.trim();
    if (!code) return;
    setFormData((prev) => {
      const cur = prev.address?.country ?? "";
      if (cur === code) return prev;
      if (cur !== "ZA") return prev;
      return {
        ...prev,
        address: { ...prev.address!, country: code },
      };
    });
  }, [bundle?.meta?.tenant_region?.code]);

  useEffect(() => {
    if (open) {
      // Fetch default country code
      fetch("/api/public/platform-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.default_country_code) {
            setDefaultCountry(data.default_country_code);
          }
        })
        .catch(() => {});
    } else {
      // Reset form when closed
      setFormData({
        first_name: "",
        last_name: "",
        preferred_name: "",
        email: "",
        phone: "",
        date_of_birth: undefined,
        address: {
          line1: "",
          line2: "",
          city: "",
          state: "",
          postal_code: "",
          country: tenantRegionCode,
        },
        emergency_contact: {
          name: "",
          phone: "",
          relationship: "",
        },
        preferred_language: "en",
        preferred_currency: tenantCurrency,
        timezone: "Africa/Johannesburg",
        communication_preferences: {
          email_notifications: true,
          sms_notifications: false,
          push_notifications: true,
        },
        notes: "",
      });
      setShowAdvanced(false);
    }
  }, [open, tenantCurrency, tenantRegionCode]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFormData((prev) => ({ ...prev, preferred_currency: tenantCurrency }));
    }
    prevOpenRef.current = open;
  }, [open, tenantCurrency]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      alert(t("web.provider.portal.addClientDialog.nameRequired"));
      return;
    }

    setIsLoading(true);
    try {
      // Format phone number (remove spaces)
      const formattedPhone = formData.phone ? formData.phone.replace(/\s/g, '') : undefined;
      
      // Combine first_name and last_name into full_name
      const full_name = `${formData.first_name} ${formData.last_name}`.trim();
      
      // Create email if not provided (for walk-in clients)
      const email = formData.email || `walkin-${Date.now()}@beautonomi.local`;
      
      // Prepare user data
      const userData = {
        email,
        full_name,
        phone: formattedPhone,
        preferred_name: formData.preferred_name || null,
        date_of_birth: formData.date_of_birth ? format(formData.date_of_birth, "yyyy-MM-dd") : null,
        emergency_contact_name: formData.emergency_contact?.name || null,
        emergency_contact_phone: formData.emergency_contact?.phone || null,
        emergency_contact_relationship: formData.emergency_contact?.relationship || null,
        preferred_language: formData.preferred_language || "en",
        preferred_currency: formData.preferred_currency || tenantCurrency,
        timezone: formData.timezone || "Africa/Johannesburg",
        email_notifications_enabled: formData.communication_preferences?.email_notifications ?? true,
        sms_notifications_enabled: formData.communication_preferences?.sms_notifications ?? false,
        push_notifications_enabled: formData.communication_preferences?.push_notifications ?? true,
      };

      // Create address data if provided
      const addressData = formData.address?.line1 && formData.address?.city ? {
        address_line1: formData.address.line1,
        address_line2: formData.address.line2 || null,
        city: formData.address.city,
        state: formData.address.state || null,
        postal_code: formData.address.postal_code || null,
        country: formData.address.country || tenantRegionCode,
        is_default: true,
      } : null;

      // Call API to create client
      const response = await providerPortalFetch("/api/provider/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          ...userData,
          address: addressData,
          notes: formData.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("web.provider.portal.addClientDialog.createFailed"));
      }

      const result = await response.json();
      onSuccess?.(result.data as Client);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Failed to create client:", error);
      alert(error instanceof Error ? error.message : t("web.provider.portal.addClientDialog.createFailedRetry"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] max-h-[90vh] rounded-t-3xl p-0 flex flex-col overflow-hidden font-sans bg-white"
      >
        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <SheetHeader className="px-6 sm:px-8 pb-4 border-b border-gray-100 relative">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute end-6 top-0 p-2 -mt-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
            aria-label={t("web.provider.portal.addClientDialog.close")}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <SheetTitle className="text-xl font-bold text-gray-900 pe-10">
            {t("web.provider.portal.addClientDialog.title")}
          </SheetTitle>
        </SheetHeader>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 sm:py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" />
                {t("web.provider.portal.addClientDialog.basicInformation")}
              </h3>
              
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.firstName")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.firstNamePlaceholder")}
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.lastName")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.lastNamePlaceholder")}
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className="h-12 text-base"
                    required
                  />
                </div>
              </div>

              {/* Preferred Name */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.preferredName")}
                </Label>
                <Input
                  placeholder={t("web.provider.portal.addClientDialog.preferredNamePlaceholder")}
                  value={formData.preferred_name}
                  onChange={(e) =>
                    setFormData({ ...formData, preferred_name: e.target.value })
                  }
                  className="h-12 text-base"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.dateOfBirth")}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-12 text-base justify-start text-start font-normal",
                        !formData.date_of_birth && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="me-2 h-4 w-4" />
                      {formData.date_of_birth ? (
                        format(formData.date_of_birth, "PPP")
                      ) : (
                        <span>{t("web.provider.portal.addClientDialog.pickDate")}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.date_of_birth}
                      onSelect={(date) =>
                        setFormData({ ...formData, date_of_birth: date })
                      }
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {t("web.provider.portal.addClientDialog.contactInformation")}
              </h3>

              {/* Email */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.email")}
                </Label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    placeholder={t("web.provider.portal.addClientDialog.emailPlaceholder")}
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="h-12 text-base ps-10"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-3">
                <PhoneInput
                  value={formData.phone}
                  onChange={(value) => {
                    const e164Format = value.replace(/\s/g, '');
                    setFormData({ ...formData, phone: e164Format });
                  }}
                  label={t("web.provider.portal.addClientDialog.phoneNumber")}
                  placeholder={t("web.provider.portal.addClientDialog.phonePlaceholder")}
                  defaultCountryCode={defaultCountry}
                  required={false}
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t("web.provider.portal.addClientDialog.address")}
              </h3>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.streetAddress")}
                </Label>
                <Input
                  placeholder={t("web.provider.portal.addClientDialog.streetPlaceholder")}
                  value={formData.address?.line1 || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: {
                        ...formData.address!,
                        line1: e.target.value,
                        country: formData.address?.country || tenantRegionCode,
                      },
                    })
                  }
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.apartmentOptional")}
                </Label>
                <Input
                  placeholder={t("web.provider.portal.addClientDialog.apartmentPlaceholder")}
                  value={formData.address?.line2 || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: {
                        ...formData.address!,
                        line2: e.target.value,
                        country: formData.address?.country || tenantRegionCode,
                      },
                    })
                  }
                  className="h-12 text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.cityRequired")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.cityPlaceholder")}
                    value={formData.address?.city || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          city: e.target.value,
                          country: formData.address?.country || tenantRegionCode,
                        },
                      })
                    }
                    className="h-12 text-base"
                    required={!!formData.address?.line1}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.stateProvince")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.statePlaceholder")}
                    value={formData.address?.state || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          state: e.target.value,
                          country: formData.address?.country || tenantRegionCode,
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.postalCode")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.postalPlaceholder")}
                    value={formData.address?.postal_code || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          postal_code: e.target.value,
                          country: formData.address?.country || tenantRegionCode,
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.country")}
                  </Label>
                  <Select
                    value={formData.address?.country || tenantRegionCode}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        address: {
                          ...formData.address!,
                          country: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADD_CLIENT_COUNTRIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(`web.provider.portal.addClientDialog.countries.${code}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Heart className="w-4 h-4" />
                {t("web.provider.portal.addClientDialog.emergencyContact")}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.name")}
                  </Label>
                  <Input
                    placeholder={t("web.provider.portal.addClientDialog.emergencyNamePlaceholder")}
                    value={formData.emergency_contact?.name || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergency_contact: {
                          ...formData.emergency_contact!,
                          name: e.target.value,
                        },
                      })
                    }
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-900">
                    {t("web.provider.portal.addClientDialog.relationship")}
                  </Label>
                  <Select
                    value={formData.emergency_contact?.relationship || ""}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        emergency_contact: {
                          ...formData.emergency_contact!,
                          relationship: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder={t("web.provider.portal.addClientDialog.selectRelationship")} />
                    </SelectTrigger>
                    <SelectContent>
                      {EMERGENCY_RELATIONSHIPS.map((rel) => (
                        <SelectItem key={rel} value={rel} className="h-12">
                          {t(`web.provider.portal.addClientDialog.relationships.${rel}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-900">
                  {t("web.provider.portal.addClientDialog.phoneNumber")}
                </Label>
                <PhoneInput
                  value={formData.emergency_contact?.phone || ""}
                  onChange={(value) => {
                    const e164Format = value.replace(/\s/g, '');
                    setFormData({
                      ...formData,
                      emergency_contact: {
                        ...formData.emergency_contact!,
                        phone: e164Format,
                      },
                    });
                  }}
                  label=""
                  placeholder={t("web.provider.portal.addClientDialog.phonePlaceholder")}
                  defaultCountryCode={defaultCountry}
                  required={false}
                />
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-900">
                {t("web.provider.portal.addClientDialog.advancedOptions")}
              </span>
              <ChevronDown
                className={cn(
                  "w-5 h-5 text-gray-500 transition-transform",
                  showAdvanced && "rotate-180"
                )}
              />
            </button>

            {/* Advanced Options */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Preferences */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {t("web.provider.portal.addClientDialog.preferences")}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-900">
                          {t("web.provider.portal.addClientDialog.preferredLanguage")}
                        </Label>
                        <Select
                          value={formData.preferred_language || "en"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              preferred_language: value,
                            })
                          }
                        >
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map((lang) => (
                              <SelectItem key={lang.value} value={lang.value} className="h-12">
                                {t(`web.provider.portal.addClientDialog.languages.${lang.value}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-900">
                          {t("web.provider.portal.addClientDialog.preferredCurrency")}
                        </Label>
                        <Select
                          value={formData.preferred_currency || tenantCurrency}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              preferred_currency: value,
                            })
                          }
                        >
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currencyOptions.map((curr) => (
                              <SelectItem key={curr.value} value={curr.value} className="h-12">
                                {curr.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-900">
                        {t("web.provider.portal.addClientDialog.timezone")}
                      </Label>
                      <Select
                        value={formData.timezone || "Africa/Johannesburg"}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            timezone: value,
                          })
                        }
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value} className="h-12">
                              {t(`web.provider.portal.addClientDialog.${tz.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Communication Preferences */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      {t("web.provider.portal.addClientDialog.communicationPreferences")}
                    </h3>

                    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            {t("web.provider.portal.addClientDialog.emailNotifications")}
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {t("web.provider.portal.addClientDialog.emailNotificationsHint")}
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.email_notifications ?? true}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                email_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            {t("web.provider.portal.addClientDialog.smsNotifications")}
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {t("web.provider.portal.addClientDialog.smsNotificationsHint")}
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.sms_notifications ?? false}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                sms_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-sm font-semibold text-gray-900">
                            {t("web.provider.portal.addClientDialog.pushNotifications")}
                          </Label>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {t("web.provider.portal.addClientDialog.pushNotificationsHint")}
                          </p>
                        </div>
                        <Switch
                          checked={formData.communication_preferences?.push_notifications ?? true}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              communication_preferences: {
                                ...formData.communication_preferences!,
                                push_notifications: checked,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notes */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900">
                {t("web.provider.portal.addClientDialog.notes")}
              </Label>
              <Textarea
                placeholder={t("web.provider.portal.addClientDialog.notesPlaceholder")}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="min-h-[100px] text-base"
              />
            </div>
          </motion.div>
        </div>

        {/* Sticky Footer - Thumb Zone Optimized */}
        <div className="border-t border-gray-200 bg-white px-6 sm:px-8 py-5 space-y-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="flex-1 h-14 text-base font-semibold"
            >
              {t("web.provider.portal.addClientDialog.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !formData.first_name || !formData.last_name}
              className="flex-1 h-14 text-base font-semibold bg-primary hover:bg-primary-hover text-white active:scale-95 transition-transform"
            >
              {isLoading ? (
                t("web.provider.portal.addClientDialog.creating")
              ) : (
                <>
                  <Save className="w-5 h-5 me-2" />
                  {t("web.provider.portal.addClientDialog.createClient")}
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
