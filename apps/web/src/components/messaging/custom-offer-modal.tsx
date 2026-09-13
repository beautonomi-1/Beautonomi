"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import Image from "next/image";
import { Sparkles, X, Upload, Loader2 } from "lucide-react";
import { RADIX_SELECT_NONE } from "@/lib/ui/select-radix-sentinels";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { mergeCurrencyChoiceCodes, currencySelectLabel } from "@/lib/locale/currency";
import { cn } from "@/lib/utils";
import { useTranslation } from "@beautonomi/i18n";

interface CustomOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName?: string;
  conversationId?: string | null;
  editOfferId?: string | null;
  onSuccess?: () => void;
}

interface AvailableSlotRow {
  time: string;
  available?: boolean;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromDateTimeLocal(value: string): { date: string; time: string } {
  const [date, rawTime] = value.split("T");
  return { date: date || toDateKey(new Date()), time: (rawTime || "10:00").slice(0, 5) };
}

function toDateTimeLocal(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}`;
}

export default function CustomOfferModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  conversationId,
  editOfferId,
  onSuccess,
}: CustomOfferModalProps) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(tenantCurrency);
  const currencyOptions = useMemo(
    () => mergeCurrencyChoiceCodes(tenantCurrency, currency),
    [tenantCurrency, currency]
  );
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [locationType, setLocationType] = useState<"at_home" | "at_salon">("at_salon");
  const [expirationDays, setExpirationDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [preferredStartAt, setPreferredStartAt] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotRow[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [travelFee, setTravelFee] = useState("");

  const isEditMode = Boolean(editOfferId);

  // Load service categories and staff members; when editing, load offer to pre-fill
  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadStaffMembers();
      loadLocations();
      if (editOfferId) {
        loadOfferForEdit(editOfferId);
      } else {
        setCurrency(tenantCurrency);
      }
    }
  }, [isOpen, editOfferId, tenantCurrency]);

  const loadOfferForEdit = async (offerId: string) => {
    try {
      const res = await fetcher.get<{ data: any }>(`/api/provider/custom-offers/${offerId}`);
      const offer = res?.data;
      if (!offer) return;
      const req = offer.request;
      setPrice(String(offer.price ?? ""));
      setCurrency(offer.currency ?? tenantCurrency);
      setDurationMinutes(String(offer.duration_minutes ?? 60));
      setNotes(offer.notes ?? "");
      setStaffId(offer.staff_id ?? null);
      setLocationId(offer.location_id ?? null);
      setTravelFee(offer.travel_fee != null ? String(offer.travel_fee) : "");
      if (req) {
        setServiceName(req.service_name ?? "");
        setDescription(req.description ?? "");
        setLocationType(req.location_type === "at_home" ? "at_home" : "at_salon");
        setServiceCategoryId(req.service_category_id ?? null);
        setAddressLine1(req.address_line1 ?? "");
        setAddressCity(req.address_city ?? "");
        setAddressCountry(req.address_country ?? "");
        if (req.preferred_start_at) {
          const d = new Date(req.preferred_start_at);
          setPreferredStartAt(d.toISOString().slice(0, 16));
        }
      }
    } catch (err) {
      console.error("Failed to load offer for edit:", err);
      toast.error(t("web.messaging.customOfferModal.loadOfferFailed"));
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/public/categories/global");
      setCategories(response.data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
      // Continue without categories
    }
  };

  const loadStaffMembers = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; name: string; is_active: boolean }> }>("/api/provider/staff");
      // Only show active staff members
      const activeStaff = (response.data || []).filter((staff) => staff.is_active);
      setStaffMembers(activeStaff);
    } catch (err) {
      console.error("Failed to load staff members:", err);
      // Continue without staff selection
    }
  };

  const loadLocations = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; name: string }> }>("/api/provider/locations");
      setLocations(response.data || []);
    } catch (err) {
      console.error("Failed to load locations:", err);
    }
  };

  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const selectedSlotParts = fromDateTimeLocal(preferredStartAt || toDateTimeLocal(toDateKey(new Date()), "10:00"));

  useEffect(() => {
    if (!isOpen) return;
    const duration = Number(durationMinutes);
    if (!Number.isFinite(duration) || duration < 15) return;
    let cancelled = false;
    setLoadingSlots(true);
    const params = new URLSearchParams({
      date: selectedSlotParts.date,
      duration_minutes: String(duration),
      mode: locationType === "at_home" ? "mobile" : "salon",
      travel_buffer: locationType === "at_home" ? "30" : "0",
    });
    if (staffId) params.set("staff_ids", staffId);
    if (locationType === "at_salon" && locationId) params.set("location_id", locationId);
    fetcher
      .get<{ data?: { slots?: string[]; slot_grid?: AvailableSlotRow[] } }>(`/api/provider/bookings/available-slots?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const grid = res.data?.slot_grid;
        const rows = Array.isArray(grid) && grid.length > 0
          ? grid
          : (res.data?.slots ?? []).map((time) => ({ time, available: true }));
        setAvailableSlots(rows);
        const available = rows.filter((slot) => slot.available !== false).map((slot) => slot.time.slice(0, 5));
        if (available.length > 0 && !available.includes(selectedSlotParts.time)) {
          setPreferredStartAt(toDateTimeLocal(selectedSlotParts.date, available[0]));
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [durationMinutes, isOpen, locationId, locationType, selectedSlotParts.date, selectedSlotParts.time, staffId]);

