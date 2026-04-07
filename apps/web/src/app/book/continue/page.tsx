"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Banknote, Loader2, Tag, Heart, FileText, Zap, Clock, MapPin, Repeat } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useModuleConfig, useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import {
  BOOKING_ACCENT,
  BOOKING_BG,
  BOOKING_GLASS_BG,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  BOOKING_BORDER,
  BOOKING_WAITLIST_TEXT,
} from "../constants";
import { isCompleteE164, normalizePhoneToE164 } from "@/lib/phone";
import { defaultPhoneCountryDigitsForNormalize } from "@/lib/user-default-phone-dial";
import { syncBookingDraftTenantFromServer } from "@/lib/booking/booking-draft-tenant";
import { PhoneInput } from "@/components/ui/phone-input";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CustomFieldDefinition } from "@/components/custom-fields/CustomFieldsForm";
import { NATIVE_STORE } from "@/lib/store/native-app-store";

interface ProviderFormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

interface ProviderForm {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  is_active: boolean;
  fields: ProviderFormField[];
}

interface HoldData {
  hold_id: string;
  provider_id: string;
  provider_slug?: string | null;
  staff_id: string | null;
  booking_services_snapshot: Array<{
    offering_id: string;
    staff_id: string | null;
    duration_minutes: number;
    price: number;
    currency: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
  }>;
  start_at: string;
  end_at: string;
  location_type: string;
  location_id: string | null;
  address_snapshot: Record<string, any> | null;
  hold_status: string;
  expires_at: string;
  metadata?: Record<string, any>;
  /** From hold metadata when the slot was reserved with a service package */
  package_id?: string;
  travel_fee?: number;
  travel_distance_km?: number;
  provider_on_demand_accept_enabled?: boolean;
  /** From provider + tenant feature_flags — same as payment routes. */
  deposit_required?: boolean;
  deposit_percentage?: number;
  payment_paystack?: boolean;
  payment_wallet?: boolean;
  gift_cards?: boolean;
}

interface AddonInfo {
  id: string;
  title: string;
  price: number;
  currency: string;
}

type CatalogProduct = {
  id: string;
  name?: string;
  price?: number;
  variants?: Array<{ id: string; retail_price: number }>;
};

function resolvePrefillProductLines(
  catalog: CatalogProduct[],
  lines: Array<{ product_id: string; quantity: number; product_variant_id?: string | null }>
) {
  const out: Array<{
    productId: string;
    productVariantId?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    name: string;
  }> = [];
  for (const line of lines) {
    const p = catalog.find((x) => x.id === line.product_id);
    if (!p) continue;
    let unitPrice = Number(p.price ?? 0) || 0;
    const variantId = line.product_variant_id ?? null;
    if (variantId && Array.isArray(p.variants)) {
      const v = p.variants.find((vv) => vv.id === variantId);
      if (v) unitPrice = Number(v.retail_price ?? 0) || unitPrice;
    }
    const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
    out.push({
      productId: line.product_id,
      productVariantId: variantId,
      quantity: q,
      unitPrice,
      totalPrice: unitPrice * q,
      name: (p.name ?? "Product").trim() || "Product",
    });
  }
  return out;
}

const IOS_APP_URL_CONTINUE = NATIVE_STORE.customer.defaultAppStoreUrl;
const ANDROID_APP_URL_CONTINUE = NATIVE_STORE.customer.defaultPlayStoreUrl;

function MobileAppNudge() {
  const [show, setShow] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    try { if (sessionStorage.getItem("beautonomi_app_banner_dismissed") === "1") return; } catch {}
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /android/i.test(ua);
    if (isIos) { setStoreUrl(IOS_APP_URL_CONTINUE); setLabel("App Store"); setShow(true); }
    else if (isAndroid) { setStoreUrl(ANDROID_APP_URL_CONTINUE); setLabel("Google Play"); setShow(true); }
  }, []);

  if (!show) return null;
  return (
    <p className="text-center text-xs mt-3" style={{ color: BOOKING_TEXT_SECONDARY }}>
      For the best experience,{" "}
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline"
        style={{ color: BOOKING_ACCENT }}
      >
        download the Beautonomi app
      </a>{" "}
      on {label} — manage bookings, get reminders &amp; rebook easily.
    </p>
  );
}

function BookContinueContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const holdId = searchParams?.get("hold_id");
  const rescheduleBookingId = searchParams?.get("reschedule_booking_id") ?? undefined;
  const [status, setStatus] = useState<"loading" | "review" | "consuming" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hold, setHold] = useState<HoldData | null>(null);
  const [allowPayInPerson, setAllowPayInPerson] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">("deposit");
  const [bookingCustomValues, setBookingCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [clientInfo, setClientInfo] = useState<{ firstName: string; lastName: string; email: string; phone: string } | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [specialRequests, setSpecialRequests] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipSuggestions, setTipSuggestions] = useState<number[]>([0, 50, 100, 150, 200]);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [providerForms, setProviderForms] = useState<ProviderForm[]>([]);
  const [providerFormValues, setProviderFormValues] = useState<Record<string, Record<string, string | number | boolean | null>>>({});
  const [bookingCustomDefinitions, setBookingCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addonDetails, setAddonDetails] = useState<AddonInfo[]>([]);
  /** From express-link prefill → sessionStorage, merged with catalog prices for consume payload */
  const [prefillConsumeProducts, setPrefillConsumeProducts] = useState<
    Array<{ productId: string; productVariantId?: string | null; quantity: number; unitPrice: number; totalPrice: number; name: string }>
  >([]);
  const [prefillGiftCardCode, setPrefillGiftCardCode] = useState("");
  /** From booking flow when a service package was selected (`?package=` or Packages UI) — forwarded to consume as `package_id`. */
  const [consumePackageId, setConsumePackageId] = useState<string | null>(null);
  const [requestingNow, setRequestingNow] = useState(false);
  const [subscribeRecurring, setSubscribeRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [groupBookingForRecurring, setGroupBookingForRecurring] = useState(false);
  const { user } = useAuth();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const onDemandConfig = useModuleConfig("on_demand");
  const onDemandAcceptEnabled = useFeatureFlag("on_demand_accept_customer_enabled");
  /** Client details when not loaded from session (e.g. direct link); used for form and submit */
  const [clientForm, setClientForm] = useState<{ firstName: string; lastName: string; email: string; phone: string }>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    void syncBookingDraftTenantFromServer();
  }, []);

  useEffect(() => {
    if (!holdId) {
      setErrorMessage("Missing hold ID. Please start your booking again.");
      setStatus("error");
      return;
    }

    const loadHold = async () => {
      try {
        const res = await fetcher.get<HoldData>(`/api/public/booking-holds/${holdId}`);
        const data = (res as any)?.data ?? res;
        if (!data?.hold_id && !data?.booking_services_snapshot) {
          throw new Error("Invalid hold data");
        }
        const holdData: HoldData = {
          hold_id: data.hold_id ?? data.id ?? holdId,
          provider_id: data.provider_id,
          provider_slug: data.provider_slug ?? null,
          staff_id: data.staff_id,
          booking_services_snapshot: data.booking_services_snapshot ?? [],
          start_at: data.start_at,
          end_at: data.end_at,
          location_type: data.location_type ?? "at_salon",
          location_id: data.location_id,
          address_snapshot: data.address_snapshot,
          hold_status: data.hold_status,
          expires_at: data.expires_at,
          metadata: data.metadata,
          package_id: typeof (data as { package_id?: string }).package_id === "string"
            ? (data as { package_id: string }).package_id
            : undefined,
          travel_fee: data.travel_fee != null ? Number(data.travel_fee) : undefined,
          travel_distance_km: data.travel_distance_km != null ? Number(data.travel_distance_km) : undefined,
          provider_on_demand_accept_enabled: Boolean((data as { provider_on_demand_accept_enabled?: boolean }).provider_on_demand_accept_enabled),
          deposit_required: Boolean((data as { deposit_required?: boolean }).deposit_required),
          deposit_percentage:
            (data as { deposit_percentage?: number }).deposit_percentage != null
              ? Number((data as { deposit_percentage?: number }).deposit_percentage)
              : undefined,
          payment_paystack: (data as { payment_paystack?: boolean }).payment_paystack,
          payment_wallet: (data as { payment_wallet?: boolean }).payment_wallet,
          gift_cards: (data as { gift_cards?: boolean }).gift_cards,
        };
        setHold(holdData);

        try {
          const savedClient = sessionStorage.getItem("beautonomi_booking_client");
          const savedAddons = sessionStorage.getItem("beautonomi_booking_addons");
          const savedRequests = sessionStorage.getItem("beautonomi_booking_special_requests");
          const savedProviderFormResponses = sessionStorage.getItem("beautonomi_booking_provider_form_responses");
          const savedCustomFieldValues = sessionStorage.getItem("beautonomi_booking_custom_field_values");
          if (savedClient) {
            const parsed = JSON.parse(savedClient) as { firstName?: string; lastName?: string; email?: string; phone?: string };
            setClientInfo({
              firstName: parsed.firstName ?? "",
              lastName: parsed.lastName ?? "",
              email: parsed.email ?? "",
              phone: parsed.phone ?? "",
            });
          }
          if (savedAddons) {
            const parsed = JSON.parse(savedAddons) as string[];
            setAddonIds(Array.isArray(parsed) ? parsed : []);
          }
          try {
            const rawGroup = sessionStorage.getItem("beautonomi_booking_group");
            if (rawGroup) {
              const parsed = JSON.parse(rawGroup) as {
                isGroupBooking?: boolean;
                groupParticipants?: unknown[];
              };
              setGroupBookingForRecurring(
                Boolean(parsed?.isGroupBooking && Array.isArray(parsed.groupParticipants) && parsed.groupParticipants.length > 0)
              );
            } else {
              setGroupBookingForRecurring(false);
            }
          } catch {
            setGroupBookingForRecurring(false);
          }
          const savedPromo = sessionStorage.getItem("beautonomi_booking_promotion_code");
          if (savedPromo?.trim()) setPromotionCode(savedPromo.trim());
          const savedGift = sessionStorage.getItem("beautonomi_booking_gift_card_code");
          if (savedGift?.trim()) setPrefillGiftCardCode(savedGift.trim());
          const savedPackageId = sessionStorage.getItem("beautonomi_booking_package_id");
          if (savedPackageId?.trim()) {
            setConsumePackageId(savedPackageId.trim());
          } else {
            const meta = (data.metadata as Record<string, unknown> | undefined) ?? {};
            const fromHold =
              typeof (data as { package_id?: string }).package_id === "string" && (data as { package_id: string }).package_id.trim()
                ? (data as { package_id: string }).package_id.trim()
                : typeof meta.package_id === "string" && meta.package_id.trim()
                  ? (meta.package_id as string).trim()
                  : typeof meta.primary_package_id === "string" && meta.primary_package_id.trim()
                    ? (meta.primary_package_id as string).trim()
                    : null;
            setConsumePackageId(fromHold);
          }
          if (savedRequests != null) setSpecialRequests(savedRequests);
          if (savedProviderFormResponses) {
            try {
              const parsed = JSON.parse(savedProviderFormResponses) as Record<string, Record<string, string | number | boolean | null>>;
              if (parsed && typeof parsed === "object") setProviderFormValues(parsed);
            } catch {
              // ignore
            }
          }
          if (savedCustomFieldValues) {
            try {
              const parsed = JSON.parse(savedCustomFieldValues) as Record<string, string | number | boolean | null>;
              if (parsed && typeof parsed === "object") setBookingCustomValues(parsed);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }

        // Fetch provider online booking settings (allow_pay_in_person, tip_suggestions)
        try {
          const settingsRes = await fetcher
            .get<{ data: { allow_pay_in_person?: boolean; tip_suggestions?: number[] } }>(
              `/api/public/provider-online-booking-settings?provider_id=${holdData.provider_id}`
            )
            .catch(() => ({ data: {} }));
          const data = (settingsRes as any)?.data ?? {};
          setAllowPayInPerson(data.allow_pay_in_person ?? false);
          const tips = data.tip_suggestions;
          setTipSuggestions(Array.isArray(tips) && tips.length > 0 ? tips : [0, 50, 100, 150, 200]);
        } catch {
          setAllowPayInPerson(false);
        }

        setStatus("review");
      } catch (err) {
        const msg =
          err instanceof FetchError
            ? err.message
            : "This hold may have expired. Please start a new booking.";
        setErrorMessage(msg);
        setStatus("error");
      }
    };

    loadHold();
  }, [holdId]);

  useEffect(() => {
    if (!hold) return;
    const pct = hold.deposit_percentage ?? 0;
    const depositChoice = Boolean(hold.deposit_required) && pct > 0;
    if (!depositChoice) setPaymentOption("full");
  }, [hold]);

  useEffect(() => {
    if (!hold) return;
    const paystackEnabled = hold.payment_paystack !== false;
    if (paymentMethod === "card" && !paystackEnabled && allowPayInPerson) {
      setPaymentMethod("cash");
    }
  }, [hold, paymentMethod, allowPayInPerson]);

  useEffect(() => {
    if (!hold?.provider_id || status !== "review") return;
    fetcher
      .get<{ data?: { forms?: ProviderForm[] }; forms?: ProviderForm[] }>(
        `/api/public/provider-forms?provider_id=${hold.provider_id}`
      )
      .then((res) => {
        const data = (res as any)?.data ?? res;
        const forms = data?.forms ?? [];
        setProviderForms(Array.isArray(forms) ? forms : []);
      })
      .catch(() => setProviderForms([]));
  }, [hold?.provider_id, status]);

  useEffect(() => {
    if (status !== "review" || !hold?.provider_slug) {
      if (status !== "review") setPrefillConsumeProducts([]);
      return;
    }
    const raw = sessionStorage.getItem("beautonomi_booking_product_cart");
    if (!raw?.trim()) {
      setPrefillConsumeProducts([]);
      return;
    }
    let lines: Array<{ product_id: string; quantity: number; product_variant_id?: string | null }>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setPrefillConsumeProducts([]);
        return;
      }
      lines = parsed as Array<{ product_id: string; quantity: number; product_variant_id?: string | null }>;
    } catch {
      setPrefillConsumeProducts([]);
      return;
    }
    let cancelled = false;
    fetcher
      .get<CatalogProduct[] | { data?: CatalogProduct[] }>(
        `/api/public/providers/${encodeURIComponent(hold.provider_slug)}/products`
      )
      .then((res) => {
        if (cancelled) return;
        const rawP = (res as { data?: CatalogProduct[] })?.data ?? res;
        const catalog = Array.isArray(rawP) ? rawP : [];
        setPrefillConsumeProducts(resolvePrefillProductLines(catalog, lines));
      })
      .catch(() => setPrefillConsumeProducts([]));
    return () => {
      cancelled = true;
    };
  }, [hold?.provider_slug, status]);

  // Fetch addon details from all services in the hold so we resolve addons from any selected service
  useEffect(() => {
    if (status !== "review" || !hold?.provider_slug || addonIds.length === 0) {
      setAddonDetails([]);
      return;
    }
    const offeringIds = (hold.booking_services_snapshot ?? [])
      .map((s: any) => s.offering_id ?? s.id)
      .filter(Boolean) as string[];
    if (offeringIds.length === 0) return;
    Promise.all(
      offeringIds.map((serviceId) =>
        fetcher
          .get<{ data?: { all_addons?: AddonInfo[] }; all_addons?: AddonInfo[] }>(
            `/api/public/providers/${hold!.provider_slug}/services/${serviceId}/addons`
          )
          .then((res) => {
            const raw = (res as any)?.data?.all_addons ?? (res as any)?.all_addons ?? [];
            return Array.isArray(raw) ? raw : [];
          })
          .catch(() => [] as AddonInfo[])
      )
    ).then((results) => {
      const byId = new Map<string, AddonInfo>();
      for (const list of results) {
        for (const a of list) {
          if (a?.id && !byId.has(a.id)) byId.set(a.id, a);
        }
      }
      const details = addonIds.map((id) => byId.get(id)).filter(Boolean) as AddonInfo[];
      setAddonDetails(details);
    });
  }, [status, hold?.provider_slug, hold?.booking_services_snapshot, addonIds.join(",")]);

  useEffect(() => {
    if (status !== "review") return;
    fetcher
      .get<{ data?: { definitions?: CustomFieldDefinition[] }; definitions?: CustomFieldDefinition[] }>(
        "/api/custom-fields/definitions?entity_type=booking"
      )
      .then((res) => {
        const data = (res as any)?.data ?? res;
        const defs = data?.definitions ?? [];
        setBookingCustomDefinitions(Array.isArray(defs) ? defs : []);
      })
      .catch(() => setBookingCustomDefinitions([]));
  }, [status]);

  const updateProviderFormValue = useCallback((formId: string, fieldId: string, value: string | number | boolean | null) => {
    setProviderFormValues((prev) => ({
      ...prev,
      [formId]: {
        ...(prev[formId] ?? {}),
        [fieldId]: value,
      },
    }));
  }, []);

  const handleRequestNow = useCallback(async () => {
    if (!hold || !user) {
      router.push(`/login?return_to=${encodeURIComponent(`/book/continue?hold_id=${holdId}`)}`);
      return;
    }
    setRequestingNow(true);
    setValidationError(null);
    try {
      const requestPayload = {
        provider_id: hold.provider_id,
        services: (hold.booking_services_snapshot ?? []).map((s: any) => ({
          offering_id: s.offering_id ?? s.id ?? "",
          staff_id: hold.staff_id ?? undefined,
        })),
        selected_datetime: hold.start_at,
        location_type: hold.location_type === "at_home" ? "at_home" : "at_salon",
        location_id: hold.location_id ?? null,
        address: hold.address_snapshot ?? null,
        addons: addonIds ?? [],
        tip_amount: tipAmount ?? 0,
        travel_fee: hold.travel_fee ?? 0,
      };
      const hasClientFromSession = clientInfo && (clientInfo.firstName || clientInfo.lastName || clientInfo.email || clientInfo.phone);
      const effectiveClient = hasClientFromSession ? clientInfo! : clientForm;
      if (effectiveClient && (effectiveClient.firstName || effectiveClient.lastName || effectiveClient.email)) {
        (requestPayload as Record<string, unknown>).client_info = {
          firstName: effectiveClient.firstName?.trim() || "Guest",
          lastName: effectiveClient.lastName?.trim() || "User",
          email: effectiveClient.email?.trim() || undefined,
          phone: effectiveClient.phone?.trim() || undefined,
        };
      }
      const res = await fetcher.post<{ id: string } | { data: { id: string } }>(
        "/api/me/on-demand/requests",
        { provider_id: hold.provider_id, request_payload: requestPayload }
      );
      const data = res as { id?: string; data?: { id?: string } };
      const requestId = data?.id ?? data?.data?.id;
      if (requestId) {
        router.replace(`/book/on-demand/waiting?requestId=${encodeURIComponent(requestId)}`);
      } else {
        setValidationError("Could not submit request. Try again or complete a scheduled booking.");
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Could not submit request. Try again or complete a scheduled booking.";
      setValidationError(msg);
    } finally {
      setRequestingNow(false);
    }
  }, [hold, user, holdId, addonIds, tipAmount, clientInfo, clientForm, router]);

  const handleComplete = async () => {
    if (!holdId || !hold) return;

    const hasClientFromSession = clientInfo && (clientInfo.firstName || clientInfo.lastName || clientInfo.email || clientInfo.phone);
    const effectiveClient = hasClientFromSession ? clientInfo! : clientForm;
    const hasName = (effectiveClient.firstName ?? "").trim() || (effectiveClient.lastName ?? "").trim();
    const hasEmail = (effectiveClient.email ?? "").trim();
    if (!hasName || !hasEmail) {
      setValidationError("Please enter your name and email to continue.");
      return;
    }

    const rawContinuePhone = (effectiveClient.phone ?? "").trim();
    if (rawContinuePhone && !isCompleteE164(rawContinuePhone)) {
      setValidationError("Enter a valid phone number or leave the phone field blank.");
      return;
    }

    const requiredCustomNames = bookingCustomDefinitions.filter((d) => d.is_required).map((d) => d.name);
    const missingCustom = requiredCustomNames.filter(
      (name) =>
        bookingCustomValues[name] === undefined ||
        bookingCustomValues[name] === null ||
        String(bookingCustomValues[name]).trim() === ""
    );
    if (missingCustom.length > 0) {
      setValidationError("Please fill in all required additional details (marked with *).");
      return;
    }

    for (const form of providerForms) {
      if (!form.is_required) continue;
      for (const field of form.fields || []) {
        if (!field.is_required) continue;
        const val = providerFormValues[form.id]?.[field.id];
        if (val === undefined || val === null || String(val).trim() === "") {
          setValidationError(`Please complete the required form: "${form.title}" (${field.name}).`);
          return;
        }
      }
    }

    setValidationError(null);
    setStatus("consuming");
    try {
      const payload: Record<string, any> = {
        payment_method: paymentMethod,
        payment_option: paymentOption,
        use_wallet: false,
        custom_field_values: Object.keys(bookingCustomValues).length > 0 ? bookingCustomValues : undefined,
        provider_form_responses:
          Object.keys(providerFormValues).length > 0 ? providerFormValues : undefined,
        addons: addonIds.length > 0 ? addonIds : undefined,
        special_requests: specialRequests.trim() || undefined,
        tip_amount: tipAmount > 0 ? tipAmount : undefined,
        promotion_code: promotionCode.trim() || undefined,
        gift_card_code: prefillGiftCardCode.trim() || undefined,
      };
      if (prefillConsumeProducts.length > 0) {
        payload.products = prefillConsumeProducts.map((r) => ({
          productId: r.productId,
          productVariantId: r.productVariantId ?? undefined,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalPrice: r.totalPrice,
        }));
      }
      if (consumePackageId) {
        payload.package_id = consumePackageId;
        payload.primary_package_id = consumePackageId;
      }
      if (rescheduleBookingId) payload.reschedule_booking_id = rescheduleBookingId;
      if (effectiveClient && (effectiveClient.firstName || effectiveClient.lastName || effectiveClient.email || effectiveClient.phone)) {
        const rawPhone = effectiveClient.phone?.trim();
        const phoneE164 =
          rawPhone
            ? normalizePhoneToE164(rawPhone, defaultPhoneCountryDigitsForNormalize()) ||
              normalizePhoneToE164(rawPhone)
            : undefined;
        payload.client_info = {
          firstName: effectiveClient.firstName.trim() || "Guest",
          lastName: effectiveClient.lastName.trim() || "User",
          email: effectiveClient.email.trim() || undefined,
          phone: phoneE164 || rawPhone || undefined,
        };
      }
      try {
        const savedGroup = sessionStorage.getItem("beautonomi_booking_group");
        if (savedGroup) {
          const parsed = JSON.parse(savedGroup) as { isGroupBooking?: boolean; groupParticipants?: Array<{ name: string; email?: string | null; phone?: string | null; service_ids: string[]; notes?: string | null }> };
          if (parsed?.isGroupBooking && Array.isArray(parsed.groupParticipants) && parsed.groupParticipants.length > 0) {
            payload.is_group_booking = true;
            payload.group_participants = parsed.groupParticipants;
          }
        }
      } catch {
        // ignore
      }
      if (
        subscribeRecurring &&
        user &&
        !rescheduleBookingId &&
        !groupBookingForRecurring
      ) {
        payload.subscribe_recurring = { enabled: true, frequency: recurringFrequency };
      }
      const res = await fetcher.post<{
        data?: {
          booking_id?: string;
          booking_number?: string;
          payment_url?: string | null;
          recurring_subscription?: { created: boolean; pending?: boolean; message?: string };
        };
      }>(`/api/public/booking-holds/${holdId}/consume`, payload, {
        timeoutMs: 120_000,
      });

      const data = (res as any)?.data ?? res;
      const paymentUrl = data?.payment_url;
      const bookingId = data?.booking_id;
      const bookingNumber = data?.booking_number;

      if (paymentUrl) {
        if (subscribeRecurring && user) {
          const sub = data?.recurring_subscription;
          if (sub?.pending) {
            toast.info(
              "Complete payment to save your repeating schedule. It will appear under Account settings → Recurring bookings after payment succeeds.",
            );
          }
        }
        setStatus("redirecting");
        window.location.href = paymentUrl;
        return;
      }

      if (subscribeRecurring && user) {
        const sub = data?.recurring_subscription;
        if (sub?.created) {
          toast.success("Repeating schedule saved. Manage it under Account settings → Recurring bookings.");
        } else if (sub?.pending) {
          toast.info(
            "Your repeating schedule will be saved after payment completes.",
          );
        } else if (sub && sub.created === false && sub.message) {
          toast.error(sub.message);
        }
      }

      try {
        sessionStorage.removeItem("beautonomi_booking_client");
        sessionStorage.removeItem("beautonomi_booking_addons");
        sessionStorage.removeItem("beautonomi_booking_special_requests");
        sessionStorage.removeItem("beautonomi_booking_provider_form_responses");
        sessionStorage.removeItem("beautonomi_booking_custom_field_values");
        sessionStorage.removeItem("beautonomi_booking_group");
        sessionStorage.removeItem("beautonomi_booking_promotion_code");
        sessionStorage.removeItem("beautonomi_booking_gift_card_code");
        sessionStorage.removeItem("beautonomi_booking_product_cart");
        sessionStorage.removeItem("beautonomi_booking_package_id");
      } catch {}
      const successUrl = bookingId
        ? `/checkout/success?booking_id=${bookingId}${bookingNumber ? `&booking_number=${bookingNumber}` : ""}`
        : "/checkout/success";
      router.replace(successUrl);
    } catch (err) {
      /* Keep the review screen so the user can retry without losing form data. */
      const msg =
        err instanceof FetchError
          ? err.message
          : "Failed to complete booking. Please try again.";
      setValidationError(msg);
      setStatus("review");
    }
  };

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: BOOKING_BG }}>
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold" style={{ color: BOOKING_ACCENT }}>
            Booking could not be completed
          </h1>
          <p style={{ color: BOOKING_TEXT_SECONDARY }}>{errorMessage}</p>
          <Button onClick={() => router.push("/search")} variant="outline">
            Back to search
          </Button>
        </div>
      </div>
    );
  }

  if (status === "loading" || status === "consuming" || status === "redirecting") {
    const message =
      status === "redirecting"
        ? "Redirecting to payment..."
        : status === "consuming"
        ? "Creating your booking..."
        : "Loading...";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: BOOKING_BG }}>
        <LoadingTimeout loadingMessage={message} />
      </div>
    );
  }

  const handleValidatePromo = async () => {
    if (!promotionCode.trim() || !hold) return;
    setPromoError(null);
    setValidatingPromo(true);
    try {
      const servicesTotal = hold.booking_services_snapshot.reduce((sum, s) => sum + (s.price || 0), 0);
      const addonsSum = addonDetails.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
      const productsSum = prefillConsumeProducts.reduce((s, p) => s + p.totalPrice, 0);
      const amount = servicesTotal + addonsSum + productsSum + (hold.travel_fee ?? 0);
      const res = await fetcher.get<{ valid?: boolean; discount_value?: number; message?: string }>(
        `/api/public/promo-codes/validate?code=${encodeURIComponent(promotionCode.trim())}&amount=${amount}`
      );
      const data = res as any;
      if (data?.valid && data?.discount_value != null) {
        setPromoDiscount(Number(data.discount_value));
      } else {
        setPromoDiscount(null);
        setPromoError(data?.message ?? "Invalid or expired code");
      }
    } catch {
      setPromoDiscount(null);
      setPromoError("Could not validate code");
    } finally {
      setValidatingPromo(false);
    }
  };

  if (status === "review" && hold) {
    const servicesTotal = hold.booking_services_snapshot.reduce(
      (sum, s) => sum + (s.price || 0),
      0
    );
    const addonsTotal = addonDetails.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const productsFromLinkTotal = prefillConsumeProducts.reduce((s, p) => s + p.totalPrice, 0);
    const travelFee = hold.travel_fee ?? 0;
    const promoDiscountAmount = promoDiscount ?? 0;
    const subtotalBeforePromo = servicesTotal + addonsTotal + productsFromLinkTotal + travelFee;
    const subtotalAfterPromo = Math.max(0, subtotalBeforePromo - promoDiscountAmount);
    const totalAmount = subtotalAfterPromo + tipAmount;
    const currency = hold.booking_services_snapshot[0]?.currency ?? tenantCurrency;
    const startDate = new Date(hold.start_at);
    const timeStr = startDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = startDate.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    const paystackEnabled = hold.payment_paystack !== false;
    const depositPct = hold.deposit_percentage ?? 0;
    const showDepositChoice = Boolean(hold.deposit_required) && depositPct > 0;
    const depositAmount = showDepositChoice ? Math.ceil((totalAmount * depositPct) / 100) : 0;
    const remainingAfterDeposit = Math.max(0, totalAmount - depositAmount);
    const cardOnlineBlocked = !paystackEnabled && !allowPayInPerson;

    const cardStyle = {
      background: BOOKING_GLASS_BG,
      backdropFilter: "blur(16px) saturate(180%)",
      WebkitBackdropFilter: "blur(16px) saturate(180%)",
      border: `1px solid ${BOOKING_EDGE}`,
      borderRadius: "24px",
      boxShadow: BOOKING_SHADOW_CARD,
    };

    return (
      <div className="min-h-screen py-8 px-4" style={{ backgroundColor: BOOKING_BG }}>
        <div className="max-w-[430px] mx-auto space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Review your booking
          </h1>

          {/* Booking summary — aligned with provider portal: Services, Add-ons, Travel, Promo, Tip, Total */}
          <div
            className="rounded-3xl p-5 space-y-3 text-white"
            style={{
              backgroundColor: BOOKING_TEXT_PRIMARY,
              border: `1px solid ${BOOKING_EDGE}`,
              boxShadow: BOOKING_SHADOW_CARD,
            }}
          >
            <h2 className="text-sm font-semibold opacity-90 pb-1">Booking summary</h2>
            {hold.booking_services_snapshot.map((s, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-white/10 pb-2 last:border-0">
                <span className="opacity-90">
                  Service {i + 1} · {s.duration_minutes} min
                </span>
                <span className="opacity-95">{formatCurrency(s.price, s.currency)}</span>
              </div>
            ))}
            {addonDetails.length > 0 && addonDetails.map((a) => (
              <div key={a.id} className="flex justify-between text-sm border-b border-white/10 pb-2">
                <span className="opacity-90">{a.title}</span>
                <span className="opacity-95">{formatCurrency(Number(a.price), a.currency || currency)}</span>
              </div>
            ))}
            {prefillConsumeProducts.length > 0 &&
              prefillConsumeProducts.map((p) => (
                <div
                  key={`${p.productId}-${p.productVariantId ?? "base"}`}
                  className="flex justify-between text-sm border-b border-white/10 pb-2"
                >
                  <span className="opacity-90">
                    {p.name} ×{p.quantity}
                  </span>
                  <span className="opacity-95">{formatCurrency(p.totalPrice, currency)}</span>
                </div>
              ))}
            {travelFee > 0 && (
              <div className="flex justify-between text-sm border-b border-white/10 pb-2">
                <span className="opacity-80">
                  Travel fee{hold.travel_distance_km != null ? ` (${hold.travel_distance_km.toFixed(1)} km)` : ""}
                </span>
                <span className="opacity-95">{formatCurrency(travelFee, currency)}</span>
              </div>
            )}
            {promoDiscountAmount > 0 && (
              <div className="flex justify-between text-sm border-b border-white/10 pb-2" style={{ color: "#86efac" }}>
                <span>Promo discount</span>
                <span>-{formatCurrency(promoDiscountAmount, currency)}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="opacity-80">Tip (optional)</span>
                <span className="opacity-95">{formatCurrency(tipAmount, currency)}</span>
              </div>
              <p className="text-xs opacity-75">Tax may be applied at checkout where required.</p>
              <div className="flex justify-between font-semibold text-lg pt-2">
                <span>Total</span>
                <span style={{ color: BOOKING_ACCENT }}>{formatCurrency(totalAmount, currency)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5 text-sm space-y-2 border" style={{ ...cardStyle }}>
            <h2 className="font-medium mb-3" style={{ color: BOOKING_TEXT_PRIMARY }}>Booking details</h2>
            <div className="flex gap-3 items-start">
              <Clock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BOOKING_ACCENT }} />
              <div>
                <p className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>{dateStr} at {timeStr}</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BOOKING_ACCENT }} />
              <div className="space-y-0.5">
                {hold.location_type === "at_salon" ? (
                  <p style={{ color: BOOKING_TEXT_PRIMARY }}>At salon</p>
                ) : (() => {
                  const snap = hold.address_snapshot;
                  if (!snap) return <p style={{ color: BOOKING_TEXT_SECONDARY }}>At your location</p>;
                  const addressParts = [snap.line1, snap.line2, snap.city, snap.postal_code].filter(Boolean);
                  const extras = [
                    snap.apartment_unit ? `Apt/Unit: ${snap.apartment_unit}` : null,
                    snap.building_name ? `Building: ${snap.building_name}` : null,
                    snap.floor_number ? `Floor: ${snap.floor_number}` : null,
                  ].filter(Boolean);
                  const accessCodes = snap.access_codes as Record<string, string> | null | undefined;
                  const codeParts = [
                    accessCodes?.gate ? `Gate: ${accessCodes.gate}` : null,
                    accessCodes?.buzzer ? `Buzzer: ${accessCodes.buzzer}` : null,
                    accessCodes?.door ? `Door: ${accessCodes.door}` : null,
                  ].filter(Boolean);
                  return (
                    <>
                      {addressParts.length > 0 && (
                        <p className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>{addressParts.join(", ")}</p>
                      )}
                      {extras.length > 0 && <p style={{ color: BOOKING_TEXT_SECONDARY }}>{extras.join(" · ")}</p>}
                      {codeParts.length > 0 && (
                        <p style={{ color: BOOKING_TEXT_SECONDARY }}>🔑 {codeParts.join(" · ")}</p>
                      )}
                      {snap.parking_instructions && (
                        <p className="text-xs mt-1" style={{ color: BOOKING_TEXT_SECONDARY }}>
                          <span className="font-medium">Parking:</span> {String(snap.parking_instructions)}
                        </p>
                      )}
                      {snap.location_landmarks && (
                        <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                          <span className="font-medium">Landmarks:</span> {String(snap.location_landmarks)}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>Your details</h2>
            {clientInfo && (clientInfo.firstName || clientInfo.lastName || clientInfo.email || clientInfo.phone) ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(clientInfo.firstName || clientInfo.lastName) && (
                  <p><span className="text-muted-foreground">Name:</span> {[clientInfo.firstName, clientInfo.lastName].filter(Boolean).join(" ")}</p>
                )}
                {clientInfo.email && <p><span className="text-muted-foreground">Email:</span> {clientInfo.email}</p>}
                {clientInfo.phone && <p><span className="text-muted-foreground">Phone:</span> {clientInfo.phone}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm" onBlur={() => setValidationError(null)}>
                <div className="space-y-1">
                  <Label htmlFor="continue-first">First name *</Label>
                  <Input
                    id="continue-first"
                    placeholder="First name"
                    value={clientForm.firstName}
                    onChange={(e) => setClientForm((p) => ({ ...p, firstName: e.target.value }))}
                    className="rounded-xl border"
                    style={{ borderColor: BOOKING_BORDER }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="continue-last">Last name *</Label>
                  <Input
                    id="continue-last"
                    placeholder="Last name"
                    value={clientForm.lastName}
                    onChange={(e) => setClientForm((p) => ({ ...p, lastName: e.target.value }))}
                    className="rounded-xl border"
                    style={{ borderColor: BOOKING_BORDER }}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="continue-email">Email *</Label>
                  <Input
                    id="continue-email"
                    type="email"
                    placeholder="you@example.com"
                    value={clientForm.email}
                    onChange={(e) => setClientForm((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-xl border"
                    style={{ borderColor: BOOKING_BORDER }}
                    autoComplete="email"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <PhoneInput
                    inputId="book-continue-client-phone"
                    label="Phone (optional)"
                    value={clientForm.phone}
                    onChange={(e164) => setClientForm((p) => ({ ...p, phone: e164 }))}
                    placeholder="Phone number"
                    className="rounded-xl"
                  />
                </div>
              </div>
            )}
            {specialRequests && <p className="text-sm text-muted-foreground">Notes: {specialRequests}</p>}
            {addonDetails.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Add-ons: {addonDetails.map((a) => a.title).join(", ")}
              </p>
            )}
          </div>

          {user && !rescheduleBookingId && !groupBookingForRecurring && (
            <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
              <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
                <Repeat className="h-4 w-4" style={{ color: BOOKING_ACCENT }} />
                Repeat this booking
              </h2>
              <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
                When enabled, we save the same services on a repeating schedule as soon as your booking is created.
                You pay per visit unless you pay in the app. External payment pages still get the repeat schedule—you can
                manage it under Account settings.
              </p>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="subscribe-recurring"
                  checked={subscribeRecurring}
                  onCheckedChange={(c) => setSubscribeRecurring(c === true)}
                  className="mt-1"
                />
                <div className="space-y-2 flex-1 min-w-0">
                  <Label
                    htmlFor="subscribe-recurring"
                    className="text-sm font-medium cursor-pointer"
                    style={{ color: BOOKING_TEXT_PRIMARY }}
                  >
                    Turn on repeating visits
                  </Label>
                  {subscribeRecurring && (
                    <div className="space-y-1">
                      <Label htmlFor="recurring-freq" className="text-xs text-muted-foreground">
                        How often
                      </Label>
                      <select
                        id="recurring-freq"
                        value={recurringFrequency}
                        onChange={(e) =>
                          setRecurringFrequency(e.target.value as "weekly" | "biweekly" | "monthly")
                        }
                        className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm min-h-[44px]"
                        style={{ borderColor: BOOKING_BORDER }}
                      >
                        <option value="weekly">Every week</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="monthly">Every month</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
              <Tag className="h-4 w-4" style={{ color: BOOKING_ACCENT }} /> Promo code
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="Enter code"
                value={promotionCode}
                onChange={(e) => { setPromotionCode(e.target.value.toUpperCase()); setPromoError(null); }}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleValidatePromo} disabled={!promotionCode.trim() || validatingPromo}>
                {validatingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoError && <p className="text-sm text-destructive">{promoError}</p>}
            {promoDiscount != null && promoDiscount > 0 && <p className="text-sm text-green-600">Discount applied.</p>}
          </div>

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
              <Heart className="h-4 w-4" style={{ color: BOOKING_ACCENT }} /> Add a tip (optional)
            </h2>
            <div className="flex flex-wrap gap-2">
              {tipSuggestions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTipAmount(n)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px] transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: tipAmount === n ? BOOKING_ACCENT : "rgba(0,0,0,0.06)",
                    color: tipAmount === n ? "#fff" : BOOKING_TEXT_PRIMARY,
                    border: tipAmount === n ? "none" : `1px solid ${BOOKING_BORDER}`,
                  }}
                >
                  {n === 0 ? "None" : formatCurrency(n, currency)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="tip-custom" className="text-sm">Custom</Label>
              <Input
                id="tip-custom"
                type="number"
                min={0}
                step={10}
                placeholder="0"
                value={tipAmount > 0 && !tipSuggestions.includes(tipAmount) ? tipAmount : ""}
                onChange={(e) => setTipAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-24"
              />
            </div>
          </div>

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>Additional details</h2>
            <p className="text-sm text-muted-foreground">
              {bookingCustomDefinitions.some((d) => d.is_required)
                ? "Please complete all required fields (marked with *)."
                : "Optional information for this booking (e.g. notes, preferences)."}
            </p>
            <CustomFieldsForm
              entityType="booking"
              initialValues={bookingCustomValues}
              onChange={setBookingCustomValues}
              showSaveButton={false}
            />
          </div>

          {providerForms.length > 0 && (
            <div className="rounded-3xl p-5 space-y-4 border" style={cardStyle}>
              <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
                <FileText className="h-4 w-4" style={{ color: BOOKING_ACCENT }} />
                Provider forms
              </h2>
              <p className="text-sm text-muted-foreground">
                Please complete the following forms as required by the provider.
              </p>
              {providerForms.map((form) => (
                <div key={form.id} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div>
                    <h3 className="font-medium text-sm">
                      {form.title}
                      {form.is_required && <span className="text-destructive ml-1">*</span>}
                    </h3>
                    {form.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{form.description}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(form.fields || []).map((field) => (
                      <div key={field.id} className="space-y-1">
                        <Label className="text-sm">
                          {field.name}
                          {field.is_required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        {field.field_type === "text" || field.field_type === "signature" ? (
                          <Input
                            value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                            onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                            placeholder={field.field_type === "signature" ? "Type your name to sign" : undefined}
                            className="mt-1"
                          />
                        ) : field.field_type === "checkbox" ? (
                          <div className="flex items-center gap-2 mt-1">
                            <Checkbox
                              checked={Boolean(providerFormValues[form.id]?.[field.id])}
                              onCheckedChange={(checked) =>
                                updateProviderFormValue(form.id, field.id, checked === true)
                              }
                            />
                            <span className="text-sm text-muted-foreground">Yes</span>
                          </div>
                        ) : field.field_type === "date" ? (
                          <Input
                            type="date"
                            value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                            onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                            className="mt-1"
                          />
                        ) : (
                          <Input
                            value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                            onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                            className="mt-1"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>Payment</h2>
            <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
              Pay online now or in person at the venue.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!paystackEnabled) return;
                  setPaymentMethod("card");
                }}
                disabled={!paystackEnabled}
                className="flex-1 rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2 disabled:opacity-50 disabled:pointer-events-none"
                style={{
                  backgroundColor: paymentMethod === "card" ? BOOKING_ACCENT : "transparent",
                  color: paymentMethod === "card" ? "#fff" : BOOKING_TEXT_PRIMARY,
                  borderColor: paymentMethod === "card" ? BOOKING_ACCENT : BOOKING_BORDER,
                }}
              >
                <CreditCard className="h-5 w-5" />
                Pay online
              </button>
              {allowPayInPerson && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className="flex-1 rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2"
                  style={{
                    backgroundColor: paymentMethod === "cash" ? BOOKING_ACCENT : "transparent",
                    color: paymentMethod === "cash" ? "#fff" : BOOKING_TEXT_PRIMARY,
                    borderColor: paymentMethod === "cash" ? BOOKING_ACCENT : BOOKING_BORDER,
                  }}
                >
                  <Banknote className="h-5 w-5" />
                  Pay at venue
                </button>
              )}
            </div>
            {cardOnlineBlocked && (
              <p className="text-sm pt-1" style={{ color: BOOKING_WAITLIST_TEXT }}>
                Online card payment is unavailable for this market and this provider does not accept pay at venue. You cannot complete checkout here—please contact the salon or try another time.
              </p>
            )}
            {paymentMethod === "card" && showDepositChoice && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium" style={{ color: BOOKING_TEXT_SECONDARY }}>How much would you like to pay now?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentOption("deposit")}
                    className="flex-1 rounded-2xl py-3.5 px-3 text-sm font-medium min-h-[44px] flex flex-col items-center gap-0.5 border-2 transition-all"
                    style={{
                      backgroundColor: paymentOption === "deposit" ? BOOKING_ACCENT : "transparent",
                      color: paymentOption === "deposit" ? "#fff" : BOOKING_TEXT_PRIMARY,
                      borderColor: paymentOption === "deposit" ? BOOKING_ACCENT : BOOKING_BORDER,
                    }}
                  >
                    <span>Deposit ({depositPct}%)</span>
                    <span className="text-lg font-bold">{formatCurrency(depositAmount, currency)}</span>
                    <span className="text-[10px] opacity-75">{formatCurrency(remainingAfterDeposit, currency)} due at appointment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentOption("full")}
                    className="flex-1 rounded-2xl py-3.5 px-3 text-sm font-medium min-h-[44px] flex flex-col items-center gap-0.5 border-2 transition-all"
                    style={{
                      backgroundColor: paymentOption === "full" ? BOOKING_ACCENT : "transparent",
                      color: paymentOption === "full" ? "#fff" : BOOKING_TEXT_PRIMARY,
                      borderColor: paymentOption === "full" ? BOOKING_ACCENT : BOOKING_BORDER,
                    }}
                  >
                    <span>Pay in full</span>
                    <span className="text-lg font-bold">{formatCurrency(totalAmount, currency)}</span>
                    <span className="text-[10px] opacity-75">Nothing due at appointment</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {validationError && (
            <p className="text-sm font-medium" style={{ color: BOOKING_WAITLIST_TEXT }}>{validationError}</p>
          )}
          {onDemandConfig?.enabled && onDemandAcceptEnabled && hold?.provider_on_demand_accept_enabled && (
            <button
              type="button"
              className="w-full rounded-2xl h-14 font-semibold flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] disabled:opacity-70 mb-3 border-2"
              style={{
                backgroundColor: "transparent",
                color: BOOKING_TEXT_PRIMARY,
                borderColor: BOOKING_EDGE,
              }}
              onClick={handleRequestNow}
              disabled={requestingNow || (status as string) === "consuming"}
            >
              {requestingNow ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Zap className="h-5 w-5" style={{ color: BOOKING_ACCENT }} />
              )}
              {requestingNow ? "Submitting..." : "Request now"}
            </button>
          )}
          <button
            type="button"
            className="w-full rounded-2xl h-14 font-semibold text-white flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] disabled:opacity-70"
            style={{ backgroundColor: BOOKING_ACCENT, boxShadow: BOOKING_SHADOW_CARD }}
            onClick={handleComplete}
            disabled={(status as string) === "consuming" || cardOnlineBlocked}
          >
            {(status as string) === "consuming" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : null}
            Complete booking
          </button>

          {/* Mobile app nudge — shown to iOS/Android users only, after hydration */}
          <MobileAppNudge />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingTimeout loadingMessage="Loading..." />
    </div>
  );
}

export default function BookContinuePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingTimeout loadingMessage="Loading..." />
        </div>
      }
    >
      <BookContinueContent />
    </Suspense>
  );
}
