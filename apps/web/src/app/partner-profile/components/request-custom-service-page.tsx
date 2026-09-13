"use client";

import React, { useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Sparkles, Calendar, Clock, MapPin, Image as ImageIcon, DollarSign, X, Upload, Loader2, Info, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import Image from "next/image";
import EmptyState from "@/components/ui/empty-state";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useAuth } from "@/providers/AuthProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getCurrencySymbol } from "@/lib/locale/currency";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";

function filterValidHttpUrls(urls: string[]): string[] {
  return urls
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        const x = new URL(u);
        return x.protocol === "http:" || x.protocol === "https:";
      } catch {
        return false;
      }
    });
}

type Props = {
  providerId: string;
  acceptsCustomRequests?: boolean;
  businessName?: string;
};

export default function RequestCustomServicePage({ providerId, acceptsCustomRequests = true, businessName }: Props) {
  const { t, pp } = usePartnerProfileT();
  const { bundle } = useConfigBundle();
  const { user, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currencyCode = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const tenantRegionCodeRaw = (bundle?.meta?.tenant_region?.code ?? "ZA").trim().toUpperCase();
  const mapboxCountryIso = /^[A-Z]{2}$/.test(tenantRegionCodeRaw) ? tenantRegionCodeRaw : "ZA";
  const defaultCountryName = mapboxCountryIso === "ZA" ? "South Africa" : mapboxCountryIso;
  const currencySymbol = getCurrencySymbol(currencyCode);
  const router = useRouter();
  const loginNext = useMemo(() => {
    const qs = searchParams?.toString();
    const raw = `${pathname || "/partner-profile"}${qs ? `?${qs}` : ""}`;
    return sanitizeRelativeRedirect(raw) ?? "/partner-profile";
  }, [pathname, searchParams]);

  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<string>("");
  const [preferredStartAt, setPreferredStartAt] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [imageUrlsText, setImageUrlsText] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [locationType, setLocationType] = useState<"at_home" | "at_salon">("at_salon");
  const [addressPlaceName, setAddressPlaceName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyAtHomeAddress = useCallback(
    (address: {
      address_line1: string;
      city: string;
      state?: string;
      postal_code?: string;
      country: string;
      place_name?: string;
    }) => {
      setAddressLine1(address.address_line1);
      setAddressCity(address.city);
      setAddressState(address.state ?? "");
      setAddressPostalCode(address.postal_code ?? "");
      setAddressCountry(address.country);
      setAddressPlaceName(address.place_name?.trim() || address.address_line1);
    },
    []
  );

  // Combine uploaded images and manually entered URLs
  const imageUrls = useMemo(() => {
    const manualUrls = imageUrlsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...uploadedImages, ...manualUrls].slice(0, 6);
  }, [imageUrlsText, uploadedImages]);

  const processImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        toast.error(pp("customDropImagesOnly"));
        return;
      }
      const maxBytes = 5 * 1024 * 1024;
      for (const f of imageFiles) {
        if (f.size > maxBytes) {
          toast.error(pp("customImageTooLarge", { name: f.name }));
          return;
        }
      }

      const manualCount = imageUrlsText.split(/\n|,/).map((s) => s.trim()).filter(Boolean).length;
      const totalFiles = uploadedImages.length + manualCount + imageFiles.length;
      if (totalFiles > 6) {
        toast.error(pp("customMaxImages"));
        return;
      }

      setUploadingImages(true);

      try {
        const previews: string[] = [];
        for (const file of imageFiles) {
          if (file.type.startsWith("image/")) {
            previews.push(URL.createObjectURL(file));
          }
        }
        setImagePreviewUrls((prev) => [...prev, ...previews]);

        const formData = new FormData();
        imageFiles.forEach((file) => {
          formData.append("files", file);
        });

        const response = await fetcher.post<{ data: { urls: string[]; count: number }; error: null }>(
          "/api/me/custom-requests/upload",
          formData
        );

        if (response.data?.urls && Array.isArray(response.data.urls)) {
          setUploadedImages((prev) => [...prev, ...response.data.urls].slice(0, 6));
          toast.success(
            pp("customImagesUploaded", { count: response.data.count || response.data.urls.length })
          );
        }
      } catch (error) {
        const msg = error instanceof FetchError ? error.message : pp("customUploadFailed");
        toast.error(msg);
        setImagePreviewUrls((prev) => prev.slice(0, prev.length - imageFiles.length));
      } finally {
        setUploadingImages(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [imageUrlsText, uploadedImages.length, pp]
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processImageFiles(Array.from(files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingImages || imageUrls.length >= 6) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length === 0) return;
    await processImageFiles(dropped);
  };

  const removeImage = (index: number) => {
    // Determine if it's an uploaded image or manual URL
    if (index < uploadedImages.length) {
      // Remove uploaded image
      setUploadedImages((prev) => prev.filter((_, i) => i !== index));
      // Clean up preview URL
      if (imagePreviewUrls[index]) {
        URL.revokeObjectURL(imagePreviewUrls[index]);
        setImagePreviewUrls((prev) => prev.filter((_, i) => i !== index));
      }
    } else {
      // Remove from manual URLs
      const manualUrls = imageUrlsText.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
      const urlIndex = index - uploadedImages.length;
      manualUrls.splice(urlIndex, 1);
      setImageUrlsText(manualUrls.join("\n"));
    }
  };

  const submit = async () => {
    if (locationType === "at_home" && (!addressLine1.trim() || !addressCity.trim())) {
      toast.error(pp("customNeedStreetCity"));
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Convert datetime-local to ISO string if provided
      let preferredStartAtIso: string | null = null;
      if (preferredStartAt) {
        // datetime-local returns format: "YYYY-MM-DDTHH:mm"
        // Convert to ISO string for API
        const date = new Date(preferredStartAt);
        if (!isNaN(date.getTime())) {
          preferredStartAtIso = date.toISOString();
        }
      }
      
      // Validate budget_max >= budget_min if both provided
      if (budgetMin && budgetMax && Number(budgetMax) < Number(budgetMin)) {
        toast.error(pp("customBudgetOrder"));
        setIsSubmitting(false);
        return;
      }
      
      const durationParsed = Number(durationMinutes);
      const durationSafe =
        Number.isFinite(durationParsed) && durationParsed >= 15
          ? Math.min(8 * 60, Math.floor(durationParsed))
          : 60;

      const payload: Record<string, unknown> = {
        provider_id: providerId,
        description,
        budget_min: budgetMin ? Number(budgetMin) : null,
        budget_max: budgetMax ? Number(budgetMax) : null,
        preferred_start_at: preferredStartAtIso,
        duration_minutes: durationSafe,
        image_urls: filterValidHttpUrls(imageUrls).slice(0, 6),
        location_type: locationType,
      };

      if (locationType === "at_home") {
        payload.address_line1 = addressLine1;
        payload.address_line2 = addressLine2;
        payload.address_city = addressCity;
        payload.address_state = addressState;
        payload.address_postal_code = addressPostalCode;
        payload.address_country = addressCountry.trim() || defaultCountryName;
      }

      const res = await fetcher.post<{ data: any }>("/api/me/custom-requests", payload);
      toast.success(pp("customRequestSent"));
      router.push("/account-settings/custom-requests");
      return res.data;
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : pp("customSendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = description.trim().length >= 10;

  // Quick template options for common requests
  const quickTemplates = [
    { label: pp("customTplWedding"), value: pp("customTplWeddingBody") },
    { label: pp("customTplOccasion"), value: pp("customTplOccasionBody") },
    { label: pp("customTplPackage"), value: pp("customTplPackageBody") },
    { label: pp("customTplGroup"), value: pp("customTplGroupBody") },
  ];

  const applyTemplate = (template: string) => {
    setDescription(template);
  };

  const pageIntro = (
    <div className="max-w-3xl mx-auto mb-8 md:mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg">
          <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">{pp("requestCustomService")}</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 md:p-6 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">{pp("howItWorks")}</h3>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              {pp("customHowItWorksBody")}
            </p>
            <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
              <li>{pp("customStepVision")}</li>
              <li>{pp("customStepPhotos")}</li>
              <li>{pp("customStepOffer")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Show message if provider doesn't accept custom requests
  if (!acceptsCustomRequests) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <EmptyState
            title={pp("requestCustomService")}
            description={pp("customServiceLead", { name: businessName || pp("providerFallback") })}
            icon={AlertCircle}
          />
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
        {pageIntro}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden p-8 md:p-10 space-y-6 animate-pulse">
            <div className="h-10 bg-gray-100 rounded-lg w-2/3" />
            <div className="h-32 bg-gray-50 rounded-xl" />
            <div className="h-24 bg-gray-50 rounded-xl" />
            <div className="h-40 bg-gray-50 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    const loginHref = `/login?next=${encodeURIComponent(loginNext)}`;
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
        {pageIntro}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 md:px-10 py-14 md:py-16 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200/80">
                <Lock className="h-8 w-8 text-gray-600" aria-hidden />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900 tracking-tight">{pp("signInTitle")}</h2>
              <p className="mt-3 max-w-md mx-auto text-sm text-gray-600 leading-relaxed">
                {pp("customServiceLead", { name: businessName || pp("providerFallback") })}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                <Button
                  asChild
                  className="rounded-xl h-12 px-8 font-semibold text-base bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white shadow-lg border-0"
                >
                  <Link href={loginHref}>{t("web.a11y.signIn")}</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-xl h-12 px-8 font-medium border-gray-200">
                  <Link href="/signup">{t("auth.signup")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 md:py-12">
      {pageIntro}

      {/* Form Section - Apple-style card design */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-10 space-y-8 md:space-y-10">
            {/* Description Section with Quick Templates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gray-600" />
                  {pp("customLookingFor")} <span className="text-red-500">*</span>
                </Label>
                <span className="text-xs text-gray-500">
                  {description.trim().length >= 10 ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      {pp("customCharCount", { count: description.trim().length })}
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      {pp("customCharsMin", { count: description.trim().length })}
                    </span>
                  )}
                </span>
              </div>
              
              {/* Quick Templates */}
              <div className="flex flex-wrap gap-2 mb-3">
                {quickTemplates.map((template, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyTemplate(template.value)}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors border border-gray-200"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={pp("customDescriptionPlaceholder")}
                rows={6}
                className="w-full resize-none border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl text-base placeholder:text-gray-400 transition-all"
              />
              <p className="text-xs text-gray-500">
                {pp("customDescriptionTip")}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Budget Section */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-600" />
                {pp("customBudgetRange")} <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budgetMin" className="text-xs text-gray-600 font-medium">
                    {pp("customBudgetMin", { currency: currencyCode })}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{currencySymbol}</span>
                    <Input 
                      id="budgetMin"
                      value={budgetMin} 
                      onChange={(e) => setBudgetMin(e.target.value)} 
                      type="number" 
                      min={0}
                      placeholder="500"
                      className="ps-8 border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budgetMax" className="text-xs text-gray-600 font-medium">
                    {pp("customBudgetMax", { currency: currencyCode })}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{currencySymbol}</span>
                    <Input 
                      id="budgetMax"
                      value={budgetMax} 
                      onChange={(e) => setBudgetMax(e.target.value)} 
                      type="number" 
                      min={0}
                      placeholder="2000"
                      className="ps-8 border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">{pp("customBudgetTip")}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Date & Duration Section */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                {pp("customWhenHowLong")} <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preferredStartAt" className="text-xs text-gray-600 font-medium">
                    {pp("customPreferredWhen")}
                  </Label>
                  <Input 
                    id="preferredStartAt"
                    value={preferredStartAt} 
                    onChange={(e) => setPreferredStartAt(e.target.value)} 
                    type="datetime-local"
                    min={new Date().toISOString().slice(0, 16)}
                    className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="durationMinutes" className="text-xs text-gray-600 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {pp("customEstimatedDuration")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="durationMinutes"
                      value={durationMinutes}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setDurationMinutes(60);
                          return;
                        }
                        const n = Number(v);
                        if (!Number.isFinite(n) || n < 15) return;
                        setDurationMinutes(Math.min(8 * 60, Math.floor(n)));
                      }}
                      type="number"
                      min={15}
                      step={15}
                      placeholder="60"
                      className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base pe-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{pp("customMinutes")}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">{pp("customFlexibleHint")}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Location Type Section - Apple-style segmented control */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-600" />
                {pp("customServiceLocation")}
              </Label>
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => {
                    setLocationType("at_salon");
                    setAddressPlaceName("");
                    setAddressLine1("");
                    setAddressLine2("");
                    setAddressCity("");
                    setAddressState("");
                    setAddressPostalCode("");
                    setAddressCountry("");
                  }}
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                    locationType === "at_salon"
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {pp("atSalon")}
                </button>
                <button
                  onClick={() => setLocationType("at_home")}
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                    locationType === "at_home"
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {pp("atYourHome")}
                </button>
              </div>
              
              {locationType === "at_home" && (
                <div className="space-y-4 pt-4">
                  <AddressAutocomplete
                    value={addressPlaceName || addressLine1}
                    inputId="custom-request-at-home-address"
                    label={pp("customSearchAddress")}
                    placeholder={pp("customSearchAddressPlaceholder")}
                    country={mapboxCountryIso}
                    defaultCountryName={defaultCountryName}
                    onInputChange={(value) => {
                      setAddressPlaceName(value);
                      setAddressLine1(value);
                    }}
                    onChange={(addr) =>
                      applyAtHomeAddress({
                        address_line1: addr.address_line1,
                        city: addr.city,
                        state: addr.state,
                        postal_code: addr.postal_code,
                        country: addr.country,
                        place_name: addr.place_name,
                      })
                    }
                    inputClassName="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                  />
                  <p className="text-xs text-gray-500">
                    {pp("customAddressHint")}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="addressLine2" className="text-xs text-gray-600 font-medium">
                      {pp("customUnitOptional")}
                    </Label>
                    <Input
                      id="addressLine2"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder={pp("customUnitPlaceholder")}
                      className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="addressCity" className="text-xs text-gray-600 font-medium">
                        {pp("customCity")} <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="addressCity"
                        value={addressCity}
                        onChange={(e) => setAddressCity(e.target.value)}
                        placeholder={pp("customCity")}
                        className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="addressPostalCode" className="text-xs text-gray-600 font-medium">
                        {pp("customPostal")}
                      </Label>
                      <Input
                        id="addressPostalCode"
                        value={addressPostalCode}
                        onChange={(e) => setAddressPostalCode(e.target.value)}
                        placeholder={pp("customPostal")}
                        className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressState" className="text-xs text-gray-600 font-medium">
                      {pp("customProvince")}
                    </Label>
                    <Input
                      id="addressState"
                      value={addressState}
                      onChange={(e) => setAddressState(e.target.value)}
                      placeholder={pp("customProvince")}
                      className="border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-pink-200 rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100"></div>

            {/* Inspiration Photos Section */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-600" />
                {pp("customInspiration")}
                <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>
              </Label>

              {/* File Upload Area */}
              <div className="space-y-3">
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => !uploadingImages && imageUrls.length < 6 && fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    uploadingImages || imageUrls.length >= 6
                      ? "border-gray-300 bg-gray-50 cursor-not-allowed opacity-60"
                      : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileSelect}
                    disabled={uploadingImages || imageUrls.length >= 6}
                    className="hidden"
                  />
                  {uploadingImages ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      <span className="text-sm text-gray-600">{pp("customUploading")}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {imageUrls.length >= 6
                          ? pp("customMaxReached")
                          : pp("customClickUpload")}
                      </span>
                      <span className="text-xs text-gray-500">{pp("customImageTypes")}</span>
                    </div>
                  )}
                </div>

                {/* Image Previews */}
                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {imageUrls.map((url, index) => {
                      const _isUploaded = index < uploadedImages.length;
                      const previewUrl = imagePreviewUrls[index] || url;
                      return (
                        <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                          <Image
                            src={previewUrl}
                            alt={pp("customInspirationAlt", { index: index + 1 })}
                            fill
                            className="object-cover"
                            onError={(e) => {
                              // Hide broken images
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            aria-label={pp("customRemoveImage")}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Manual URL Input (Alternative) */}
                <div className="space-y-2">
                  <Label htmlFor="imageUrls" className="text-xs text-gray-600 font-medium">
                    {pp("customPasteUrls")}
                  </Label>
                  <Textarea
                    id="imageUrls"
                    value={imageUrlsText}
                    onChange={(e) => setImageUrlsText(e.target.value)}
                    placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                    rows={2}
                    className="w-full resize-none border-gray-200 focus:border-gray-400 focus:ring-0 rounded-xl text-sm placeholder:text-gray-400 transition-colors font-mono"
                    disabled={imageUrls.length >= 6}
                  />
                </div>

                {imageUrls.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {pp("customImagesAdded", { count: imageUrls.length })}
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  {pp("customShareVision")}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions - Apple-style */}
          <div className="px-6 md:px-10 py-6 bg-gray-50/50 border-t border-gray-100">
            <div className="flex flex-col-reverse md:flex-row justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => router.back()} 
                disabled={isSubmitting}
                className="rounded-xl h-12 px-6 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium"
              >
                {pp("customCancel")}
              </Button>
              <Button 
                onClick={submit} 
                disabled={isSubmitting || !isValid}
                className={`rounded-xl h-12 px-8 font-semibold text-base transition-all duration-200 ${
                  isValid && !isSubmitting
                    ? "bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white shadow-lg hover:shadow-xl"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {pp("customSending")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {pp("customSend")}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