  const handleQuickTemplate = (
    template: "weddingPackage" | "specialOccasion" | "packageDeal" | "groupBooking",
  ) => {
    const templates: Record<typeof template, string> = {
      weddingPackage: t("web.messaging.customOfferModal.templateWeddingPackageBody"),
      specialOccasion: t("web.messaging.customOfferModal.templateSpecialOccasionBody"),
      packageDeal: t("web.messaging.customOfferModal.templatePackageDealBody"),
      groupBooking: t("web.messaging.customOfferModal.templateGroupBookingBody"),
    };
    setDescription(templates[template] || "");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files);
    const maxBytes = 5 * 1024 * 1024;

    for (const file of imageFiles) {
      if (file.size > maxBytes) {
        toast.error(t("web.messaging.customOfferModal.imageTooLarge", { name: file.name }));
        return;
      }
    }

    if (imageUrls.length + imageFiles.length > 6) {
      toast.error(t("web.messaging.customOfferModal.maxImagesAllowed"));
      return;
    }

    setUploadingImages(true);
    try {
      const formData = new FormData();
      imageFiles.forEach((file) => formData.append("files", file));

      const response = await fetcher.post<{ data: { urls: string[]; count: number; partial?: boolean } }>(
        "/api/provider/custom-offers/upload",
        formData,
      );

      if (response.data?.urls?.length) {
        setImageUrls((prev) => [...prev, ...response.data.urls].slice(0, 6));
        const count = response.data.count || response.data.urls.length;
        toast.success(t("web.messaging.customOfferModal.imagesUploaded", { count }));
        if (response.data.partial) {
          toast.warning(t("web.messaging.customOfferModal.partialUploadWarning"));
        }
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : t("web.messaging.customOfferModal.uploadImagesFailed");
      toast.error(msg);
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateExpirationDate = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  const MIN_DESC = 5;

  const isValid = () => {
    return (
      description.trim().length >= MIN_DESC &&
      description.trim().length <= 4000 &&
      price !== "" &&
      Number(price) >= 0 &&
      durationMinutes &&
      Number(durationMinutes) >= 15 &&
      Number(durationMinutes) <= 480 &&
      expirationDays &&
      Number(expirationDays) > 0
    );
  };

  const validationHint = useMemo(() => {
    const d = description.trim();
    if (d.length > 0 && d.length < MIN_DESC) return t("web.messaging.customOfferModal.descCharsNeeded", { count: MIN_DESC - d.length });
    if (!price || Number.isNaN(Number(price)) || Number(price) < 0) return t("web.messaging.customOfferModal.invalidPrice");
    const dm = Number(durationMinutes);
    if (!Number.isFinite(dm) || dm < 15 || dm > 480) return t("web.messaging.customOfferModal.invalidDuration");
    const ex = Number(expirationDays);
    if (!Number.isFinite(ex) || ex <= 0) return t("web.messaging.customOfferModal.invalidExpiration");
    if (locationType === "at_home" && !addressLine1.trim()) {
      return t("web.messaging.customOfferModal.houseCallNeedsAddress");
    }
    if (locationType === "at_salon" && !locationId) {
      return t("web.messaging.customOfferModal.salonNeedsLocation");
    }
    return null;
  }, [description, price, durationMinutes, expirationDays, locationType, addressLine1, locationId, t]);

  const handleSubmit = async () => {
    if (!isValid()) {
      toast.error(t("web.messaging.customOfferModal.fillRequiredFields"));
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert datetime-local to ISO string if provided
      let preferredStartAtIso: string | null = null;
      if (preferredStartAt) {
        const date = new Date(preferredStartAt);
        if (!isNaN(date.getTime())) {
          preferredStartAtIso = date.toISOString();
        }
      }

      const expirationAt = calculateExpirationDate(Number(expirationDays));

      const payload: Record<string, any> = {
        customer_id: customerId,
        service_category_id: serviceCategoryId || null,
        location_type: locationType,
        description: description.trim(),
        price: Number(price),
        currency: currency,
        duration_minutes: Number(durationMinutes),
        expiration_at: expirationAt,
        notes: notes.trim() || null,
        preferred_start_at: preferredStartAtIso,
        image_urls: imageUrls,
        staff_id: staffId || null,
      };
      if (locationType === "at_salon" && locationId) payload.location_id = locationId;
      if (conversationId) payload.conversation_id = conversationId;
      if (serviceName.trim()) payload.service_name = serviceName.trim();
      if (locationType === "at_home") {
        if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
        if (addressCity.trim()) payload.address_city = addressCity.trim();
        if (addressCountry.trim()) payload.address_country = addressCountry.trim();
        const fee = Number(travelFee);
        if (!Number.isNaN(fee) && fee >= 0) payload.travel_fee = fee;
      }

      if (editOfferId) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + parseInt(expirationDays));
        await fetcher.patch(`/api/provider/custom-offers/${editOfferId}`, {
          price: Number(price),
          currency: currency || tenantCurrency,
          duration_minutes: Number(durationMinutes),
          expiration_at: expirationDate.toISOString(),
          notes: notes.trim() || null,
          staff_id: staffId || null,
          location_id: locationType === "at_salon" && locationId ? locationId : null,
          scheduled_at: preferredStartAtIso,
          travel_fee: locationType === "at_home" ? (Number.isNaN(Number(travelFee)) ? 0 : Number(travelFee)) : null,
        });
        toast.success(t("web.messaging.customOfferModal.offerUpdated"));
      } else {
        await fetcher.post<{ data: { request: any; offer: any } }>("/api/provider/custom-offers/create", payload);
        toast.success(t("web.messaging.customOfferModal.offerSent"));
      }

      onSuccess?.();
      handleClose();
    } catch (err) {
      if (err instanceof FetchError && err.code === "CUSTOM_OFFERS_DISABLED") {
        toast.error(
          t("web.messaging.customOfferModal.customOffersDisabled"),
          { duration: 12_000 },
        );
        return;
      }
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.messaging.customOfferModal.sendOfferFailed");
      toast.error(t("web.messaging.customOfferModal.couldNotSendOffer", { message: errorMessage }));
      console.error("Error creating custom offer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setServiceName("");
    setDescription("");
    setPrice("");
    setCurrency(tenantCurrency);
    setDurationMinutes("60");
    setLocationType("at_salon");
    setExpirationDays("7");
    setNotes("");
    setPreferredStartAt("");
    setImageUrls([]);
    setServiceCategoryId(null);
    setStaffId(null);
    setLocationId(null);
    setAddressLine1("");
    setAddressCity("");
    setAddressCountry("");
    setTravelFee("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            {isEditMode ? t("web.messaging.customOfferModal.editTitle") : t("web.messaging.customOfferModal.createTitle", { name: customerName || t("web.messaging.customOfferModal.customerFallback") })}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? t("web.messaging.customOfferModal.editDescription")
              : t("web.messaging.customOfferModal.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Templates */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">{t("web.messaging.customOfferModal.quickTemplates")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("weddingPackage")}
                className="rounded-full text-xs"
              >
                {t("web.messaging.customOfferModal.templateWeddingPackage")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("specialOccasion")}
                className="rounded-full text-xs"
              >
                {t("web.messaging.customOfferModal.templateSpecialOccasion")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("packageDeal")}
                className="rounded-full text-xs"
              >
                {t("web.messaging.customOfferModal.templatePackageDeal")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickTemplate("groupBooking")}
                className="rounded-full text-xs"
              >
                {t("web.messaging.customOfferModal.templateGroupBooking")}
              </Button>
            </div>
          </div>

          {/* Service name (optional) - used as booking/calendar title when accepted */}
          <div className="space-y-2">
            <Label htmlFor="serviceName" className="text-sm font-semibold">
              {t("web.messaging.customOfferModal.serviceNameOptional")}
            </Label>
            <Input
              id="serviceName"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder={t("web.messaging.customOfferModal.serviceNamePlaceholder")}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold flex items-center gap-2">
              {t("web.messaging.customOfferModal.serviceDescription")} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("web.messaging.customOfferModal.serviceDescriptionPlaceholder")}
              aria-invalid={description.trim().length > 0 && description.trim().length < MIN_DESC}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              {t("web.messaging.customOfferModal.characterCount", { count: description.trim().length, min: MIN_DESC })}
            </p>
            {validationHint && (
              <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5" role="status">
                {validationHint}
              </p>
            )}
          </div>

          {/* Price and Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price" className="text-sm font-semibold">
{t("web.messaging.customOfferModal.price")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t("web.messaging.customOfferModal.pricePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-semibold">
{t("web.messaging.customOfferModal.currency")} <span className="text-red-500">*</span>
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((code) => (
                    <SelectItem key={code} value={code}>
                      {currencySelectLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration and Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration" className="text-sm font-semibold">
{t("web.messaging.customOfferModal.durationMinutes")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="duration"
                type="number"
                min="15"
                max="480"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="60"
              />
              <p className="text-xs text-gray-500">{t("web.messaging.customOfferModal.durationHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-semibold">
{t("web.messaging.customOfferModal.locationType")} <span className="text-red-500">*</span>
              </Label>
              <Select value={locationType} onValueChange={(value: "at_home" | "at_salon") => setLocationType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="at_salon">{t("web.messaging.customOfferModal.atSalon")}</SelectItem>
                  <SelectItem value="at_home">{t("web.messaging.customOfferModal.atHome")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiration and Preferred Start */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiration" className="text-sm font-semibold">
                {t("web.messaging.customOfferModal.offerExpiresInDays")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="expiration"
                type="number"
                min="1"
                max="30"
                value={expirationDays}
                onChange={(e) => setExpirationDays(e.target.value)}
                placeholder="7"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredStart" className="text-sm font-semibold">
                {t("web.messaging.customOfferModal.appointmentSlot")}
              </Label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-500">{t("web.messaging.customOfferModal.slotsHint")}</p>
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {dateOptions.map((d) => {
                    const key = toDateKey(d);
                    const active = selectedSlotParts.date === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPreferredStartAt(toDateTimeLocal(key, selectedSlotParts.time))}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
                          active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600",
                        )}
                      >
                        {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {loadingSlots ? (
                    <p className="text-xs text-gray-500">{t("web.messaging.customOfferModal.loadingTimes")}</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-xs text-amber-700">{t("web.messaging.customOfferModal.noSlots")}</p>
                  ) : (
                    availableSlots.slice(0, 32).map((slot) => {
                      const time = slot.time.slice(0, 5);
                      const available = slot.available !== false;
                      const active = selectedSlotParts.time === time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!available}
                          onClick={() => setPreferredStartAt(toDateTimeLocal(selectedSlotParts.date, time))}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40",
                            active
                              ? "border-emerald-700 bg-emerald-600 text-white"
                              : available
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 bg-gray-100 text-gray-400",
                          )}
                        >
                          {time}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* At home: address + optional travel fee */}
          {locationType === "at_home" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.addressForHome")}</Label>
                <Input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder={t("web.messaging.customOfferModal.streetAddress")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.city")}</Label>
                  <Input
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    placeholder={t("web.messaging.customOfferModal.city")}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.country")}</Label>
                  <Input
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                    placeholder={t("web.messaging.customOfferModal.country")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.travelFeeOptional", { currency: tenantCurrency })}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={travelFee}
                  onChange={(e) => setTravelFee(e.target.value)}
                  placeholder={t("web.messaging.customOfferModal.travelFeePlaceholder")}
                />
                <p className="text-xs text-gray-500">{t("web.messaging.customOfferModal.travelFeeHint")}</p>
              </div>
            </>
          )}

          {/* Service Category (optional) */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {t("web.messaging.customOfferModal.serviceCategoryOptional")}
              </Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setServiceCategoryId(null)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    serviceCategoryId == null ? "border-primary bg-primary/10 text-primary" : "border-gray-200 bg-white text-gray-600",
                  )}
                >
                  {t("web.messaging.customOfferModal.anyCategory")}
                </button>
                {categories.map((cat) => {
                  const active = serviceCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setServiceCategoryId(active ? null : cat.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold",
                        active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 bg-white text-gray-600",
                      )}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {locationType === "at_salon" && locations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.venueOptional")}</Label>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => {
                  const active = locationId === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setLocationId(active ? null : loc.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold",
                        active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 bg-white text-gray-600",
                      )}
                    >
                      {loc.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Staff Assignment (optional) */}
          {staffMembers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="staff" className="text-sm font-semibold">
                {t("web.messaging.customOfferModal.assignStaffOptional")}
              </Label>
              <Select
                value={staffId || RADIX_SELECT_NONE}
                onValueChange={(value) => setStaffId(value === RADIX_SELECT_NONE ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.messaging.customOfferModal.selectStaffPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_NONE}>{t("web.messaging.customOfferModal.noSpecificAssignment")}</SelectItem>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {t("web.messaging.customOfferModal.staffAssignmentHint")}
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-semibold">
              {t("web.messaging.customOfferModal.additionalNotesOptional")}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("web.messaging.customOfferModal.notesPlaceholder")}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">{t("web.messaging.customOfferModal.max4000Chars")}</p>
          </div>

          {/* Image Upload (optional) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("web.messaging.customOfferModal.inspirationImagesOptional")}</Label>
            <div
              onClick={() => !uploadingImages && imageUrls.length < 6 && fileInputRef.current?.click()}
              className={cn(
                "relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
                uploadingImages || imageUrls.length >= 6
                  ? "border-gray-300 bg-gray-50 cursor-not-allowed opacity-60"
                  : "border-gray-200 hover:border-gray-400 hover:bg-gray-50",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                multiple
                onChange={handleImageUpload}
                disabled={uploadingImages || imageUrls.length >= 6}
                className="hidden"
              />
              {uploadingImages ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <span className="text-sm text-gray-600">{t("web.messaging.customOfferModal.uploadingImages")}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {imageUrls.length >= 6 ? t("web.messaging.customOfferModal.maxImagesReached") : t("web.messaging.customOfferModal.clickToUpload")}
                  </span>
                  <span className="text-xs text-gray-500">{t("web.messaging.customOfferModal.imageFormatsHint")}</span>
                </div>
              )}
            </div>
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-video">
                    <Image src={url} alt={t("web.messaging.customOfferModal.imagePreviewAlt", { index: index + 1 })} fill className="object-cover rounded" unoptimized />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            {t("web.messaging.customOfferModal.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className={cn(
              "text-white shadow-sm transition-all",
              isValid() && !isSubmitting
                ? "bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary ring-2 ring-primary/30 ring-offset-2"
                : "bg-gradient-to-r from-primary/70 to-primary-hover/80 hover:from-primary/80 hover:to-primary-hover/90 opacity-90",
            )}
          >
            {isSubmitting ? (isEditMode ? t("web.messaging.customOfferModal.updating") : t("web.messaging.customOfferModal.sending")) : isEditMode ? t("web.messaging.customOfferModal.updateOffer") : t("web.messaging.customOfferModal.sendOffer")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
