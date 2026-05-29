"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getHoldTimeRemaining, percentOf, serverNowToClockOffsetMs } from "@beautonomi/utils";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { getGuestFingerprintHash } from "@/lib/public-booking/guest-fingerprint";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Banknote, Loader2, Tag, Heart, FileText, Zap, Clock, MapPin, Repeat, ShieldCheck } from "lucide-react";
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
import {
  clearBeautonomiHoldClientMarkers,
  clearBeautonomiHoldIdCookie,
} from "@/lib/booking/clear-hold-client-markers";
import { PhoneInput } from "@/components/ui/phone-input";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CustomFieldDefinition } from "@/components/custom-fields/CustomFieldsForm";
import { NATIVE_STORE } from "@/lib/store/native-app-store";
import { getOsTypeFromNavigator } from "@/lib/utils/os-type";

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

type HoldCancellationPolicy = {
  cancellation_window_hours?: number | null;
  grace_window_minutes?: number | null;
  policy_text?: string | null;
  late_refund_percentage?: number | null;
  fee_amount?: number | null;
  fee_type?: "fixed" | "percentage" | undefined;
  currency?: string | null;
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number | null;
};

interface HoldData {
  hold_id: string;
  provider_id: string;
  provider_slug?: string | null;
  staff_id: string | null;
  booking_services_snapshot: Array<{
    offering_id: string;
    /** Written into snapshot during hold creation (title from offerings table). */
    service_name?: string;
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
  /** From GET /api/public/booking-holds/[id] — align client countdown with server. */
  server_now?: string | null;
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
  cash_enabled_on_platform?: boolean;
  tips_enabled?: boolean;
  tip_presets?: number[];
  /** Provider tax rate; 0 when no tax configured. */
  tax_rate_percent?: number;
  /** True = prices already include tax; false = tax added on top. */
  tax_inclusive?: boolean;
  cancellation_policy?: HoldCancellationPolicy | null;
}

/** Require explicit ack when the policy has material terms the customer needs to understand. */
function cancellationPolicyRequiresCustomerAck(policy: HoldCancellationPolicy | null | undefined): boolean {
  if (!policy) return false;
  const windowHrs = policy.cancellation_window_hours;
  const graceMin = policy.grace_window_minutes;
  const noShowFee =
    policy.no_show_fee_enabled && policy.no_show_fee_amount != null && Number(policy.no_show_fee_amount) > 0;
  const latePct = policy.late_refund_percentage;
  // Require ack when: there's a cancellation window, a grace period, a no-show fee, or a non-full-refund policy.
  // policy_text is NOT used here — it's often a duplicate of the structured fields and including it caused
  // the ack checkbox to appear for all bookings even when no real policy was configured.
  const showLateLine =
    latePct !== undefined && latePct !== null && !Number.isNaN(Number(latePct)) && Number(latePct) < 100;
  return !!(windowHrs || noShowFee || (graceMin != null && graceMin > 0) || showLateLine);
}

function generateConsumeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function HoldSlotCountdown({ expiresAt, clockOffsetMs }: { expiresAt: string; clockOffsetMs: number }) {
  const [tick, setTick] = useState(() => getHoldTimeRemaining(expiresAt, clockOffsetMs));
  const toastFiredRef = useRef(false);
  useEffect(() => {
    setTick(getHoldTimeRemaining(expiresAt, clockOffsetMs));
  }, [expiresAt, clockOffsetMs]);
  useEffect(() => {
    const id = setInterval(() => {
      const next = getHoldTimeRemaining(expiresAt, clockOffsetMs);
      setTick(next);
      // Fire toast exactly once when the slot transitions to expired
      if (next.expired && !toastFiredRef.current) {
        toastFiredRef.current = true;
        toast.warning("Your reserved slot has expired. Please go back and pick a new time.", { duration: 8000 });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, clockOffsetMs]);
  const urgent = !tick.expired && tick.minutes < 2;
  return (
    <div
      role="status"
      className="rounded-2xl border p-4 flex gap-3 items-start"
      style={{
        backgroundColor: tick.expired ? "rgba(254, 242, 242, 0.95)" : urgent ? "rgba(255, 251, 235, 0.95)" : "rgba(239, 246, 255, 0.95)",
        borderColor: tick.expired ? "#fecaca" : urgent ? "#fde68a" : "#bfdbfe",
      }}
    >
      <Clock className="h-5 w-5 shrink-0 mt-0.5" style={{ color: tick.expired ? "#dc2626" : urgent ? "#d97706" : "#2563eb" }} />
      <div className="min-w-0 flex-1 text-sm font-medium" style={{ color: tick.expired ? "#991b1b" : urgent ? "#92400e" : "#1e40af" }}>
        {tick.expired ? (
          <>
            <p>Your reserved slot has expired. Go back and pick a new time to continue.</p>
            <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => window.history.back()}>
              Back to booking
            </Button>
          </>
        ) : (
          <p>
            Slot held for{" "}
            <span className="tabular-nums">
              {tick.minutes}:{String(tick.seconds).padStart(2, "0")}
            </span>
            . Complete checkout before the timer ends.
          </p>
        )}
      </div>
    </div>
  );
}

interface AddonInfo {
  id: string;
  title: string;
  price: number;
  currency: string;
}

type CatalogProductVariant = {
  id: string;
  retail_price: number;
  /** Option values keyed by option type name (e.g. { Size: "Large" }) */
  option_values?: Record<string, string>;
  /** Flat display label for this variant (e.g. "Large / Red") */
  display_label?: string;
};

type CatalogProduct = {
  id: string;
  name?: string;
  price?: number;
  retail_price?: number;
  hasVariants?: boolean;
  variants?: CatalogProductVariant[];
};

/** Build a readable variant label from option_values map (e.g. "Large / Red"). */
function variantDisplayLabel(variant: CatalogProductVariant): string {
  if (variant.display_label?.trim()) return variant.display_label.trim();
  if (variant.option_values && Object.keys(variant.option_values).length > 0) {
    return Object.values(variant.option_values).filter(Boolean).join(" / ");
  }
  return "";
}

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
    let unitPrice = Number(p.price ?? p.retail_price ?? 0) || 0;
    const variantId = line.product_variant_id ?? null;
    let variantLabel = "";
    if (variantId && Array.isArray(p.variants)) {
      const v = p.variants.find((vv) => vv.id === variantId);
      if (v) {
        unitPrice = Number(v.retail_price ?? 0) || unitPrice;
        variantLabel = variantDisplayLabel(v);
      }
    }
    const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const baseName = (p.name ?? "Product").trim() || "Product";
    const displayName = variantLabel ? `${baseName} – ${variantLabel}` : baseName;
    out.push({
      productId: line.product_id,
      productVariantId: variantId,
      quantity: q,
      unitPrice,
      totalPrice: unitPrice * q,
      name: displayName,
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
    const osType = getOsTypeFromNavigator(navigator);
    if (osType === "ios") { setStoreUrl(IOS_APP_URL_CONTINUE); setLabel("App Store"); setShow(true); }
    else if (osType === "android" || osType === "huawei") { setStoreUrl(ANDROID_APP_URL_CONTINUE); setLabel("Google Play"); setShow(true); }
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
  const [walletBalance, setWalletBalance] = useState(0);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardValidating, setGiftCardValidating] = useState(false);
  const [giftCardValid, setGiftCardValid] = useState<{ balance: number; currency: string } | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "wallet" | "giftcard">("card");
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
  const [providerTaxRate, setProviderTaxRate] = useState(0);
  const [platformServiceFee, setPlatformServiceFee] = useState<{ type: "percentage" | "fixed"; percentage: number; fixed: number; show: boolean }>({
    type: "percentage", percentage: 0, fixed: 0, show: true,
  });
  /** Salon membership preview — same shape used by /booking and customer app checkout. */
  const [membershipDiscountPercent, setMembershipDiscountPercent] = useState(0);
  const [membershipPlanId, setMembershipPlanId] = useState<string | null>(null);
  const [membershipPlanName, setMembershipPlanName] = useState<string | null>(null);
  /** Loyalty points — mirrors customer app checkout (calculate-redemption + consume loyalty_points_used). */
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("");
  const [loyaltyPointsApplied, setLoyaltyPointsApplied] = useState(0);
  const [loyaltyDiscountAmount, setLoyaltyDiscountAmount] = useState(0);
  const [loyaltyValidating, setLoyaltyValidating] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [requestingNow, setRequestingNow] = useState(false);
  /** Mirrors customer app: disable checkout when the hold clock hits zero without waiting for a refetch. */
  const [isSlotExpired, setIsSlotExpired] = useState(false);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [cancellationPolicyAccepted, setCancellationPolicyAccepted] = useState(false);
  const [subscribeRecurring, setSubscribeRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [groupBookingForRecurring, setGroupBookingForRecurring] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<Array<{ name: string; email?: string | null; phone?: string | null; service_ids: string[]; notes?: string | null }>>([]);
  const consumeIdempotencyKeyRef = useRef<string | null>(null);
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
        if (typeof (data as { server_now?: string }).server_now === "string" && (data as { server_now: string }).server_now.trim()) {
          setServerClockOffsetMs(serverNowToClockOffsetMs((data as { server_now: string }).server_now));
        } else {
          setServerClockOffsetMs(0);
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
          server_now: (data as { server_now?: string | null }).server_now ?? null,
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
          cash_enabled_on_platform: (data as { cash_enabled_on_platform?: boolean }).cash_enabled_on_platform,
          tips_enabled: (data as { tips_enabled?: boolean }).tips_enabled,
          tip_presets: Array.isArray((data as { tip_presets?: number[] }).tip_presets)
            ? (data as { tip_presets: number[] }).tip_presets
            : undefined,
          tax_rate_percent: (data as { tax_rate_percent?: number }).tax_rate_percent != null
            ? Number((data as { tax_rate_percent: number }).tax_rate_percent)
            : undefined,
          tax_inclusive: Boolean((data as { tax_inclusive?: boolean }).tax_inclusive),
          cancellation_policy: (data as { cancellation_policy?: HoldCancellationPolicy | null }).cancellation_policy ?? null,
        };
        setCancellationPolicyAccepted(false);
        setHold(holdData);
        clearBeautonomiHoldIdCookie();

        {
          const slugForLookup = holdData.provider_slug;
          // Pass provider_id so the platform-fees route mirrors the canonical priority chain
          // (provider customer_fee_config → platform_settings.payouts) — same as /booking flow
          // and validate-booking on the server. Avoids fee divergence in the review card.
          const feeUrl = holdData.provider_id
            ? `/api/public/platform-fees?provider_id=${encodeURIComponent(holdData.provider_id)}`
            : "/api/public/platform-fees";
          const taxFeePromises: Promise<any>[] = [
            fetcher.get<any>(feeUrl).catch(() => null),
          ];
          if (slugForLookup) {
            taxFeePromises.push(
              fetcher.get<any>(`/api/public/providers/${encodeURIComponent(slugForLookup)}`).catch(() => null),
            );
          }
          Promise.all(taxFeePromises).then(([feeRes, providerRes]) => {
            if (providerRes) {
              const prov = (providerRes as any)?.data ?? providerRes;
              if (prov?.tax_rate_percent != null) {
                setProviderTaxRate(Number(prov.tax_rate_percent) || 0);
              }
            }
            const feeData = (feeRes as any)?.data ?? feeRes;
            if (feeData) {
              setPlatformServiceFee({
                type: feeData.platform_service_fee_type ?? "percentage",
                percentage: Number(feeData.platform_service_fee_percentage) || 0,
                fixed: Number(feeData.platform_service_fee_fixed) || 0,
                show: feeData.show_service_fee_to_customer !== false,
              });
            }
          });
        }

        // Salon membership preview — match /booking flow + customer app checkout.
        // Membership is applied authoritatively server-side, but we preview it
        // here so customers see "Membership −X" alongside Platform fee on review.
        if (user) {
          fetcher.get<{ data?: { provider_memberships?: Array<{ provider_id: string; plan_id?: string; plan_name?: string; discount_percent?: number }> } }>(
            "/api/me/membership",
          ).then((res) => {
            const list = (res as any)?.data?.provider_memberships ?? (res as any)?.provider_memberships ?? [];
            const match = (list as Array<{ provider_id: string; plan_id?: string; plan_name?: string; discount_percent?: number }>)
              .find((m) => m?.provider_id === holdData.provider_id);
            const pct = match ? Number(match.discount_percent) : 0;
            if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
              setMembershipDiscountPercent(pct);
              setMembershipPlanId(match?.plan_id ?? null);
              setMembershipPlanName((match?.plan_name?.trim() || null) ?? null);
            } else {
              setMembershipDiscountPercent(0);
              setMembershipPlanId(null);
              setMembershipPlanName(null);
            }
          }).catch(() => {
            // Membership preview is optional; never block checkout.
          });
        }

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
                groupParticipants?: Array<{ name: string; email?: string | null; phone?: string | null; service_ids: string[]; notes?: string | null }>;
              };
              const hasGroup = Boolean(parsed?.isGroupBooking && Array.isArray(parsed.groupParticipants) && parsed.groupParticipants.length > 0);
              setGroupBookingForRecurring(hasGroup);
              setGroupParticipants(hasGroup ? parsed.groupParticipants! : []);
            } else {
              setGroupBookingForRecurring(false);
              setGroupParticipants([]);
            }
          } catch {
            setGroupBookingForRecurring(false);
            setGroupParticipants([]);
          }
          const savedPromo = sessionStorage.getItem("beautonomi_booking_promotion_code");
          if (savedPromo?.trim()) setPromotionCode(savedPromo.trim());
          const savedGift = sessionStorage.getItem("beautonomi_booking_gift_card_code");
          if (savedGift?.trim()) {
            setPrefillGiftCardCode(savedGift.trim());
            // Pre-populate gift card input too if gift cards are enabled
            setGiftCardCode(savedGift.trim());
          }
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
          // Prefer tip_presets from hold (set by provider config) over generic provider settings
          const presets = holdData.tip_presets;
          const tips = data.tip_suggestions;
          setTipSuggestions(
            Array.isArray(presets) && presets.length > 0
              ? presets
              : Array.isArray(tips) && tips.length > 0
                ? tips
                : [0, 50, 100, 150, 200]
          );
        } catch {
          setAllowPayInPerson(false);
        }

        // Fetch wallet balance for logged-in users when wallet payments enabled
        if (user && holdData.payment_wallet) {
          fetcher
            .get<{ data?: { wallet?: { balance: number } }; wallet?: { balance: number } }>("/api/me/wallet")
            .then((res) => {
              const raw = (res as any)?.data ?? res;
              const balance = raw?.data?.wallet?.balance ?? raw?.wallet?.balance;
              if (balance != null) setWalletBalance(Number(balance) || 0);
            })
            .catch(() => {});
        }

        // Fetch loyalty points balance for logged-in users (non-blocking)
        if (user) {
          fetcher
            .get<{ data?: { balance?: number; points?: number }; balance?: number; points?: number }>("/api/me/loyalty-points/balance")
            .then((res) => {
              const raw = (res as any)?.data ?? res;
              const pts = raw?.balance ?? raw?.points ?? (res as any)?.data?.balance ?? (res as any)?.data?.points;
              if (pts != null && Number.isFinite(Number(pts))) setLoyaltyBalance(Math.max(0, Math.floor(Number(pts))));
            })
            .catch(() => {});
        }

        setStatus("review");
      } catch (err) {
        const msg =
          err instanceof FetchError
            ? err.message
            : "This hold may have expired. Please start a new booking.";
        setErrorMessage(msg);
        setStatus("error");
        clearBeautonomiHoldClientMarkers();
      }
    };

    loadHold();
  }, [holdId]);

  useEffect(() => {
    if (!hold?.expires_at) {
      setIsSlotExpired(false);
      return;
    }
    if (getHoldTimeRemaining(hold.expires_at, serverClockOffsetMs).expired) {
      setIsSlotExpired(true);
      return;
    }
    setIsSlotExpired(false);
    const timer = setInterval(() => {
      if (getHoldTimeRemaining(hold.expires_at, serverClockOffsetMs).expired) {
        setIsSlotExpired(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hold?.expires_at, serverClockOffsetMs]);

  /**
   * Re-validate the hold when the tab becomes visible again (visibilitychange) or when the
   * page is restored from the browser back-forward cache (pageshow with persisted=true).
   * Catches the scenario where the user navigated back, created a new hold (cancelling this
   * one), then returned via browser forward to the stale checkout page.
   */
  useEffect(() => {
    if (typeof document === "undefined" || !holdId) return;

    const revalidateHold = async () => {
      if (status !== "review") return;
      try {
        // staleTimeMs: 0 bypasses the client GET cache so we always hit the server.
        const res = await fetcher.get<{ hold_status?: string }>(
          `/api/public/booking-holds/${holdId}`,
          { staleTimeMs: 0 },
        );
        const normalizedData = (res as any)?.data ?? res;
        const holdStatus = (normalizedData as { hold_status?: string })?.hold_status;
        if (holdStatus && holdStatus !== "active" && holdStatus !== "consuming") {
          setErrorMessage("Your reserved slot is no longer available. Please go back and select a new time.");
          setStatus("error");
          clearBeautonomiHoldClientMarkers();
        }
      } catch (err) {
        // The API returns HTTP 410 (HOLD_INACTIVE) when the hold is no longer active.
        // Treat this as a definitive "hold is gone" signal rather than a network error.
        const statusCode = err instanceof FetchError ? err.status : 0;
        const errorCode = err instanceof FetchError ? err.code : "";
        if (statusCode === 410 || errorCode === "HOLD_INACTIVE" || statusCode === 404) {
          setErrorMessage("Your reserved slot is no longer available. Please go back and select a new time.");
          setStatus("error");
          clearBeautonomiHoldClientMarkers();
        }
        // For other errors (network, timeout, etc.) — non-blocking, don't interrupt checkout
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void revalidateHold();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void revalidateHold();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [holdId, status]);

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
      router.push(`/login?next=${encodeURIComponent(`/book/continue?hold_id=${holdId}`)}`);
      return;
    }
    if (hold.expires_at && getHoldTimeRemaining(hold.expires_at, serverClockOffsetMs).expired) {
      setValidationError("This time slot has expired. Please go back and select a new time.");
      return;
    }
    if (cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && !cancellationPolicyAccepted) {
      setValidationError("Please confirm you have read the cancellation policy below.");
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
      const res = await fetcher.post<{ data?: { id?: string }; id?: string }>(
        "/api/me/on-demand/requests",
        {
          provider_id: hold.provider_id,
          request_payload: requestPayload,
          idempotency_key: `on-demand:${holdId}`,
        }
      );
      const envelope = res as { data?: { id?: string }; id?: string };
      const requestId = envelope.data?.id ?? envelope.id;
      if (requestId) {
        clearBeautonomiHoldClientMarkers();
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
  }, [hold, user, holdId, addonIds, tipAmount, clientInfo, clientForm, router, cancellationPolicyAccepted, serverClockOffsetMs]);

  const handleComplete = async () => {
    if (!holdId || !hold) return;

    if (hold.expires_at && getHoldTimeRemaining(hold.expires_at, serverClockOffsetMs).expired) {
      setValidationError("This time slot has expired. Please go back and select a new time.");
      return;
    }
    if (cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && !cancellationPolicyAccepted) {
      setValidationError("Please confirm you have read the cancellation policy below.");
      return;
    }

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
      const resolvedPaymentMethod =
        paymentMethod === "wallet" ? "card" : // wallet uses card channel + use_wallet:true
        paymentMethod === "giftcard" ? "giftcard" :
        paymentMethod;
      const effectiveGiftCardCode =
        paymentMethod === "giftcard" && giftCardCode.trim()
          ? giftCardCode.trim()
          : prefillGiftCardCode.trim() || undefined;
      const payload: Record<string, any> = {
        payment_method: resolvedPaymentMethod,
        payment_option: paymentOption,
        use_wallet: paymentMethod === "wallet" ? true : undefined,
        custom_field_values: Object.keys(bookingCustomValues).length > 0 ? bookingCustomValues : undefined,
        provider_form_responses:
          Object.keys(providerFormValues).length > 0 ? providerFormValues : undefined,
        addons: addonIds.length > 0 ? addonIds : undefined,
        special_requests: specialRequests.trim() || undefined,
        tip_amount: tipAmount > 0 ? tipAmount : undefined,
        promotion_code: promotionCode.trim() || undefined,
        gift_card_code: effectiveGiftCardCode,
        guest_fingerprint_hash: getGuestFingerprintHash(),
        idempotency_key:
          consumeIdempotencyKeyRef.current ??
          (consumeIdempotencyKeyRef.current = generateConsumeIdempotencyKey()),
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
      if (loyaltyPointsApplied > 0) {
        payload.loyalty_points_used = loyaltyPointsApplied;
      }
      if (consumePackageId) {
        payload.package_id = consumePackageId;
        payload.primary_package_id = consumePackageId;
      }
      // Forward membership plan id so server applies the same discount we
      // previewed in the breakdown — server is still the source of truth.
      if (membershipPlanId) {
        payload.membership_plan_id = membershipPlanId;
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
        clearBeautonomiHoldClientMarkers();
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
        clearBeautonomiHoldClientMarkers();
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
      let msg =
        err instanceof FetchError
          ? err.message
          : "Failed to complete booking. Please try again.";
      if (err instanceof FetchError && err.status === 409 && err.code === "HOLD_IN_FLIGHT") {
        msg =
          err.message?.trim() ||
          "This booking is already being processed. Please wait a moment, then try again.";
      }
      setValidationError(msg);
      setStatus("review");
      // Also surface as a toast so it's visible even when scrolled away from the inline error
      toast.error(msg, { duration: 6000 });
    }
  };

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: BOOKING_BG }}>
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold" style={{ color: BOOKING_ACCENT }}>
            Something went wrong
          </h1>
          <p style={{ color: BOOKING_TEXT_SECONDARY }}>{errorMessage}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => window.location.reload()} variant="default">
              Try again
            </Button>
            <Button onClick={() => router.back()} variant="outline">
              Go back
            </Button>
            <Button onClick={() => router.push("/search")} variant="ghost">
              Find a provider
            </Button>
          </div>
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
      const res = await fetcher.get<{ valid?: boolean; discount_amount?: number; discount_value?: number; message?: string }>(
        `/api/public/promo-codes/validate?code=${encodeURIComponent(promotionCode.trim())}&amount=${amount}`
      );
      const data = res as any;
      if (data?.valid && (data?.discount_amount != null || data?.discount_value != null)) {
        setPromoDiscount(Number(data.discount_amount ?? data.discount_value));
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

  const handleValidateGiftCard = async () => {
    if (!giftCardCode.trim() || !hold) return;
    setGiftCardError(null);
    setGiftCardValidating(true);
    try {
      const res = await fetcher.get<{ valid?: boolean; balance?: number; currency?: string; message?: string }>(
        `/api/public/gift-cards/validate?code=${encodeURIComponent(giftCardCode.trim())}&provider_id=${hold.provider_id}`
      );
      const data = res as any;
      if (data?.valid && data?.balance != null) {
        const giftCardCurrency = data.currency || hold?.booking_services_snapshot[0]?.currency || tenantCurrency;
        setGiftCardValid({ balance: Number(data.balance), currency: giftCardCurrency });
        setPaymentMethod("giftcard");
      } else {
        setGiftCardValid(null);
        setGiftCardError(data?.message ?? "Invalid or expired gift card");
      }
    } catch {
      setGiftCardValid(null);
      setGiftCardError("Could not validate gift card");
    } finally {
      setGiftCardValidating(false);
    }
  };

  const handleApplyLoyalty = async () => {
    if (!user || !hold) return;
    const raw = parseInt(loyaltyPointsInput.trim(), 10);
    if (!Number.isFinite(raw) || raw <= 0) {
      setLoyaltyError("Enter a valid number of points to redeem.");
      return;
    }
    setLoyaltyError(null);
    setLoyaltyValidating(true);
    try {
      const servicesBase = hold.booking_services_snapshot.reduce((s, sv) => s + sv.price, 0);
      const addonsBase = addonDetails.reduce((s, a) => s + Number(a.price || 0), 0);
      const productsBase = prefillConsumeProducts.reduce((s, p) => s + p.totalPrice, 0);
      const travelBase = hold.travel_fee ?? 0;
      const bookingSubtotal = servicesBase + addonsBase + productsBase + travelBase;
      const res = await fetcher.post<{
        data?: { points_to_redeem: number; discount_amount: number };
        points_to_redeem?: number; discount_amount?: number;
      }>("/api/me/loyalty-points/calculate-redemption", {
        points_to_redeem: raw,
        booking_subtotal: bookingSubtotal,
      });
      const payload = (res as any)?.data ?? res;
      const pts = payload?.points_to_redeem ?? raw;
      const disc = payload?.discount_amount;
      if (disc != null && Number.isFinite(Number(disc)) && Number(disc) > 0) {
        setLoyaltyPointsApplied(Math.floor(Number(pts)));
        setLoyaltyDiscountAmount(Math.round(Number(disc) * 100) / 100);
        setLoyaltyError(null);
      } else {
        setLoyaltyError("Could not calculate redemption. Check your balance and try again.");
      }
    } catch (e) {
      setLoyaltyError(e instanceof Error ? e.message : "Could not apply loyalty points.");
    } finally {
      setLoyaltyValidating(false);
    }
  };

  if (status === "review" && hold) {
    const currency = hold.booking_services_snapshot[0]?.currency ?? tenantCurrency;
    const primaryServicesTotal = hold.booking_services_snapshot.reduce(
      (sum, s) => sum + (s.price || 0),
      0
    );
    const groupParticipantsSubtotal = groupBookingForRecurring && groupParticipants.length > 0
      ? groupParticipants.reduce((sum, p) => {
          const servicesForParticipant = hold.booking_services_snapshot.filter(
            (s) => p.service_ids.includes(s.offering_id) || p.service_ids.includes((s as any).id)
          ) || [];
          return sum + servicesForParticipant.reduce((s, svc) => s + svc.price, 0);
        }, 0)
      : 0;
    const servicesTotal = primaryServicesTotal + groupParticipantsSubtotal;

    const addonsTotal = addonDetails.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const productsFromLinkTotal = prefillConsumeProducts.reduce((s, p) => s + p.totalPrice, 0);
    const travelFee = hold.travel_fee ?? 0;
    const promoDiscountAmount = promoDiscount ?? 0;
    const subtotalBeforePromo = servicesTotal + addonsTotal + productsFromLinkTotal + travelFee;
    const subtotalAfterPromo = Math.max(0, subtotalBeforePromo - promoDiscountAmount);
    // Apply membership discount on the post-promo subtotal — matches validate-booking order.
    const membershipDiscountAmount = membershipDiscountPercent > 0
      ? Math.min(
          Number(((subtotalAfterPromo * membershipDiscountPercent) / 100).toFixed(2)),
          subtotalAfterPromo,
        )
      : 0;
    const subtotalAfterMembership = Math.max(0, subtotalAfterPromo - membershipDiscountAmount);
    // Loyalty points discount (applied after membership — mirrors mobile order)
    const subtotalAfterLoyalty = Math.max(0, subtotalAfterMembership - loyaltyDiscountAmount);
    // Tax: use hold.tax_rate_percent when available (server authoritative), fall back to async state
    const effectiveTaxRate = hold.tax_rate_percent ?? providerTaxRate;
    const isTaxInclusive = hold.tax_inclusive ?? false;
    const taxAmount = effectiveTaxRate > 0
      ? isTaxInclusive
        ? Math.round((subtotalAfterLoyalty - subtotalAfterLoyalty / (1 + effectiveTaxRate / 100)) * 100) / 100
        : Math.round((subtotalAfterLoyalty * effectiveTaxRate) / 100 * 100) / 100
      : 0;
    const subtotalForFee = isTaxInclusive ? subtotalAfterLoyalty : subtotalAfterLoyalty;
    const rawServiceFee =
      platformServiceFee.type === "percentage"
        ? Number(((subtotalForFee * platformServiceFee.percentage) / 100).toFixed(2))
        : platformServiceFee.fixed;
    const serviceFeeAmount = platformServiceFee.show ? rawServiceFee : 0;
    const totalAmount = subtotalAfterLoyalty + (isTaxInclusive ? 0 : taxAmount) + serviceFeeAmount + tipAmount;
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
    const depositAmount = showDepositChoice ? percentOf(totalAmount, depositPct) : 0;
    const remainingAfterDeposit = Math.max(0, totalAmount - depositAmount);
    const cardOnlineBlocked = !paystackEnabled && !allowPayInPerson;
    const policyAckBlocksCheckout =
      cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && !cancellationPolicyAccepted;

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

          {hold.expires_at ? <HoldSlotCountdown expiresAt={hold.expires_at} clockOffsetMs={serverClockOffsetMs} /> : null}

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
              <div key={`primary-${i}`} className="flex justify-between text-sm border-b border-white/10 pb-2">
                <span className="opacity-90">
                  {s.service_name || `Service ${i + 1}`} · {s.duration_minutes} min
                </span>
                <span className="opacity-95">{formatCurrency(s.price, s.currency)}</span>
              </div>
            ))}
            {groupBookingForRecurring && groupParticipants.map((p, pIdx) => {
              const servicesForParticipant = hold.booking_services_snapshot.filter(
                (s) => p.service_ids.includes(s.offering_id) || p.service_ids.includes((s as any).id)
              ) || [];
              const participantTotal = servicesForParticipant.reduce((sum, s) => sum + s.price, 0);
              return (
                <div key={`participant-${pIdx}`} className="flex justify-between text-sm border-b border-white/10 pb-2">
                  <span className="opacity-90">
                    Group: {p.name || `Participant ${pIdx + 1}`}
                  </span>
                  <span className="opacity-95">{formatCurrency(participantTotal, currency)}</span>
                </div>
              );
            })}
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
            {membershipDiscountAmount > 0 && (
              <div className="flex justify-between text-sm border-b border-white/10 pb-2" style={{ color: "#86efac" }}>
                <span>{membershipPlanName || "Membership"}{membershipDiscountPercent > 0 ? ` (${membershipDiscountPercent}%)` : ""}</span>
                <span>-{formatCurrency(membershipDiscountAmount, currency)}</span>
              </div>
            )}
            {loyaltyDiscountAmount > 0 && (
              <div className="flex justify-between text-sm border-b border-white/10 pb-2" style={{ color: "#86efac" }}>
                <span>Loyalty points ({loyaltyPointsApplied} pts)</span>
                <span>-{formatCurrency(loyaltyDiscountAmount, currency)}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-3 space-y-2">
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">
                    Tax{effectiveTaxRate > 0 ? ` (${effectiveTaxRate}%)` : ""}{isTaxInclusive ? " (incl.)" : ""}</span>
                  <span className="opacity-95">{formatCurrency(taxAmount, currency)}</span>
                </div>
              )}
              {serviceFeeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Platform fee{platformServiceFee.type === "percentage" && platformServiceFee.percentage > 0 ? ` (${platformServiceFee.percentage}%)` : ""}</span>
                  <span className="opacity-95">{formatCurrency(serviceFeeAmount, currency)}</span>
                </div>
              )}
              {tipAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-80">Tip</span>
                  <span className="opacity-95">{formatCurrency(tipAmount, currency)}</span>
                </div>
              )}
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

          {user && loyaltyBalance > 0 && (
            <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
              <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
                <Zap className="h-4 w-4" style={{ color: BOOKING_ACCENT }} /> Loyalty points
              </h2>
              <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
                Your balance: <span className="font-semibold">{loyaltyBalance.toLocaleString()} pts</span>
                {loyaltyPointsApplied > 0 && (
                  <> · <span className="text-green-600 font-semibold">{loyaltyPointsApplied.toLocaleString()} applied (-{formatCurrency(loyaltyDiscountAmount, currency)})</span></>
                )}
              </p>
              {loyaltyPointsApplied === 0 && (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={loyaltyBalance}
                    placeholder={`Up to ${loyaltyBalance.toLocaleString()} pts`}
                    value={loyaltyPointsInput}
                    onChange={(e) => { setLoyaltyPointsInput(e.target.value); setLoyaltyError(null); }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyLoyalty}
                    disabled={!loyaltyPointsInput.trim() || loyaltyValidating}
                  >
                    {loyaltyValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
                  </Button>
                </div>
              )}
              {loyaltyPointsApplied > 0 && (
                <button
                  type="button"
                  className="text-sm underline"
                  style={{ color: BOOKING_TEXT_SECONDARY }}
                  onClick={() => { setLoyaltyPointsApplied(0); setLoyaltyDiscountAmount(0); setLoyaltyPointsInput(""); }}
                >
                  Remove loyalty discount
                </button>
              )}
              {loyaltyError && <p className="text-sm text-destructive">{loyaltyError}</p>}
            </div>
          )}

          {(hold.tips_enabled !== false) && (
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
          )}

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

          {cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && hold.cancellation_policy && (
            <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
              <h2 className="font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: BOOKING_ACCENT }} />
                Cancellation policy
              </h2>
              <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                {hold.cancellation_policy.grace_window_minutes != null && hold.cancellation_policy.grace_window_minutes > 0 && (
                  <li>
                    Free cancellation within {hold.cancellation_policy.grace_window_minutes} minutes of booking (grace period).
                  </li>
                )}
                {hold.cancellation_policy.cancellation_window_hours != null &&
                  hold.cancellation_policy.cancellation_window_hours > 0 && (
                    <li>
                      Free cancellation up to {hold.cancellation_policy.cancellation_window_hours}{" "}
                      {hold.cancellation_policy.cancellation_window_hours === 1 ? "hour" : "hours"} before your appointment.
                    </li>
                  )}
                {hold.cancellation_policy.late_refund_percentage != null &&
                  !Number.isNaN(Number(hold.cancellation_policy.late_refund_percentage)) &&
                  Number(hold.cancellation_policy.late_refund_percentage) < 100 && (() => {
                    const pct = Math.round(Number(hold.cancellation_policy.late_refund_percentage));
                    const hrs = hold.cancellation_policy.cancellation_window_hours;
                    const hrsLabel = hrs != null && hrs > 0
                      ? `Within ${hrs} ${hrs === 1 ? "hour" : "hours"}`
                      : "Cancellation";
                    return (
                      <li>
                        {hrsLabel}: {pct <= 0 ? "no refund" : `${pct}% refund`}.
                      </li>
                    );
                  })()}
                {hold.cancellation_policy.no_show_fee_enabled &&
                  hold.cancellation_policy.no_show_fee_amount != null &&
                  Number(hold.cancellation_policy.no_show_fee_amount) > 0 && (
                    <li>
                      No-show fee:{" "}
                      {formatCurrency(
                        Number(hold.cancellation_policy.no_show_fee_amount),
                        hold.cancellation_policy.currency || currency
                      )}
                      .
                    </li>
                  )}
              </ul>
              <p className="text-xs opacity-60 pt-1" style={{ color: BOOKING_TEXT_SECONDARY }}>
                This policy is enforced automatically at the time of cancellation.
              </p>
              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="cancellation-policy-ack"
                  checked={cancellationPolicyAccepted}
                  onCheckedChange={(c) => setCancellationPolicyAccepted(c === true)}
                  className="mt-1"
                />
                <Label htmlFor="cancellation-policy-ack" className="text-sm cursor-pointer leading-snug" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  I understand the cancellation terms and any fees above.
                </Label>
              </div>
            </div>
          )}

          <div className="rounded-3xl p-5 space-y-3 border" style={cardStyle}>
            <h2 className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>Payment</h2>
            {/* Primary payment method selector */}
            <div className="grid grid-cols-2 gap-2">
              {paystackEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className="rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2"
                  style={{
                    backgroundColor: paymentMethod === "card" ? BOOKING_ACCENT : "transparent",
                    color: paymentMethod === "card" ? "#fff" : BOOKING_TEXT_PRIMARY,
                    borderColor: paymentMethod === "card" ? BOOKING_ACCENT : BOOKING_BORDER,
                  }}
                >
                  <CreditCard className="h-4 w-4" />
                  Pay online
                </button>
              )}
              {allowPayInPerson && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className="rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2"
                  style={{
                    backgroundColor: paymentMethod === "cash" ? BOOKING_ACCENT : "transparent",
                    color: paymentMethod === "cash" ? "#fff" : BOOKING_TEXT_PRIMARY,
                    borderColor: paymentMethod === "cash" ? BOOKING_ACCENT : BOOKING_BORDER,
                  }}
                >
                  <Banknote className="h-4 w-4" />
                  Pay at venue
                </button>
              )}
              {user && hold.payment_wallet && walletBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("wallet")}
                  className="rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2"
                  style={{
                    backgroundColor: paymentMethod === "wallet" ? BOOKING_ACCENT : "transparent",
                    color: paymentMethod === "wallet" ? "#fff" : BOOKING_TEXT_PRIMARY,
                    borderColor: paymentMethod === "wallet" ? BOOKING_ACCENT : BOOKING_BORDER,
                  }}
                >
                  <CreditCard className="h-4 w-4" />
                  Wallet ({formatCurrency(walletBalance, currency)})
                </button>
              )}
              {hold.gift_cards && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("giftcard")}
                  className="rounded-2xl py-3.5 px-4 font-medium flex items-center justify-center gap-2 min-h-[44px] transition-transform active:scale-[0.98] border-2"
                  style={{
                    backgroundColor: paymentMethod === "giftcard" ? BOOKING_ACCENT : "transparent",
                    color: paymentMethod === "giftcard" ? "#fff" : BOOKING_TEXT_PRIMARY,
                    borderColor: paymentMethod === "giftcard" ? BOOKING_ACCENT : BOOKING_BORDER,
                  }}
                >
                  <Tag className="h-4 w-4" />
                  Gift card
                </button>
              )}
            </div>
            {/* Gift card input (only when gift card method selected or cards enabled) */}
            {hold.gift_cards && paymentMethod === "giftcard" && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="Gift card code"
                    value={giftCardCode}
                    onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); setGiftCardError(null); setGiftCardValid(null); }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleValidateGiftCard}
                    disabled={!giftCardCode.trim() || giftCardValidating}
                  >
                    {giftCardValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {giftCardError && <p className="text-sm text-destructive">{giftCardError}</p>}
                {giftCardValid && (
                  <p className="text-sm text-green-600">
                    Gift card applied — balance: {formatCurrency(giftCardValid.balance, giftCardValid.currency)}
                  </p>
                )}
              </div>
            )}
            {cardOnlineBlocked && (
              <p className="text-sm pt-1" style={{ color: BOOKING_WAITLIST_TEXT }}>
                Online card payment is unavailable for this market and this provider does not accept pay at venue. You cannot complete checkout here—please contact the salon or try another time.
              </p>
            )}
            {(paymentMethod === "card" || paymentMethod === "wallet") && showDepositChoice && (
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
              disabled={
                requestingNow ||
                (status as string) === "consuming" ||
                isSlotExpired ||
                policyAckBlocksCheckout
              }
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
            disabled={
              (status as string) === "consuming" ||
              cardOnlineBlocked ||
              isSlotExpired ||
              policyAckBlocksCheckout
            }
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
