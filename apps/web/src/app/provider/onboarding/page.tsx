"use client";

import { useTranslation } from "@beautonomi/i18n";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  Upload,
  Image as ImageIcon,
  X,
  Loader2,
  MapPin,
  CircleUser,
  Globe,
  Share2,
  Building2,
  MapPinned,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import {
  LocationMapPickerDialog,
  type PickedMapLocation,
} from "@/components/mapbox/LocationMapPickerDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Breadcrumb from "@/components/ui/breadcrumb";
import {
  validateFileType,
  validateFileSize,
  IMAGE_CONSTRAINTS,
} from "@/lib/supabase/storage-client";
import {
  compressAndUploadOnboardingImage,
  isDataUrl,
  stripDataUrl,
  stripDataUrlsFromArray,
} from "@/lib/images/compress-and-upload";
import { getPricingPlans } from "@/lib/supabase/pricing";
import { ChipCombobox } from "@/components/ui/chip-combobox";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { normalizeFullPhoneToE164, normalizePhoneToE164 } from "@/lib/phone";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
} from "@/lib/supabase/auth-sms-otp";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { countryFilterIso2FromStorage, isMailableEmail } from "@beautonomi/utils";
import { GlobalCategoryIcon } from "@/components/icons/GlobalCategoryIcon";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { currencySelectLabel } from "@/lib/locale/currency";
import { PricingFeatureHtml } from "@/components/pricing/PricingFeatureHtml";
import { applySignupPhoneHandoffToForm } from "@/lib/auth/signup-phone-handoff";
import { ProviderAppDownloadNudge } from "@/components/provider/ProviderAppDownloadNudge";
import { useAuth } from "@/providers/AuthProvider";
import { invalidateProviderPortalCache } from "@/providers/provider-portal/ProviderPortalProvider";

interface GlobalCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

interface ServiceAddon {
  id?: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  duration_minutes?: number;
}

interface Service {
  id?: string;
  title: string;
  description?: string;
  duration_minutes: number;
  price: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  category_id?: string;
  addons?: ServiceAddon[]; // Addons specific to this service
}

interface OnboardingData {
  // Step 1: Team Size
  team_size: "freelancer" | "small" | "medium" | "large";

  // Step 2: Identity (Owner Info)
  owner_name: string;
  owner_email: string;
  email_verified: boolean;
  /** E.164 for Supabase / DB, e.g. +27821234567 (leading 0 stripped with +27). */
  owner_phone: string;
  phone_verified: boolean;
  phone_verification_code?: string;

  // Step 3: Business Details
  business_name: string;
  business_type: "salon" | "mobile" | "both";
  description: string;
  website?: string;
  years_in_business?: number;
  languages_spoken?: string[];
  social_media_links?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };

  // Step 4: Payment Setup (generic terminal capture — replaces yoco_machine)
  terminal_ownership_status?: "has_terminal" | "no_terminal" | "planning_to_get_terminal" | "unsure";
  terminal_provider?: string;
  terminal_provider_other?: string;
  terminal_count_range?: "one" | "two_to_three" | "four_to_ten" | "more_than_ten" | "unsure";
  terminal_active_usage_status?: "yes" | "no" | "sometimes" | "unsure";
  interested_in_platform_terminal?: "yes" | "maybe_later" | "no";
  interested_in_terminal_subscription?: boolean;
  payout_setup_complete?: boolean; // Track if payout account is set up
  is_vat_registered?: boolean; // VAT registration status
  vat_number?: string; // SARS VAT number (if VAT registered)

  // Step 5: Current Software
  previous_software?: string;
  previous_software_other?: string;

  // Step 6: Payroll
  payroll_type: "commission" | "hourly" | "both" | "other";
  payroll_details?: string;

  // Step 7: Location
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };

  // Step 8: Photos
  thumbnail_url?: string;
  avatar_url?: string; // required profile circle (business face) for listing cards
  gallery?: string[];

  // Business contact (used in Step3; aliased from owner_* for display)
  phone?: string;
  email?: string;

  // Public homepage / booking optimization
  accepts_custom_requests?: boolean;
  response_rate?: number;
  response_time_hours?: number;
  tax_rate_percent?: number | null;
  tips_enabled?: boolean;
  cancellation_window_hours?: number;
  requires_deposit?: boolean;
  deposit_percentage?: number | null;
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number | null;
  include_in_search_engines?: boolean;

  // Step 9: Service Zones
  selected_zone_ids?: string[];

  // Step 10: Service Categories
  global_category_ids: string[];

  // Step 11: Service Catalog
  services: Service[];

  // Step 12: Operating Hours
  operating_hours: {
    [key: string]: { open: string; close: string; closed: boolean };
  };

  // Step 14: Plan Selection (planName from URL for display only)
  selected_plan_id?: string;
  selected_plan_name?: string;
}

/** Muted secondary actions (Edit / Cancel) — light grey, readable contrast, 14px body text (WCAG-friendly on white). */
const ONBOARDING_SOFT_SECONDARY_BTN =
  "h-10 min-h-10 shrink-0 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 transition-all";

/** Shared shell: rounded cards, depth, and text contrast across onboarding steps. */
const ONBOARDING_PAGE_BG =
  "min-h-screen bg-[#F7F7F9] selection:bg-primary/20 pb-24 sm:pb-0 font-sans";
const ONBOARDING_CONTAINER = "w-full max-w-3xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-10 md:py-12";
const ONBOARDING_PROGRESS_CARD =
  "mb-6 sm:mb-8 rounded-[2rem] bg-white/80 shadow-sm backdrop-blur-xl px-5 py-5 sm:px-8 sm:py-6 ring-1 ring-slate-900/5";
const ONBOARDING_MAIN_CARD =
  "rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-900/5 p-6 sm:p-10 md:p-12";
const ONBOARDING_STEP_TITLE = "text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900";
const ONBOARDING_STEP_DESC = "mt-3 text-lg text-slate-600 leading-relaxed max-w-xl";
/**
 * Â§Provider-launch (2026-05): nav row sticks to the bottom of the viewport on
 * mobile so primary CTAs (Back / Skip / Next / Submit) are always reachable
 * without scrolling past long step bodies (Mangomint/Fresha-style sticky footer).
 * Desktop retains the inline card-bottom layout.
 */
const ONBOARDING_NAV_ROW =
  "fixed inset-x-0 bottom-0 z-30 flex flex-row items-center justify-between gap-3 border-t border-slate-200/60 bg-white/90 px-4 py-4 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:static sm:mt-12 sm:justify-between sm:gap-4 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pt-8 sm:shadow-none sm:backdrop-blur-none";
const ONBOARDING_BTN_BACK =
  "h-12 sm:h-14 rounded-full border border-slate-200 bg-white text-slate-800 font-semibold hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 px-5 sm:px-6 shadow-sm transition-all";
const ONBOARDING_BTN_SKIP =
  "flex-1 sm:flex-none h-12 sm:h-14 rounded-full border border-transparent bg-transparent text-slate-600 font-semibold hover:bg-slate-100 hover:text-slate-900 px-5 sm:px-6 transition-all";
const ONBOARDING_BTN_NEXT =
  "flex-1 sm:flex-none h-12 sm:h-14 rounded-full font-semibold shadow-md px-6 sm:px-8 transition-all hover:scale-[1.02] active:scale-[0.98]";
const ONBOARDING_REVIEW_HEADING = "font-semibold text-slate-900 mb-3 text-lg sm:text-xl";
const ONBOARDING_REVIEW_CARD =
  "rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5 sm:p-6 text-base text-slate-800 shadow-sm";

function digitsOnlyPhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Coerce profile / draft / pasted values to compact E.164 (+country…, no spaces).
 * Handles: full E.164, "+27 082…", national with leading 0, legacy 9-digit SA mobile without 0.
 */
function coerceOwnerPhoneToE164ForForm(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const trimmed = raw.trim();
  const compact = normalizeSupabaseAuthPhone(trimmed);

  const e164 = normalizeFullPhoneToE164(trimmed) ?? normalizeFullPhoneToE164(compact);
  if (e164) return normalizeSupabaseAuthPhone(e164);

  const digits = digitsOnlyPhone(trimmed);
  if (!digits) return "";

  if (digits.startsWith("27") && digits.length >= 11) {
    return normalizeSupabaseAuthPhone("+" + digits);
  }

  const withZa = normalizePhoneToE164(trimmed, "27") ?? normalizePhoneToE164(digits, "27");
  if (withZa) return normalizeSupabaseAuthPhone(withZa);

  // Legacy onboarding drafts: national SA mobile without country or leading 0 (e.g. 823456789)
  if (digits.length === 9 && /^[6789]\d{8}$/.test(digits)) {
    return "+27" + digits;
  }

  return "";
}

function isValidOwnerPhoneE164(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const c = coerceOwnerPhoneToE164ForForm(raw);
  return !!c && /^\+[1-9]\d{7,14}$/.test(c);
}

function phoneNumbersMatchProfile(profilePhone: string, formPhone: string): boolean {
  const pe = coerceOwnerPhoneToE164ForForm(profilePhone);
  const fe = coerceOwnerPhoneToE164ForForm(formPhone);
  if (pe && fe) return digitsOnlyPhone(pe) === digitsOnlyPhone(fe);
  const p = digitsOnlyPhone(profilePhone);
  const f = digitsOnlyPhone(formPhone);
  if (!p || !f) return false;
  if (p === f) return true;
  if (p.length >= 9 && f.length >= 9) {
    return p.endsWith(f.slice(-9)) || f.endsWith(p.slice(-9));
  }
  return p.endsWith(f) || f.endsWith(p);
}

type ProfilePrefillResult = {
  ownerPatch: Partial<Pick<OnboardingData, "owner_name" | "owner_email" | "owner_phone">>;
  phoneVerifiedInDb: boolean;
  emailVerifiedInDb: boolean;
  rawProfilePhone: string | null;
};

async function fetchProfilePrefillForOnboarding(): Promise<ProfilePrefillResult | null> {
  try {
    const response = await fetcher.get<{
      data: {
        full_name?: string | null;
        email?: string | null;
        email_verified?: boolean | null;
        phone?: string | null;
        phone_verified?: boolean | null;
      } | null;
    }>("/api/me/profile");
    const p = response.data;
    if (!p) return null;
    const ownerPatch: ProfilePrefillResult["ownerPatch"] = {};
    const fn = typeof p.full_name === "string" ? p.full_name.trim() : "";
    const em = typeof p.email === "string" ? p.email.trim() : "";
    const ph = typeof p.phone === "string" ? p.phone.trim() : "";
    if (fn) ownerPatch.owner_name = fn;
    if (em && isMailableEmail(em)) ownerPatch.owner_email = em;
    const e164 = coerceOwnerPhoneToE164ForForm(ph);
    if (e164) ownerPatch.owner_phone = e164;
    return {
      ownerPatch,
      phoneVerifiedInDb: Boolean(p.phone_verified),
      emailVerifiedInDb: Boolean(p.email_verified),
      rawProfilePhone: ph || null,
    };
  } catch {
    return null;
  }
}

function mergeAccountIntoOnboardingForm(
  form: Partial<OnboardingData>,
  prefill: ProfilePrefillResult
) {
  if (!form.owner_name?.trim() && prefill.ownerPatch.owner_name) {
    form.owner_name = prefill.ownerPatch.owner_name;
  }
  if (!form.owner_email?.trim() && prefill.ownerPatch.owner_email && isMailableEmail(prefill.ownerPatch.owner_email)) {
    form.owner_email = prefill.ownerPatch.owner_email;
  }
  if (!form.owner_phone?.trim() && prefill.ownerPatch.owner_phone) {
    form.owner_phone = prefill.ownerPatch.owner_phone;
  }
  const ownerDigits = form.owner_phone?.trim() || "";
  if (
    prefill.phoneVerifiedInDb &&
    ownerDigits &&
    phoneNumbersMatchProfile(prefill.rawProfilePhone ?? "", ownerDigits)
  ) {
    form.phone_verified = true;
  }
  if (
    prefill.emailVerifiedInDb &&
    form.owner_email &&
    isMailableEmail(form.owner_email) &&
    prefill.ownerPatch.owner_email &&
    form.owner_email.trim().toLowerCase() === prefill.ownerPatch.owner_email.trim().toLowerCase()
  ) {
    form.email_verified = true;
  }
  if (!form.phone?.trim() && form.owner_phone) {
    form.phone = form.owner_phone;
  }
  if (!form.email?.trim() && form.owner_email && isMailableEmail(form.owner_email)) {
    form.email = form.owner_email;
  }
}

function scrubPlaceholderEmailsFromOnboardingForm(form: Partial<OnboardingData>) {
  if (form.owner_email && !isMailableEmail(form.owner_email)) {
    form.owner_email = "";
    form.email_verified = false;
  }
  if (form.email && !isMailableEmail(form.email)) {
    form.email = "";
  }
}

const INITIAL_ONBOARDING_DATA: Partial<OnboardingData> = {
  team_size: undefined,
  owner_name: "",
  owner_email: "",
  email_verified: false,
  owner_phone: "",
  phone_verified: false,
  business_name: "",
  business_type: "salon",
  description: "",
  terminal_ownership_status: undefined,
  previous_software: undefined,
  payroll_type: undefined,
  services: [],
  global_category_ids: [],
  operating_hours: {
    monday: { open: "09:00", close: "18:00", closed: false },
    tuesday: { open: "09:00", close: "18:00", closed: false },
    wednesday: { open: "09:00", close: "18:00", closed: false },
    thursday: { open: "09:00", close: "18:00", closed: false },
    friday: { open: "09:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "18:00", closed: false },
    sunday: { open: "09:00", close: "18:00", closed: false },
  },
  selected_zone_ids: [],
};

const ONBOARDING_DRAFT_STORAGE_KEY = "beautonomi_provider_onboarding_draft";
const ONBOARDING_INVITE_TOKEN_STORAGE_KEY = "beautonomi_onboarding_invite_token";

function getStoredInviteToken(): string | null {
  try {
    return window.sessionStorage.getItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Redeem an admin-sent lead invite token: stamps invite_accepted_at on the
 * lead (so Provider Ops sees the link was opened) and returns the lead's
 * onboarding_data for prefilling the wizard.
 */
async function redeemInviteToken(token: string): Promise<Partial<OnboardingData> | null> {
  try {
    const response = await fetcher.post<{
      data: {
        lead_id: string;
        already_matched: boolean;
        prefill: {
          business_name: string | null;
          contact_person_name: string | null;
          email: string | null;
          phone_e164: string | null;
          description: string | null;
          onboarding_data: Partial<OnboardingData>;
        };
      };
    }>("/api/provider/onboarding/invite/redeem", { invite_token: token });

    const prefill = response.data?.prefill;
    if (!prefill) return null;

    const merged: Partial<OnboardingData> = { ...(prefill.onboarding_data || {}) };
    if (!merged.business_name && prefill.business_name) merged.business_name = prefill.business_name;
    if (!merged.owner_name && prefill.contact_person_name) merged.owner_name = prefill.contact_person_name;
    if (!merged.owner_email && prefill.email) merged.owner_email = prefill.email;
    if (!merged.owner_phone && prefill.phone_e164) merged.owner_phone = prefill.phone_e164;
    if (!merged.description && prefill.description) merged.description = prefill.description;
    return merged;
  } catch {
    // Invalid/expired token: continue with a blank wizard rather than blocking.
    return null;
  }
}

// New streamlined step order
const STEPS = [
  { id: 1, titleKey: "web.provider.onboarding.steps.teamSize.title", descriptionKey: "web.provider.onboarding.steps.teamSize.description" },
  { id: 2, titleKey: "web.provider.onboarding.steps.identity.title", descriptionKey: "web.provider.onboarding.steps.identity.description" },
  { id: 3, titleKey: "web.provider.onboarding.steps.business.title", descriptionKey: "web.provider.onboarding.steps.business.description" },
  { id: 4, titleKey: "web.provider.onboarding.steps.payment.title", descriptionKey: "web.provider.onboarding.steps.payment.description" },
  { id: 5, titleKey: "web.provider.onboarding.steps.software.title", descriptionKey: "web.provider.onboarding.steps.software.description" },
  {
    id: 6,
    titleKey: "web.provider.onboarding.steps.payroll.title",
    descriptionKey: "web.provider.onboarding.steps.payroll.description",
    conditional: (data: Partial<OnboardingData>) => data.team_size !== "freelancer",
  },
  { id: 7, titleKey: "web.provider.onboarding.steps.location.title", descriptionKey: "web.provider.onboarding.steps.location.description" },
  { id: 8, titleKey: "web.provider.onboarding.steps.photos.title", descriptionKey: "web.provider.onboarding.steps.photos.description" },
  {
    id: 9,
    titleKey: "web.provider.onboarding.steps.zones.title",
    descriptionKey: "web.provider.onboarding.steps.zones.description",
    conditional: (data: Partial<OnboardingData>) =>
      data.business_type === "mobile" || data.business_type === "both",
  },
  { id: 10, titleKey: "web.provider.onboarding.steps.categories.title", descriptionKey: "web.provider.onboarding.steps.categories.description" },
  { id: 11, titleKey: "web.provider.onboarding.steps.catalog.title", descriptionKey: "web.provider.onboarding.steps.catalog.description", canSkip: true },
  { id: 12, titleKey: "web.provider.onboarding.steps.hours.title", descriptionKey: "web.provider.onboarding.steps.hours.description" },
  { id: 13, titleKey: "web.provider.onboarding.steps.review.title", descriptionKey: "web.provider.onboarding.steps.review.description" },
  { id: 14, titleKey: "web.provider.onboarding.steps.plan.title", descriptionKey: "web.provider.onboarding.steps.plan.description" },
];

export default function ProviderOnboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [inAppFromUrl, setInAppFromUrl] = useState(false);
  const [onboardingSuccessMessage, setOnboardingSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<OnboardingData>>(() => ({
    ...INITIAL_ONBOARDING_DATA,
  }));

  // Check for pre-selected plan and entry-point params from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const planId = params.get("planId");
      const planName = params.get("planName");
      const inApp = params.get("in_app") === "1";
      const invite = params.get("invite");
      if (invite) {
        // Persist so the token survives login redirects and refreshes; it is
        // redeemed in loadDraft and sent with the final submit for matching.
        try {
          window.sessionStorage.setItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY, invite);
        } catch {
          /* ignore */
        }
      }
      const updates: Partial<OnboardingData> = {};
      if (planId) updates.selected_plan_id = planId;
      if (planName) updates.selected_plan_name = planName;
      if (Object.keys(updates).length) setFormData((prev) => ({ ...prev, ...updates }));
      if (inApp) setInAppFromUrl(true);
    }
  }, []);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, []);

  // Auto-save draft when form data changes. Save once the user has made any
  // meaningful progress — identity (name/email/phone or a verified flag),
  // team size, or business/address — so verification state survives a refresh
  // even before the business-details step.
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      const hasProgress =
        formData.business_name ||
        formData.address ||
        formData.owner_name?.trim() ||
        formData.owner_email?.trim() ||
        formData.owner_phone?.trim() ||
        formData.email_verified ||
        formData.phone_verified ||
        formData.team_size;
      if (hasProgress) {
        saveDraft();
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(saveTimer);
  }, [formData, currentStep]);

  const loadDraft = async () => {
    const merged: Partial<OnboardingData> = { ...INITIAL_ONBOARDING_DATA };
    let step = 1;
    let resumed: "server" | "session" | null = null;

    try {
      const response = await fetcher.get<{
        data: { draft_data?: Partial<OnboardingData>; current_step?: number } | null;
      }>("/api/provider/onboarding/draft");
      if (response.data?.draft_data) {
        Object.assign(merged, response.data.draft_data);
        step = response.data.current_step || 1;
        resumed = "server";
        try {
          sessionStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* fall through to session + profile */
    }

    if (!resumed) {
      try {
        const raw =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)
            : null;
        if (raw) {
          const parsed = JSON.parse(raw) as {
            draft_data?: Partial<OnboardingData>;
            current_step?: number;
          };
          if (parsed.draft_data) {
            Object.assign(merged, parsed.draft_data);
            if (typeof parsed.current_step === "number" && parsed.current_step >= 1) {
              step = parsed.current_step;
            }
            resumed = "session";
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }

    // Admin-sent invite link: redeem the token (marks the lead's invite as
    // accepted for Provider Ops visibility) and prefill from the lead.
    let invitePrefilled = false;
    const inviteToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("invite") || getStoredInviteToken()
        : null;
    if (inviteToken) {
      const invitePrefill = await redeemInviteToken(inviteToken);
      if (invitePrefill) {
        if (!resumed) {
          Object.assign(merged, invitePrefill);
          invitePrefilled = true;
        } else {
          // An in-progress draft wins; only fill contact basics still empty.
          for (const key of [
            "business_name",
            "owner_name",
            "owner_email",
            "owner_phone",
            "description",
          ] as const) {
            const current = merged[key];
            const incoming = invitePrefill[key];
            if ((current == null || current === "") && typeof incoming === "string" && incoming) {
              (merged as Record<string, unknown>)[key] = incoming;
            }
          }
        }
      }
    }

    const prefill = await fetchProfilePrefillForOnboarding();
    if (prefill) {
      mergeAccountIntoOnboardingForm(merged, prefill);
    }
    scrubPlaceholderEmailsFromOnboardingForm(merged);
    applySignupPhoneHandoffToForm(merged);

    setFormData(merged);
    setCurrentStep(step);
    if (resumed === "server") {
      toast.success(t("web.provider.onboarding.toast.resumedDraft"));
    } else if (resumed === "session") {
      toast.success(t("web.provider.onboarding.toast.resumedProgress"));
    } else if (invitePrefilled) {
      toast.success(t("web.provider.onboarding.toast.welcomeInvite"));
    }
  };

  /**
   * Â§Provider-launch (2026-05): keep the draft payload tiny by guaranteeing
   * `thumbnail_url`/`avatar_url`/`gallery` are public storage URLs (never
   * base64 `data:` strings). The Photos step uploads on pick, but legacy
   * drafts hydrated from sessionStorage might still contain inline images.
   */
  const buildSerializableFormData = (): Partial<OnboardingData> => {
    const sanitized: Partial<OnboardingData> = { ...formData };
    sanitized.thumbnail_url = stripDataUrl(formData.thumbnail_url);
    sanitized.avatar_url = stripDataUrl(formData.avatar_url);
    sanitized.gallery = stripDataUrlsFromArray(formData.gallery);
    return sanitized;
  };

  const saveDraft = async () => {
    try {
      setIsSavingDraft(true);
      const safeDraft = buildSerializableFormData();
      await fetcher.post("/api/provider/onboarding/draft", {
        draft_data: safeDraft,
        current_step: currentStep,
      });
    } catch (error) {
      // When not logged in (401), persist to sessionStorage so progress isn't lost
      if (error instanceof FetchError && error.status === 401) {
        try {
          sessionStorage.setItem(
            ONBOARDING_DRAFT_STORAGE_KEY,
            JSON.stringify({ draft_data: buildSerializableFormData(), current_step: currentStep })
          );
        } catch {
          // Ignore storage errors
        }
      } else if (error instanceof FetchError && error.status === 413) {
        // Almost impossible after the data-URL sanitizer above, but surface a
        // clear message if a future step ever stuffs huge content into draft.
        toast.error(
          t("web.provider.onboarding.toast.draftTooLarge"),
        );
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  const updateFormData = (updates: Partial<OnboardingData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Step validation
  const validateStep = (step: number): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (step) {
      case 1: // Team Size
        if (!formData.team_size) errors.push(t("web.provider.onboarding.validation.teamSize"));
        break;
      case 2: // Identity
        if (!formData.owner_name?.trim()) errors.push(t("web.provider.onboarding.validation.nameRequired"));
        if (!formData.owner_email?.trim()) errors.push(t("web.provider.onboarding.validation.emailRequired"));
        if (formData.owner_email && !isMailableEmail(formData.owner_email)) {
          errors.push(t("web.provider.onboarding.validation.invalidEmail"));
        }
        if (!formData.email_verified) errors.push(t("web.provider.onboarding.validation.verifyEmail"));
        if (!isValidOwnerPhoneE164(formData.owner_phone)) errors.push(t("web.provider.onboarding.validation.phoneRequired"));
        if (!formData.phone_verified) errors.push(t("web.provider.onboarding.validation.verifyPhone"));
        break;
      case 3: // Business Details
        if (!formData.business_name?.trim()) errors.push(t("web.provider.onboarding.validation.businessName"));
        break;
      case 4: // Payment Setup
        // Validate VAT registration if selected
        if (formData.is_vat_registered === true) {
          if (!formData.vat_number?.trim()) {
            errors.push(t("web.provider.onboarding.validation.vatRequired"));
          } else if (formData.vat_number.length !== 10) {
            errors.push(t("web.provider.onboarding.validation.vatDigits"));
          } else if (!formData.vat_number.startsWith("4")) {
            errors.push(t("web.provider.onboarding.validation.vatStartsWith4"));
          }
        }
        break;
      case 5: // Current Software
        // Optional - no validation
        break;
      case 6: // Payroll
        // Optional - no validation
        break;
      case 7: // Location
        if (!formData.address?.line1?.trim()) errors.push(t("web.provider.onboarding.validation.streetRequired"));
        if (!formData.address?.city?.trim()) errors.push(t("web.provider.onboarding.validation.cityRequired"));
        if (!formData.address?.country?.trim()) errors.push(t("web.provider.onboarding.validation.countryRequired"));
        break;
      case 8: // Photos
        if (!formData.thumbnail_url?.trim()) {
          errors.push(t("web.provider.onboarding.validation.thumbnailCard"));
        }
        if (!formData.avatar_url?.trim()) {
          errors.push(t("web.provider.onboarding.validation.avatarCard"));
        }
        break;
      case 9: // Service Zones
        if (formData.business_type === "mobile" || formData.business_type === "both") {
          if (!formData.selected_zone_ids?.length) {
            errors.push(t("web.provider.onboarding.validation.selectZone"));
          }
        }
        break;
      case 10: // Service Categories
        if (!formData.global_category_ids || formData.global_category_ids.length === 0) {
          errors.push(t("web.provider.onboarding.validation.selectCategory"));
        }
        break;
      case 11: // Service Catalog
        // Optional - no validation
        break;
      case 12: {
        // Hours
        const hours = formData.operating_hours;
        if (!hours || Object.keys(hours).length === 0) {
          errors.push(t("web.provider.onboarding.validation.setHours"));
        } else {
          const hasOpenDay = Object.values(hours).some((h: any) => h && !h.closed);
          if (!hasOpenDay) {
            errors.push(t("web.provider.onboarding.validation.oneDayOpen"));
          }
        }
        break;
      }
      case 13: // Review
        // Optional - no validation
        break;
      case 14: // Plan Selection
        if (!formData.selected_plan_id?.trim()) {
          errors.push(t("web.provider.onboarding.validation.selectPlan"));
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  };

  const handleNext = () => {
    const validation = validateStep(currentStep);

    if (!validation.valid) {
      validation.errors.forEach((error) => toast.error(error));
      return;
    }

    // Skip conditional steps
    let nextStep = currentStep + 1;
    while (nextStep <= STEPS.length) {
      const step = STEPS[nextStep - 1];
      if (step.conditional && !step.conditional(formData)) {
        nextStep++;
      } else {
        break;
      }
    }

    if (nextStep <= STEPS.length) {
      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      // Skip conditional steps when going back
      let prevStep = currentStep - 1;
      while (prevStep >= 1) {
        const step = STEPS[prevStep - 1];
        if (step.conditional && !step.conditional(formData)) {
          prevStep--;
        } else {
          break;
        }
      }
      if (prevStep >= 1) {
        setCurrentStep(prevStep);
      } else {
        // If we've gone back too far, go to step 1
        setCurrentStep(1);
      }
    }
  };

  const handleSkip = () => {
    // Skip conditional steps when skipping
    let nextStep = currentStep + 1;
    while (nextStep <= STEPS.length) {
      const step = STEPS[nextStep - 1];
      if (step.conditional && !step.conditional(formData)) {
        nextStep++;
      } else {
        break;
      }
    }
    if (nextStep <= STEPS.length) {
      setCurrentStep(nextStep);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Validate every applicable wizard step (mirrors mobile submit).
      for (let s = 1; s <= STEPS.length; s++) {
        const stepMeta = STEPS[s - 1];
        if (stepMeta.conditional && !stepMeta.conditional(formData)) {
          continue;
        }
        const stepValidation = validateStep(s);
        if (!stepValidation.valid) {
          stepValidation.errors.forEach((error) => toast.error(error));
          setCurrentStep(s);
          return;
        }
      }

      if (!formData.thumbnail_url?.trim()) {
        toast.error(t("web.provider.onboarding.toast.thumbnailBeforeSubmit"));
        setCurrentStep(8);
        return;
      }
      if (!formData.avatar_url?.trim()) {
        toast.error(t("web.provider.onboarding.toast.avatarBeforeSubmit"));
        setCurrentStep(8);
        return;
      }
      // Â§Provider-launch (2026-05): hard-stop if any photo URL is still an
      // inline base64 `data:` blob (would otherwise produce the same 413
      // FUNCTION_PAYLOAD_TOO_LARGE the user reported on Submit & Launch).
      if (
        isDataUrl(formData.thumbnail_url) ||
        isDataUrl(formData.avatar_url) ||
        (formData.gallery || []).some((url) => isDataUrl(url))
      ) {
        toast.error(
          t("web.provider.onboarding.leftover.photosStillUploading"),
        );
        setCurrentStep(8);
        return;
      }

      // Submit onboarding data
      const safeThumbnail = stripDataUrl(formData.thumbnail_url);
      const safeAvatar = stripDataUrl(formData.avatar_url);
      const safeGallery = stripDataUrlsFromArray(formData.gallery);
      const onboardingData = {
        // New fields
        team_size: formData.team_size,
        owner_name: formData.owner_name,
        owner_email: formData.owner_email,
        owner_phone: coerceOwnerPhoneToE164ForForm(formData.owner_phone) || formData.owner_phone,
        terminal_ownership_status: formData.terminal_ownership_status || null,
        terminal_provider: formData.terminal_provider || null,
        terminal_provider_other: formData.terminal_provider_other || null,
        terminal_count_range: formData.terminal_count_range || null,
        terminal_active_usage_status: formData.terminal_active_usage_status || null,
        interested_in_platform_terminal: formData.interested_in_platform_terminal || null,
        interested_in_terminal_subscription: formData.interested_in_terminal_subscription ?? null,
        payroll_type: formData.payroll_type || null,
        payroll_details: formData.payroll_details || null,
        // Business fields
        business_name: formData.business_name,
        business_type: formData.business_type,
        description: formData.description || null,
        previous_software: formData.previous_software || null,
        previous_software_other: formData.previous_software_other || null,
        // Legacy fields (mapped from owner fields)
        phone: coerceOwnerPhoneToE164ForForm(formData.owner_phone) || formData.owner_phone,
        email: formData.owner_email,
        address: {
          line1: formData.address?.line1 || "",
          line2: formData.address?.line2 || null,
          city: formData.address?.city || "",
          state: formData.address?.state || null,
          postal_code: formData.address?.postal_code || null,
          country: formData.address?.country || "",
          latitude: formData.address?.latitude || null,
          longitude: formData.address?.longitude || null,
        },
        global_category_ids: formData.global_category_ids || [],
        selected_zone_ids: formData.selected_zone_ids || [],
        operating_hours: formData.operating_hours || {},
        services: formData.services || [],
        // New fields for public homepage optimization
        thumbnail_url: safeThumbnail || null,
        avatar_url: safeAvatar || null,
        gallery: safeGallery,
        years_in_business: formData.years_in_business || null,
        // VAT registration (Step 4): the server uses these to set is_vat_registered,
        // vat_number, and derive tax_rate_percent (15% when VAT registered).
        is_vat_registered: formData.is_vat_registered ?? null,
        vat_number: formData.is_vat_registered === true ? formData.vat_number || null : null,
        accepts_custom_requests: formData.accepts_custom_requests ?? true,
        response_rate: formData.response_rate || 100,
        response_time_hours: formData.response_time_hours || 1,
        languages_spoken: formData.languages_spoken || ["English"],
        social_media_links: formData.social_media_links || {},
        website: formData.website || null,
        tax_rate_percent: formData.tax_rate_percent || null,
        tips_enabled: formData.tips_enabled ?? true,
        cancellation_window_hours: formData.cancellation_window_hours || 24,
        requires_deposit: formData.requires_deposit || false,
        deposit_percentage: formData.deposit_percentage || null,
        no_show_fee_enabled: formData.no_show_fee_enabled || false,
        no_show_fee_amount: formData.no_show_fee_amount || null,
        include_in_search_engines: formData.include_in_search_engines !== false, // Default to true
        selected_plan_id: formData.selected_plan_id || null,
        // Provider Ops: deterministic lead matching for admin-sent invites.
        invite_token: getStoredInviteToken(),
      };

      // Validate required fields before sending
      if (
        !onboardingData.address.line1 ||
        !onboardingData.address.city ||
        !onboardingData.address.country
      ) {
        toast.error(t("web.provider.onboarding.toast.completeAddress"));
        return;
      }

      if (!onboardingData.global_category_ids || onboardingData.global_category_ids.length === 0) {
        toast.error(t("web.provider.onboarding.toast.selectCategory"));
        return;
      }

      // Â§Provider-launch (audit 2026-04): never log the full onboarding
      // payload — it contains owner name, email, phone, address, ID
      // numbers, and banking details. Surface just enough signal for
      // debugging without leaking PII into the browser console.
      if (process.env.NODE_ENV !== "production") {
        console.debug("[onboarding] submitting", {
          category_count: onboardingData.global_category_ids?.length ?? 0,
          has_address: Boolean(onboardingData.address?.line1),
          selected_plan_id: onboardingData.selected_plan_id ?? null,
        });
      }

      const response = await fetcher.post<{
        data: {
          provider: any;
          message: string;
          auto_configured?: any;
          subscription_endpoint?: string | null;
          selected_plan_id?: string | null;
          requires_checkout?: boolean;
          checkout_path?: string | null;
        };
        error: null;
      }>("/api/provider/onboarding", onboardingData);

      const successMessage =
        response.data?.message || t("web.provider.onboarding.leftover.submittedApplication");
      const autoConfig = response.data?.auto_configured;
      const subscriptionEndpoint = response.data?.subscription_endpoint;
      const selectedPlanId = response.data?.selected_plan_id;
      const requiresCheckout = response.data?.requires_checkout ?? Boolean(subscriptionEndpoint);

      invalidateProviderPortalCache();
      void refreshUser();

      // If a paid plan was selected, send user through checkout, then back to dashboard.
      if (requiresCheckout && selectedPlanId) {
        try {
          sessionStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
          sessionStorage.removeItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY);
        } catch {}
        toast.success(t("web.provider.onboarding.toast.completeSubscription"), { duration: 3000 });
        const checkoutPath =
          response.data?.checkout_path ||
          `/provider/subscription-checkout?planId=${encodeURIComponent(selectedPlanId)}`;
        const separator = checkoutPath.includes("?") ? "&" : "?";
        const inAppParam = inAppFromUrl ? "&in_app=1" : "";
        router.push(`${checkoutPath}${separator}return_to=dashboard${inAppParam}`);
        return;
      }

      // Show detailed success message
      if (
        autoConfig &&
        (autoConfig.zones > 0 || autoConfig.services > 0 || autoConfig.mobile_ready)
      ) {
        toast.success(successMessage, {
          duration: 6000,
        });
      } else {
        toast.success(successMessage, {
          duration: 4000,
        });
      }

      try {
        sessionStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
        sessionStorage.removeItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY);
      } catch {}
      // Show app-download nudge before the optional verification step.
      setOnboardingSuccessMessage(successMessage);
    } catch (error) {
      let errorMessage = t("web.provider.onboarding.toast.submitFailed");

      if (error instanceof FetchError) {
        console.error("FetchError details:", {
          message: error.message,
          status: error.status,
          code: error.code,
          details: error.details,
        });

        // Â§Provider-launch (2026-05): translate Vercel's raw FUNCTION_PAYLOAD_TOO_LARGE
        // (413) into something actionable. Surfaces when, despite the data-URL
        // guards above, the payload is still too big (e.g. an upstream proxy
        // limit or a corrupted draft).
        if (error.status === 413) {
          toast.error(
            t("web.provider.onboarding.toast.submissionTooLarge"),
          );
          setCurrentStep(8);
          return;
        }

        // Try to extract validation errors from the details
        if (error.details && Array.isArray(error.details)) {
          console.error("Validation errors:", JSON.stringify(error.details, null, 2));
          // Show all validation errors - format for toast (toast doesn't support newlines well)
          const validationErrors = error.details.map((err: any, index: number) => {
            if (typeof err === "string") return `${index + 1}. ${err}`;
            const path = err.path || "field";
            const msg = err.message || t("web.provider.onboarding.toast.invalidValue");
            return `${index + 1}. ${path}: ${msg}`;
          });

          // Show first error in toast, log all to console
          if (validationErrors.length > 0) {
            errorMessage = validationErrors[0];
            if (validationErrors.length > 1) {
              console.error(`Total validation errors: ${validationErrors.length}`);
              validationErrors.forEach((err, idx) => {
                console.error(`Error ${idx + 1}: ${err}`);
              });
              errorMessage += t("web.provider.onboarding.leftover.andMoreSeeConsole", { count: validationErrors.length - 1 });
            }
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      } else {
        console.error("Unknown error:", error);
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get actual step index accounting for conditional steps
  const getActualStepIndex = () => {
    let actualIndex = 0;
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      if (step.conditional && !step.conditional(formData)) {
        continue;
      }
      actualIndex++;
      if (i === currentStep - 1) break;
    }
    return actualIndex;
  };

  const currentStepData = STEPS[currentStep - 1];
  const canSkip = currentStepData?.canSkip || false;
  const currentStepValidation = validateStep(currentStep);
  const canProceed = currentStepValidation.valid;
  const totalVisibleSteps = STEPS.filter(
    (s) => !s.conditional || (s.conditional && s.conditional(formData))
  ).length;

  if (onboardingSuccessMessage) {
    return (
      <RoleGuard
        allowedRoles={["customer", "provider_owner", "provider_staff", "provider_onboarding"]}
        redirectTo="/become-a-partner"
        showLoading={true}
      >
        <div className={ONBOARDING_PAGE_BG}>
          <div className={`${ONBOARDING_CONTAINER} max-w-2xl`}>
            <ProviderAppDownloadNudge
              successHeadline={t("web.provider.onboarding.successHeadline")}
              subtitle={onboardingSuccessMessage}
              showContinue
              continueLabel={t("web.provider.onboarding.continueVerification")}
              onContinue={() => router.push("/provider/settings/verification?onboarding=1")}
            />
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard
      allowedRoles={["customer", "provider_owner", "provider_staff", "provider_onboarding"]}
      redirectTo="/become-a-partner"
      showLoading={true}
    >
      <div className={ONBOARDING_PAGE_BG}>
        <div className={ONBOARDING_CONTAINER}>
          <div className="mb-4 sm:mb-5">
            <Breadcrumb
              items={[
                { label: t("web.provider.common.breadcrumbHome"), href: "/" },
                { label: t("web.provider.onboarding.becomePartner"), href: "/become-a-partner" },
                { label: t("web.provider.onboarding.onboarding") },
              ]}
            />
          </div>

          <div className={ONBOARDING_PROGRESS_CARD}>
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t("web.provider.onboarding.stepOf", { current: getActualStepIndex(), total: totalVisibleSteps })}
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">{t(currentStepData.titleKey)}</p>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-sm font-medium text-slate-900 tabular-nums">
                  {Math.round((getActualStepIndex() / totalVisibleSteps) * 100)}%
                </p>
                {isSavingDraft && (
                  <p className="text-[10px] font-medium text-slate-500 mt-0.5 animate-pulse">
                    {t("web.provider.onboarding.saving")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-1 h-2 w-full">
              {STEPS.filter(
                (s) => !s.conditional || (s.conditional && s.conditional(formData))
              ).map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`h-full flex-1 rounded-full transition-all duration-500 ${
                      isCompleted ? "bg-primary" : isCurrent ? "bg-primary/60" : "bg-slate-100"
                    }`}
                    role="progressbar"
                    aria-valuenow={isCurrent ? 100 : 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                );
              })}
            </div>
          </div>

          <div className={ONBOARDING_MAIN_CARD}>
            <header className="mb-6 sm:mb-8">
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 sm:block">
                {t("web.provider.onboarding.stepOf", { current: getActualStepIndex(), total: totalVisibleSteps })}
              </p>
              <h2 className={`${ONBOARDING_STEP_TITLE} mt-2`}>{t(currentStepData.titleKey)}</h2>
              <p className={ONBOARDING_STEP_DESC}>{t(currentStepData.descriptionKey)}</p>
            </header>

            {currentStep === 1 && <Step1TeamSize data={formData} updateData={updateFormData} />}
            {currentStep === 2 && <Step2Identity data={formData} updateData={updateFormData} />}
            {currentStep === 3 && (
              <Step3BusinessDetails data={formData} updateData={updateFormData} />
            )}
            {currentStep === 4 && <Step4PaymentSetup data={formData} updateData={updateFormData} />}
            {currentStep === 5 && (
              <Step5CurrentSoftware data={formData} updateData={updateFormData} />
            )}
            {currentStep === 6 && <Step6Payroll data={formData} updateData={updateFormData} />}
            {currentStep === 7 && <Step7Location data={formData} updateData={updateFormData} />}
            {currentStep === 8 && <Step8Photos data={formData} updateData={updateFormData} />}
            {currentStep === 9 && <Step9ServiceZones data={formData} updateData={updateFormData} />}
            {currentStep === 10 && (
              <Step10GlobalCategories data={formData} updateData={updateFormData} />
            )}
            {currentStep === 11 && (
              <Step11ServiceCatalog data={formData} updateData={updateFormData} />
            )}
            {currentStep === 12 && <Step12Hours data={formData} updateData={updateFormData} />}
            {currentStep === 13 && <Step13Review data={formData} />}
            {currentStep === 14 && (
              <Step14PlanSelection data={formData} updateData={updateFormData} />
            )}

            <nav className={ONBOARDING_NAV_ROW} aria-label={t("web.provider.onboarding.stepsAria")}>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                className={ONBOARDING_BTN_BACK}
                aria-label={t("web.provider.onboarding.previousStepAria")}
              >
                <ChevronLeft className="h-5 w-5 sm:me-2" aria-hidden />
                <span className="hidden sm:inline">{t("common.back")}</span>
              </Button>
              <div className="flex flex-1 items-center justify-end gap-3 sm:flex-none sm:gap-4">
                {canSkip && currentStep < STEPS.length && (
                  <Button
                    variant="outline"
                    onClick={handleSkip}
                    disabled={!canProceed}
                    className={`${ONBOARDING_BTN_SKIP} disabled:pointer-events-none disabled:opacity-40`}
                  >
                    {t("web.provider.onboarding.skipForNow")}
                  </Button>
                )}
                {currentStep < STEPS.length ? (
                  <Button
                    onClick={handleNext}
                    disabled={!canProceed}
                    className={`${ONBOARDING_BTN_NEXT} bg-primary text-white hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50`}
                  >
                    {t("common.next")}
                    <ChevronRight className="ms-2 h-5 w-5" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={`${ONBOARDING_BTN_NEXT} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`}
                  >
                    {isSubmitting ? t("web.provider.onboarding.submitting") : t("web.provider.onboarding.submitLaunch")}
                  </Button>
                )}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

// Step 1: Team Size - card selection
function Step1TeamSize({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const teamSizeOptions = [
    {
      id: "freelancer",
      title: t("web.provider.onboarding.team.freelancer"),
      subtitle: t("web.provider.onboarding.team.freelancerSub"),
      description: t("web.provider.onboarding.team.freelancerDesc"),
      badge: t("web.provider.onboarding.team.mostPopular"),
      icon: "👤",
    },
    {
      id: "small",
      title: t("web.provider.onboarding.team.small"),
      subtitle: t("web.provider.onboarding.team.smallSub"),
      description: t("web.provider.onboarding.team.smallDesc"),
      icon: "👥",
    },
    {
      id: "medium",
      title: t("web.provider.onboarding.team.medium"),
      subtitle: t("web.provider.onboarding.team.mediumSub"),
      description: t("web.provider.onboarding.team.mediumDesc"),
      icon: "👨‍👩‍👧‍👦",
    },
    {
      id: "large",
      title: t("web.provider.onboarding.team.large"),
      subtitle: t("web.provider.onboarding.team.largeSub"),
      description: t("web.provider.onboarding.team.largeDesc"),
      icon: "🏢",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {teamSizeOptions.map((option) => {
          const isSelected = data.team_size === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                updateData({ team_size: option.id as any });
                updateData({ business_type: option.id === "freelancer" ? "mobile" : "salon" });
              }}
              className={`relative rounded-[1.5rem] border-2 p-6 text-start transition-all duration-300 hover:-translate-y-1 sm:p-7 ${
                isSelected
                  ? "border-slate-900 bg-slate-900/5 shadow-md"
                  : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              {option.badge && (
                <span
                  className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    isSelected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {option.badge}
                </span>
              )}
              <div className="flex flex-col gap-4">
                <div
                  className="text-4xl bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm"
                  aria-hidden
                >
                  {option.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-lg font-semibold text-slate-900">{option.title}</h3>
                  <p className="mb-2 text-sm font-medium text-slate-700">{option.subtitle}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-slate-500 text-center mt-6">
        {t("web.provider.onboarding.team.hint")}
      </p>
    </div>
  );
}


// Step 2: Identity - Name, Email (with OTP), Phone (with OTP)
const PHONE_OTP_RESEND_COOLDOWN_SECS = 30;

function Step2Identity({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  // ── Phone OTP state ────────────────────────────────────────────────────────
  const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);
  /** E.164 used with `updateUser({ phone })` — must match `verifyOtp` phone. */
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");

  // ── Email OTP state ────────────────────────────────────────────────────────
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);
  /** Email used with `updateUser({ email })` — must match `verifyOtp` email. */
  const [pendingEmail, setPendingEmail] = useState("");

  // ── Cooldown timers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phoneResendCooldown <= 0) return;
    const timer = setTimeout(() => setPhoneResendCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(timer);
  }, [phoneResendCooldown]);

  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const timer = setTimeout(() => setEmailResendCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(timer);
  }, [emailResendCooldown]);

  // ── Auto-detect already-confirmed contacts on mount ───────────────────────
  // Run once: if signup already confirmed the phone/email in Supabase Auth,
  // sync without asking for an OTP again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (cancelled || !authUser) return;

        const phoneConfirmedAt = (authUser as { phone_confirmed_at?: string | null }).phone_confirmed_at;
        const emailConfirmedAt = authUser.email_confirmed_at;

        // Auto-verify phone if it was already confirmed at signup
        if (!data.phone_verified && authUser.phone && phoneConfirmedAt) {
          const authPhone = normalizeSupabaseAuthPhone(authUser.phone);
          const formPhone = data.owner_phone
            ? normalizeSupabaseAuthPhone(coerceOwnerPhoneToE164ForForm(data.owner_phone) || data.owner_phone)
            : "";
          const phonesAlign = !formPhone || authPhone === formPhone || phoneNumbersMatchProfile(authUser.phone, formPhone);
          if (phonesAlign && !cancelled) {
            try {
              await fetcher.post("/api/me/phone/verify", { phone: authPhone });
              if (!cancelled) updateData({ phone_verified: true, owner_phone: authPhone, phone: authPhone });
            } catch { /* User can verify manually */ }
          }
        }

        // Auto-verify email if it was already confirmed (email/Google/Apple signups)
        if (!data.email_verified && authUser.email && emailConfirmedAt && isMailableEmail(authUser.email)) {
          const authEmail = authUser.email.trim();
          const formEmail = data.owner_email?.trim() || "";
          // Accept if form email is empty (we'll seed it) or matches the auth email
          const emailsAlign = !formEmail || formEmail.toLowerCase() === authEmail.toLowerCase();
          if (emailsAlign && !cancelled) {
            try {
              await fetcher.post("/api/me/email/verify", { email: authEmail });
              if (!cancelled) updateData({ email_verified: true, owner_email: authEmail, email: authEmail });
            } catch { /* User can verify manually */ }
          }
        }
      } catch {
        // Non-fatal — user can verify manually
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when identity step mounts
  }, []);

  // ── Phone helpers ──────────────────────────────────────────────────────────
  const persistPhoneVerified = async (phone: string) => {
    await fetcher.post("/api/me/phone/verify", { phone });
    updateData({ phone_verified: true, owner_phone: phone, phone });
  };

  const handleStartChangePhone = () => {
    updateData({ phone_verified: false });
    setPhoneCodeSent(false);
    setPhoneVerificationCode("");
    setPendingPhoneE164("");
    setPhoneResendCooldown(0);
  };

  const handleSendPhoneCode = async () => {
    const ownerE164 = coerceOwnerPhoneToE164ForForm(data.owner_phone);
    if (!ownerE164) {
      toast.error(t("web.provider.onboarding.toast.phoneFirst"));
      return;
    }
    const normalized = normalizeSupabaseAuthPhone(ownerE164);
    try {
      setIsSendingPhoneCode(true);
      const supabase = getSupabaseClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authPhone = authUser?.phone ? normalizeSupabaseAuthPhone(authUser.phone) : "";
      const phoneConfirmedAt = (authUser as { phone_confirmed_at?: string | null } | null)?.phone_confirmed_at;

      if (phoneConfirmedAt && authPhone === normalized) {
        await persistPhoneVerified(normalized);
        toast.success(t("web.provider.onboarding.toast.phoneVerified"));
        return;
      }

      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;

      setPendingPhoneE164(normalized);
      setPhoneVerificationCode("");
      setPhoneCodeSent(true);
      setPhoneResendCooldown(PHONE_OTP_RESEND_COOLDOWN_SECS);
      toast.success(t("web.provider.onboarding.toast.phoneCodeSent"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("provider.mobile.screens.loginSecurity.sendCodeFailed");
      toast.error(msg);
    } finally {
      setIsSendingPhoneCode(false);
    }
  };

  const handleVerifyPhoneCode = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? phoneVerificationCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      toast.error(t("web.provider.onboarding.toast.enterSmsCode", { digits: SUPABASE_AUTH_OTP_LENGTH }));
      return;
    }
    try {
      setIsVerifyingPhone(true);
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(pendingPhoneE164);
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
      if (verifyError) throw verifyError;
      await persistPhoneVerified(phone);
      toast.success(t("web.provider.onboarding.toast.phoneVerified"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("provider.mobile.screens.signup.verificationFailed");
      toast.error(msg);
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  const handlePhoneChange = (e164: string) => {
    const normalized = e164 ? normalizeSupabaseAuthPhone(e164) : "";
    const verifiedPhone = data.phone_verified ? normalizeSupabaseAuthPhone(data.owner_phone || "") : "";
    const stillVerified = Boolean(data.phone_verified && normalized && normalized === verifiedPhone);
    updateData({ owner_phone: e164, phone_verified: stillVerified });
    if (!stillVerified) {
      setPhoneCodeSent(false);
      setPhoneVerificationCode("");
      setPendingPhoneE164("");
    }
  };

  // ── Email helpers ──────────────────────────────────────────────────────────
  const persistEmailVerified = async (email: string) => {
    await fetcher.post("/api/me/email/verify", { email });
    updateData({ email_verified: true, owner_email: email, email });
  };

  const handleStartChangeEmail = () => {
    updateData({ email_verified: false });
    setEmailCodeSent(false);
    setEmailVerificationCode("");
    setPendingEmail("");
    setEmailResendCooldown(0);
  };

  const handleSendEmailCode = async () => {
    const trimmedEmail = data.owner_email?.trim() || "";
    if (!trimmedEmail || !isMailableEmail(trimmedEmail)) {
      toast.error(t("web.provider.onboarding.toast.emailFirst"));
      return;
    }
    try {
      setIsSendingEmailCode(true);
      const supabase = getSupabaseClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const confirmedEmail = authUser?.email?.trim() || "";
      const emailConfirmedAt = authUser?.email_confirmed_at;

      // No-op: email already confirmed in auth and matches what the user typed
      if (emailConfirmedAt && confirmedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
        await persistEmailVerified(confirmedEmail);
        toast.success(t("web.provider.onboarding.toast.emailVerified"));
        return;
      }

      // Send OTP to the new email via updateUser (no emailRedirectTo — numeric code only)
      const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (error) throw error;

      setPendingEmail(trimmedEmail);
      setEmailVerificationCode("");
      setEmailCodeSent(true);
      setEmailResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      toast.success(t("web.provider.onboarding.toast.emailCodeSent", { digits: SUPABASE_AUTH_OTP_LENGTH, email: trimmedEmail }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("web.provider.onboarding.toast.sendEmailCodeFailed");
      toast.error(msg);
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  const handleVerifyEmailCode = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? emailVerificationCode);
    if (!pendingEmail || !isCompleteSupabaseSmsOtp(token)) {
      toast.error(t("web.provider.onboarding.toast.enterEmailCode", { digits: SUPABASE_AUTH_OTP_LENGTH }));
      return;
    }
    try {
      setIsVerifyingEmail(true);
      const supabase = getSupabaseClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email_change",
      });
      if (verifyError) throw verifyError;
      await persistEmailVerified(pendingEmail);
      toast.success(t("web.provider.onboarding.toast.emailVerified"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("provider.mobile.screens.signup.verificationFailed");
      toast.error(msg);
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleEmailInputChange = (newEmail: string) => {
    const verifiedEmail = data.email_verified ? (data.owner_email || "").trim().toLowerCase() : "";
    const stillVerified = Boolean(data.email_verified && newEmail.trim().toLowerCase() === verifiedEmail);
    updateData({ owner_email: newEmail, email_verified: stillVerified });
    if (!stillVerified) {
      setEmailCodeSent(false);
      setEmailVerificationCode("");
      setPendingEmail("");
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <CircleUser className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-slate-900 sm:text-lg">
              {t("web.provider.onboarding.leftover.ownerContactTitle")}
            </h4>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {t("web.provider.onboarding.leftover.ownerContactBody")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <Label htmlFor="owner_name" className="mb-2 block text-sm font-semibold text-slate-900">
            {t("web.provider.onboarding.leftover.yourName")} <span className="text-slate-400">*</span>
          </Label>
          <Input
            id="owner_name"
            value={data.owner_name || ""}
            onChange={(e) => updateData({ owner_name: e.target.value })}
            placeholder={t("web.provider.onboarding.identity.fullNamePlaceholder")}
            className="h-14 rounded-xl border-slate-200 text-base shadow-sm focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 transition-all"
            required
          />
        </div>

        {/* Email with OTP verification */}
        <div>
          <Label className="mb-2 block text-sm font-semibold text-slate-900">
            {t("web.provider.onboarding.leftover.emailAddress")} <span className="text-slate-400">*</span>
          </Label>

          {data.email_verified ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/50 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-6 w-6 text-emerald-600" aria-hidden />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">{t("web.provider.onboarding.identity.emailVerified")}</p>
                  <p className="text-sm text-emerald-700">{data.owner_email}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleStartChangeEmail}
                className="h-11 rounded-xl border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
              >
{t("web.provider.onboarding.leftover.changeEmail")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 w-full lg:flex-1">
                  <Input
                    id="owner_email"
                    type="email"
                    value={data.owner_email || ""}
                    onChange={(e) => handleEmailInputChange(e.target.value)}
                    placeholder={t("web.provider.onboarding.identity.emailPlaceholder")}
                    className="h-14 rounded-xl border-slate-200 text-base shadow-sm focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 transition-all"
                    autoComplete="email"
                    required
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSendEmailCode}
                  disabled={
                    !isMailableEmail(data.owner_email) || isSendingEmailCode || emailResendCooldown > 0
                  }
                  className="h-14 w-full shrink-0 rounded-xl bg-slate-900 px-6 text-white hover:bg-slate-800 disabled:opacity-50 lg:w-auto shadow-sm transition-all"
                >
                  {isSendingEmailCode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : emailResendCooldown > 0 ? (
                    t("web.provider.onboarding.leftover.resendInParens", { seconds: emailResendCooldown })
                  ) : emailCodeSent ? (
                    t("web.provider.onboarding.identity.resendCode")
                  ) : (
                    t("web.provider.onboarding.identity.sendCode")
                  )}
                </Button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {t("web.provider.onboarding.leftover.emailOtpHint", { digits: SUPABASE_AUTH_OTP_LENGTH })}
              </p>

              {emailCodeSent && (
                <div className="mt-6 space-y-3 rounded-[1.5rem] bg-slate-50 p-5 sm:p-6 border border-slate-100">
                  <Label
                    htmlFor="provider-onboarding-email-otp-0"
                    className="mb-2 block text-sm font-semibold text-slate-900"
                  >
                    {t("web.provider.onboarding.leftover.enterEmailCode")} <span className="text-slate-400">*</span>
                  </Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <OtpDigitInput
                      id="provider-onboarding-email-otp"
                      length={SUPABASE_AUTH_OTP_LENGTH}
                      label={t("web.provider.onboarding.identity.emailCodeAria")}
                      value={emailVerificationCode}
                      onChange={setEmailVerificationCode}
                      onComplete={(code) => {
                        if (!isVerifyingEmail) void handleVerifyEmailCode(code);
                      }}
                      disabled={isVerifyingEmail}
                      autoFocus
                      className="min-w-0 flex-1 [&>div:last-child]:!justify-start"
                    />
                    <Button
                      type="button"
                      onClick={() => void handleVerifyEmailCode()}
                      disabled={!isCompleteSupabaseSmsOtp(emailVerificationCode) || isVerifyingEmail}
                      className="h-14 shrink-0 rounded-xl bg-slate-900 px-8 text-white hover:bg-slate-800 disabled:opacity-50 sm:h-14 shadow-sm transition-all"
                    >
                      {isVerifyingEmail ? <Loader2 className="w-5 h-5 animate-spin" /> : t("web.provider.bookings.detail.atHome.verify")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Phone with OTP verification */}
        <div>
          <Label htmlFor="owner_phone" className="mb-2 block text-sm font-semibold text-slate-900">
            {t("web.provider.onboarding.leftover.mobileNumber")} <span className="text-slate-400">*</span>
          </Label>

          {data.phone_verified ? (
            <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/50 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-6 w-6 text-emerald-600" aria-hidden />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">{t("web.provider.onboarding.identity.phoneVerified")}</p>
                  <p className="text-sm text-emerald-700">{data.owner_phone}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleStartChangePhone}
                className="h-11 rounded-xl border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
              >
                {t("web.provider.onboarding.leftover.changeNumber")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 w-full lg:flex-1">
                  <PhoneInput
                    inputId="provider-onboarding-owner-phone"
                    label=""
                    value={data.owner_phone || ""}
                    onChange={handlePhoneChange}
                    placeholder={t("provider.mobile.components.phoneInput.phonePlaceholder")}
                    required
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSendPhoneCode}
                  disabled={
                    !isValidOwnerPhoneE164(data.owner_phone) || isSendingPhoneCode || phoneResendCooldown > 0
                  }
                  className="h-14 w-full shrink-0 rounded-xl bg-slate-900 px-6 text-white hover:bg-slate-800 disabled:opacity-50 lg:w-auto shadow-sm transition-all"
                >
                  {isSendingPhoneCode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : phoneResendCooldown > 0 ? (
                    t("web.provider.onboarding.leftover.resendInParens", { seconds: phoneResendCooldown })
                  ) : phoneCodeSent ? (
                    t("web.provider.onboarding.identity.resendCode")
                  ) : (
                    t("web.provider.onboarding.identity.sendCode")
                  )}
                </Button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {t("web.provider.onboarding.leftover.phoneOtpHint", {
                  digits: SUPABASE_AUTH_OTP_LENGTH,
                  minutes: Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60)),
                  minuteWord:
                    Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1
                      ? t("web.provider.onboarding.leftover.minute")
                      : t("web.provider.onboarding.leftover.minutes"),
                })}
              </p>

              {phoneCodeSent && (
                <div className="mt-6 space-y-3 rounded-[1.5rem] bg-slate-50 p-5 sm:p-6 border border-slate-100">
                  <Label
                    htmlFor="provider-onboarding-verify-otp-0"
                    className="mb-2 block text-sm font-semibold text-slate-900"
                  >
                    {t("web.provider.onboarding.leftover.enterPhoneCode")} <span className="text-slate-400">*</span>
                  </Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <OtpDigitInput
                      id="provider-onboarding-verify-otp"
                      length={SUPABASE_AUTH_OTP_LENGTH}
                      label={t("web.provider.onboarding.identity.phoneCodeAria")}
                      value={phoneVerificationCode}
                      onChange={setPhoneVerificationCode}
                      onComplete={(code) => {
                        if (!isVerifyingPhone) void handleVerifyPhoneCode(code);
                      }}
                      disabled={isVerifyingPhone}
                      autoFocus
                      className="min-w-0 flex-1 [&>div:last-child]:!justify-start"
                    />
                    <Button
                      type="button"
                      onClick={() => void handleVerifyPhoneCode()}
                      disabled={!isCompleteSupabaseSmsOtp(phoneVerificationCode) || isVerifyingPhone}
                      className="h-14 shrink-0 rounded-xl bg-slate-900 px-8 text-white hover:bg-slate-800 disabled:opacity-50 sm:h-14 shadow-sm transition-all"
                    >
                      {isVerifyingPhone ? <Loader2 className="w-5 h-5 animate-spin" /> : t("web.provider.bookings.detail.atHome.verify")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 8: Photos - required thumbnail/profile image plus optional gallery
function Step8Photos({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    data.thumbnail_url || null
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(data.avatar_url || null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>(data.gallery || []);
  // Â§Provider-launch (2026-05): uploads run on pick (not on submit) so the
  // draft + final POST only ever carry public storage URLs. Track per-slot
  // uploading state so the UI can disable buttons + show a spinner.
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const validateImageInput = (file: File): boolean => {
    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error(t("web.provider.onboarding.toast.invalidFileType"));
      return false;
    }
    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error(t("web.provider.settings.pages.gallery.fileTooLargeMaximumSizeIs"));
      return false;
    }
    return true;
  };

  const handleThumbnailSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageInput(file)) return;

    setThumbnailFile(file);
    // Show a quick local preview via ObjectURL while the upload runs.
    const previewUrl = URL.createObjectURL(file);
    setThumbnailPreview(previewUrl);
    setUploadingThumbnail(true);
    try {
      const url = await compressAndUploadOnboardingImage(file, {
        folder: "provider-onboarding/thumbnails",
      });
      updateData({ thumbnail_url: url });
      setThumbnailPreview(url);
    } catch (err) {
      const message =
        err instanceof FetchError
          ? err.status === 413
            ? t("web.provider.onboarding.toast.imageTooLarge")
            : err.message || t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain")
          : t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain");
      toast.error(message);
      setThumbnailPreview(data.thumbnail_url || null);
      setThumbnailFile(null);
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingThumbnail(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageInput(file)) return;

    setAvatarFile(file);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setUploadingAvatar(true);
    try {
      const url = await compressAndUploadOnboardingImage(file, {
        folder: "provider-onboarding/avatars",
      });
      updateData({ avatar_url: url });
      setAvatarPreview(url);
    } catch (err) {
      const message =
        err instanceof FetchError
          ? err.status === 413
            ? t("web.provider.onboarding.toast.imageTooLarge")
            : err.message || t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain")
          : t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain");
      toast.error(message);
      setAvatarPreview(data.avatar_url || null);
      setAvatarFile(null);
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (validateImageInput(file)) validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    setGalleryFiles((prev) => [...prev, ...validFiles]);
    const tempPreviews = validFiles.map((file) => URL.createObjectURL(file));
    setGalleryPreviews((prev) => [...prev, ...tempPreviews]);
    setUploadingGallery(true);
    try {
      const uploaded = await Promise.all(
        validFiles.map(async (file) => {
          try {
            return await compressAndUploadOnboardingImage(file, {
              folder: "provider-onboarding/gallery",
            });
          } catch {
            return null;
          }
        }),
      );
      const successUrls = uploaded.filter((u): u is string => typeof u === "string" && u.length > 0);
      if (successUrls.length === 0) {
        toast.error(t("web.provider.onboarding.toast.galleryNoneUploaded"));
        // Roll back temp previews/files on total failure.
        setGalleryPreviews((prev) => prev.filter((p) => !tempPreviews.includes(p)));
        setGalleryFiles((prev) => prev.filter((f) => !validFiles.includes(f)));
        return;
      }
      // Replace temp object URLs with the public URLs (preserving order).
      setGalleryPreviews((prev) => {
        const next = [...prev];
        let cursor = 0;
        for (let i = 0; i < next.length; i++) {
          if (tempPreviews.includes(next[i])) {
            const replacement = uploaded[cursor++];
            next[i] = typeof replacement === "string" ? replacement : next[i];
          }
        }
        return next.filter((url) => !url.startsWith("blob:"));
      });
      updateData({ gallery: [...(data.gallery || []), ...successUrls] });
      if (successUrls.length < validFiles.length) {
        toast.error(
          t("web.provider.onboarding.toast.galleryPartialFailed", { count: validFiles.length - successUrls.length }),
        );
      }
    } finally {
      tempPreviews.forEach((url) => URL.revokeObjectURL(url));
      setUploadingGallery(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removeGalleryImage = (index: number) => {
    const targetPreview = galleryPreviews[index];
    const newPreviews = galleryPreviews.filter((_, i) => i !== index);
    const newFiles = galleryFiles.filter((_, i) => i !== index);
    // Also drop the URL from the persisted form data.
    const currentGallery = data.gallery || [];
    if (targetPreview) {
      updateData({ gallery: currentGallery.filter((url) => url !== targetPreview) });
    }
    setGalleryPreviews(newPreviews);
    setGalleryFiles(newFiles);
  };

  // Sync previews from draft/data when loaded (e.g. after loadDraft)
  useEffect(() => {
    if (data.thumbnail_url && !thumbnailFile) setThumbnailPreview(data.thumbnail_url);
    if (data.avatar_url && !avatarFile) setAvatarPreview(data.avatar_url);
    if (data.gallery?.length && galleryFiles.length === 0) setGalleryPreviews(data.gallery);
  }, [data.thumbnail_url, data.avatar_url, data.gallery]);

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <ImageIcon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <h4 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              {t("web.provider.onboarding.leftover.whyPhotosMatter")}
            </h4>
            {data.business_type === "mobile" ? (
              <div className="space-y-2 text-sm leading-relaxed text-slate-600">
                <p>
                  <strong className="text-slate-900">{t("web.provider.onboarding.photos.yourPhotoLabel")}</strong> {t("web.provider.onboarding.leftover.yourPhotoBody")}
                </p>
                <p>
                  <strong className="text-slate-900">{t("web.provider.onboarding.photos.galleryLabel")}</strong> {t("web.provider.onboarding.leftover.galleryFreelancerBody")}
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed text-slate-600">
                <p>
                  <strong className="text-slate-900">{t("web.provider.onboarding.photos.salonOwnerLabel")}</strong> {t("web.provider.onboarding.leftover.salonOwnerPhotoBody")}
                </p>
                <p>
                  <strong className="text-slate-900">{t("web.provider.onboarding.photos.galleryLabel")}</strong> {t("web.provider.onboarding.leftover.gallerySalonBody")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Upload */}
      <div>
        <Label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-base">
          {data.business_type === "mobile" ? t("web.provider.onboarding.photos.yourPhoto") : t("web.provider.onboarding.photos.salonOrOwner")}
          <span className="ms-2 text-xs font-semibold text-rose-600 sm:text-sm">{t("web.provider.onboarding.leftover.requiredParen")}</span>
        </Label>
        <p className="mb-3 text-xs leading-relaxed text-slate-700 sm:text-sm">
          {data.business_type === "mobile" ? (
            <>
              <strong>{t("web.provider.onboarding.photos.forFreelancers")}</strong> {t("web.provider.onboarding.leftover.forFreelancersBody")}
            </>
          ) : (
            <>
              <strong>{t("web.provider.onboarding.photos.forSalons")}</strong> {t("web.provider.onboarding.leftover.forSalonsBody")}
            </>
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {thumbnailPreview ? (
            <div className="relative h-48 w-full overflow-hidden rounded-2xl border-2 border-slate-200 sm:w-48">
              <Image src={thumbnailPreview} alt={t("web.provider.onboarding.photos.thumbnailAlt")} fill className="object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  setThumbnailFile(null);
                  setThumbnailPreview(null);
                  updateData({ thumbnail_url: undefined });
                  if (thumbnailInputRef.current) {
                    thumbnailInputRef.current.value = "";
                  }
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex h-48 w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 sm:w-48">
              <div className="p-4 text-center">
                <ImageIcon className="mx-auto mb-2 h-12 w-12 text-slate-400" aria-hidden />
                <p className="text-xs text-slate-600">{t("web.provider.onboarding.photos.thumbnailRequired")}</p>
              </div>
            </div>
          )}
          <div className="flex-1">
            <Input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleThumbnailSelect}
              className="hidden"
              id="thumbnail-upload"
              disabled={uploadingThumbnail}
            />
            <Label
              htmlFor="thumbnail-upload"
              className={cn(
                "cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors",
                uploadingThumbnail && "pointer-events-none opacity-60",
              )}
              aria-busy={uploadingThumbnail}
            >
              {uploadingThumbnail ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 me-2" />
              )}
              {uploadingThumbnail
                ? t("web.provider.onboarding.photos.uploading")
                : thumbnailPreview
                  ? t("web.provider.onboarding.photos.changeThumbnail")
                  : t("web.provider.onboarding.photos.uploadThumbnail")}
            </Label>
            {thumbnailFile && (
              <p className="text-xs text-gray-600 mt-2">
                {thumbnailFile.name} ({(thumbnailFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Profile circle (required) - business face on listing cards */}
      <div>
        <Label className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          {t("web.provider.onboarding.leftover.profileCircleLabel")}
          <span className="text-rose-600 font-semibold text-xs sm:text-sm ms-2">{t("web.provider.onboarding.leftover.requiredParen")}</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          {t("web.provider.onboarding.leftover.profileCircleHint")}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {avatarPreview ? (
            <div className="relative w-24 h-24 rounded-full border-2 border-indigo-200 overflow-hidden flex-shrink-0">
              <Image
                src={avatarPreview}
                alt={t("provider.mobile.screens.gallery.profileCircle")}
                fill
                className="object-cover"
                unoptimized
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-1 right-1"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(null);
                  updateData({ avatar_url: undefined });
                  if (avatarInputRef.current) avatarInputRef.current.value = "";
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 flex-shrink-0">
              <CircleUser className="w-10 h-10 text-gray-400" />
            </div>
          )}
          <div>
            <Input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarSelect}
              className="hidden"
              id="avatar-upload"
              disabled={uploadingAvatar}
            />
            <Label
              htmlFor="avatar-upload"
              className={cn(
                "cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors text-indigo-700",
                uploadingAvatar && "pointer-events-none opacity-60",
              )}
              aria-busy={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 me-2" />
              )}
              {uploadingAvatar
                ? t("web.provider.onboarding.photos.uploading")
                : avatarPreview
                  ? t("web.provider.onboarding.photos.changeProfile")
                  : t("web.provider.onboarding.photos.uploadProfile")}
            </Label>
            {avatarFile && (
              <p className="text-xs text-gray-600 mt-2">
                {avatarFile.name} ({(avatarFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gallery Upload */}
      <div>
        <Label className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          {t("web.provider.onboarding.leftover.portfolioGallery")}
          <span className="text-gray-500 font-normal text-xs sm:text-sm ms-2">
            {t("web.provider.onboarding.leftover.optionalRecommended")}
          </span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          <strong>{t("web.provider.onboarding.photos.showcase")}</strong> {t("web.provider.onboarding.leftover.showcaseBody")}
        </p>
        <Input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleGallerySelect}
          className="hidden"
          id="gallery-upload"
          disabled={uploadingGallery}
        />
        <Label
          htmlFor="gallery-upload"
          className={cn(
            "cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mb-4",
            uploadingGallery && "pointer-events-none opacity-60",
          )}
          aria-busy={uploadingGallery}
        >
          {uploadingGallery ? (
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 me-2" />
          )}
          {uploadingGallery ? t("web.provider.onboarding.photos.uploading") : t("web.provider.onboarding.photos.addPortfolio")}
        </Label>

        {galleryPreviews.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
            {galleryPreviews.map((preview, index) => (
              <div
                key={index}
                className="relative aspect-square border-2 border-gray-200 rounded-lg overflow-hidden"
              >
                <Image
                  src={preview}
                  alt={t("web.provider.onboarding.photos.galleryAlt", { n: index + 1 })}
                  fill
                  className="object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => removeGalleryImage(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {(data.gallery?.length ?? 0) > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              {t("web.provider.onboarding.leftover.photosUploaded", { count: data.gallery?.length ?? 0 })}
            </p>
          </div>
        )}
      </div>

      {(!thumbnailPreview || !avatarPreview) && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <strong>{t("web.provider.onboarding.photos.required")}</strong> {t("web.provider.onboarding.leftover.requiredBothPhotos")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const STEP3_LANGUAGE_SUGGESTIONS = [
  { value: "English", key: "en" },
  { value: "Afrikaans", key: "af" },
  { value: "French", key: "fr" },
  { value: "Portuguese", key: "pt" },
  { value: "Swahili", key: "sw" },
  { value: "Zulu", key: "zu" },
  { value: "Xhosa", key: "xh" },
  { value: "Sesotho", key: "st" },
  { value: "Tswana", key: "tn" },
  { value: "Venda", key: "ve" },
  { value: "Tsonga", key: "ts" },
  { value: "Swati", key: "ss" },
  { value: "Ndebele", key: "nr" },
  { value: "Southern Sotho", key: "sot" },
  { value: "Northern Sotho", key: "nso" },
];

function hasAnySocialLink(links: OnboardingData["social_media_links"] | undefined): boolean {
  if (!links) return false;
  return Boolean(
    links.facebook?.trim() ||
    links.instagram?.trim() ||
    links.twitter?.trim() ||
    links.linkedin?.trim()
  );
}

// Step 3: Business Details - Consolidated business information
function Step3BusinessDetails({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [websiteOpen, setWebsiteOpen] = useState(() => Boolean(data.website?.trim()));
  const [socialOpen, setSocialOpen] = useState(() => hasAnySocialLink(data.social_media_links));

  const websiteWasEmpty = useRef(!data.website?.trim());
  const socialWasEmpty = useRef(!hasAnySocialLink(data.social_media_links));

  useEffect(() => {
    const filled = Boolean(data.website?.trim());
    if (filled && websiteWasEmpty.current) {
      setWebsiteOpen(true);
      websiteWasEmpty.current = false;
    }
    if (!filled) websiteWasEmpty.current = true;
  }, [data.website]);

  useEffect(() => {
    const filled = hasAnySocialLink(data.social_media_links);
    if (filled && socialWasEmpty.current) {
      setSocialOpen(true);
      socialWasEmpty.current = false;
    }
    if (!filled) socialWasEmpty.current = true;
  }, [
    data.social_media_links?.facebook,
    data.social_media_links?.instagram,
    data.social_media_links?.twitter,
    data.social_media_links?.linkedin,
  ]);

  const fieldShell =
    "rounded-[1.5rem] border border-slate-100 bg-slate-50/50 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-slate-300";
  const inputClass =
    "h-14 text-base border-slate-200 bg-white rounded-xl focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 shadow-sm transition-all";
  const helper = "text-sm text-slate-600 leading-relaxed";
  const helperMuted = "text-sm text-slate-500 leading-relaxed";

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <Building2 className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-slate-900 sm:text-lg">
              {t("web.provider.onboarding.leftover3.completeProfiles")}
            </p>
            <p className="text-sm leading-relaxed text-slate-600">
              {t("web.provider.onboarding.leftover3.operateHint")}
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <Label htmlFor="business_name" className="text-sm font-semibold text-slate-900">
{t("web.provider.onboarding.leftover3.businessName")} <span className="text-slate-400">*</span>
        </Label>
        <p className={helperMuted}>{t("web.provider.onboarding.business.howCustomersSee")}</p>
        <Input
          id="business_name"
          value={data.business_name || ""}
          onChange={(e) => updateData({ business_name: e.target.value })}
          placeholder={t("web.provider.onboarding.business.namePlaceholder")}
          className={inputClass}
          required
        />
      </section>

      <section className="space-y-3">
        <Label className="text-sm font-semibold text-slate-900">
{t("web.provider.onboarding.leftover3.businessType")} <span className="text-slate-400">*</span>
        </Label>
        <p className={helperMuted}>
{t("web.provider.onboarding.leftover3.determinesSetup")}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              { id: "salon", title: t("provider.mobile.screens.onboardingWizard.business.salonLabel"), sub: t("web.provider.onboarding.business.salonClientsVisit") },
              { id: "mobile", title: t("provider.mobile.screens.onboardingWizard.business.mobileLabel"), sub: t("provider.mobile.screens.onboardingWizard.business.mobileSub") },
              { id: "both", title: t("provider.mobile.screens.onboardingWizard.business.bothLabel"), sub: t("provider.mobile.screens.onboardingWizard.business.bothSub") },
            ] as const
          ).map((opt) => {
            const selected = (data.business_type || "salon") === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateData({ business_type: opt.id })}
                className={`rounded-[1.5rem] border p-4 text-start transition-all ${
                  selected
                    ? "border-slate-900 bg-slate-900/5 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
                aria-pressed={selected}
              >
                <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                <p className="mt-1 text-xs text-slate-500">{opt.sub}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <Label htmlFor="description" className="text-sm font-semibold text-slate-900">
{t("web.provider.onboarding.leftover3.businessDescription")} <span className="text-slate-400 font-normal">{t("web.provider.onboarding.leftover3.recommendedParen")}</span>
        </Label>
        <p className={helperMuted}>
{t("web.provider.onboarding.leftover3.descriptionAppears")}
        </p>
        <Textarea
          id="description"
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
          placeholder={t("web.provider.onboarding.business.descriptionPlaceholder")}
          className={`min-h-[140px] text-base border-slate-200 bg-white rounded-xl resize-none focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 shadow-sm transition-all`}
          maxLength={2000}
        />
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm tabular-nums text-slate-500">
{t("web.provider.onboarding.leftover3.charsOf2000", { count: data.description?.length || 0 })}
          </p>
          {data.description != null &&
            data.description.length > 0 &&
            data.description.length < 50 && (
              <p className="text-sm font-medium text-amber-600">
{t("web.provider.onboarding.leftover3.considerMoreDetail")}
              </p>
            )}
        </div>
      </section>

      <section className="space-y-3">
        <Label htmlFor="years_in_business" className="text-sm font-semibold text-slate-900">
{t("web.provider.onboarding.leftover3.yearsInBusiness")} <span className="text-slate-400 font-normal">{t("web.provider.onboarding.leftover2.optionalParen")}</span>
        </Label>
        <p className={helperMuted}>{t("web.provider.onboarding.business.experienceHint")}</p>
        <select
          id="years_in_business"
          value={data.years_in_business ?? ""}
          onChange={(e) =>
            updateData({
              years_in_business: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
          className={`w-full ${inputClass} px-4`}
        >
          <option value="">{t("web.provider.onboarding.business.selectYears")}</option>
          <option value="0">{t("web.provider.onboarding.business.years0")}</option>
          <option value="1">{t("web.provider.onboarding.business.years1")}</option>
          <option value="2">{t("web.provider.onboarding.business.years2")}</option>
          <option value="3">{t("web.provider.onboarding.business.years3")}</option>
          <option value="4">{t("web.provider.onboarding.business.years4")}</option>
          <option value="5">{t("web.provider.onboarding.business.years5")}</option>
          <option value="6">{t("web.provider.onboarding.business.years6to10")}</option>
          <option value="11">{t("web.provider.onboarding.business.years11to15")}</option>
          <option value="16">{t("web.provider.onboarding.business.years16to20")}</option>
          <option value="21">{t("web.provider.onboarding.business.years20plus")}</option>
        </select>
      </section>

      <section className="space-y-2">
        <Label htmlFor="languages_spoken" className="text-base font-semibold text-slate-900">
          {t("provider.mobile.screens.businessSettings.languagesYouSpeak")}{" "}
          <span className="text-slate-600 font-normal text-sm">{t("web.provider.onboarding.leftover.optionalRecommended")}</span>
        </Label>
        <p className={helper}>
{t("web.provider.onboarding.leftover.languagesHint")}
        </p>
        <div className="mt-2">
          <ChipCombobox
            singleSelect={false}
            value={data.languages_spoken?.length ? data.languages_spoken : ["English"]}
            onChange={(next) => updateData({ languages_spoken: next.length ? next : ["English"] })}
            staticSuggestions={STEP3_LANGUAGE_SUGGESTIONS.map((l) => ({ value: l.value, label: t(`web.provider.onboarding.languages.${l.key}`) }))}
            allowFreeForm
            placeholder={t("web.provider.onboarding.business.addLanguage")}
            aria-label={t("provider.mobile.screens.businessSettings.languagesYouSpeak")}
          />
        </div>
      </section>

      {/* Website — collapsible */}
      <section className={`${fieldShell} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Globe className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <div>
              <p className="text-base font-semibold text-slate-900">{t("web.provider.onboarding.business.websiteUrl")}</p>
              <p className={`${helperMuted} mt-0.5`}>
                {t("web.provider.onboarding.leftover.websiteOptionalHint")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              id="onboarding-website-toggle-label"
              className="text-sm font-medium text-slate-800"
            >
{t("web.provider.onboarding.leftover3.addWebsite")}
            </span>
            <Switch
              checked={websiteOpen}
              onCheckedChange={setWebsiteOpen}
              aria-labelledby="onboarding-website-toggle-label"
            />
          </div>
        </div>
        {websiteOpen ? (
          <div className="space-y-2 p-4 sm:p-5">
            <Label htmlFor="website" className="sr-only">
              {t("web.provider.onboarding.business.websiteUrl")}
            </Label>
            <p className={helperMuted}>
              {t("web.provider.onboarding.leftover3.pasteFullLink")}
            </p>
            <Input
              id="website"
              type="url"
              value={data.website || ""}
              onChange={(e) => {
                let value = e.target.value.trim();
                if (value && !value.match(/^https?:\/\//)) {
                  value = `https://${value}`;
                }
                updateData({ website: value || undefined });
              }}
              placeholder={t("web.provider.onboarding.business.websitePlaceholder")}
              className={inputClass}
            />
          </div>
        ) : null}
      </section>

      {/* Social — collapsible */}
      <section className={`${fieldShell} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Share2 className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <div>
              <p className="text-base font-semibold text-slate-900">{t("web.provider.onboarding.business.socialLinks")}</p>
              <p className={`${helperMuted} mt-0.5`}>
{t("web.provider.onboarding.leftover3.socialFollowHint")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              id="onboarding-social-toggle-label"
              className="text-sm font-medium text-slate-800"
            >
{t("web.provider.onboarding.leftover3.addProfiles")}
            </span>
            <Switch
              checked={socialOpen}
              onCheckedChange={setSocialOpen}
              aria-labelledby="onboarding-social-toggle-label"
            />
          </div>
        </div>
        {socialOpen ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="facebook" className="text-sm font-semibold text-slate-800">
                {t("web.provider.onboarding.leftover3.facebook")}
              </Label>
              <Input
                id="facebook"
                type="url"
                value={data.social_media_links?.facebook || ""}
                onChange={(e) => {
                  const current = data.social_media_links || {};
                  updateData({
                    social_media_links: {
                      ...current,
                      facebook: e.target.value.trim() || undefined,
                    },
                  });
                }}
                placeholder={t("web.provider.onboarding.business.facebookPlaceholder")}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instagram" className="text-sm font-semibold text-slate-800">
                {t("web.provider.onboarding.leftover3.instagram")}
              </Label>
              <Input
                id="instagram"
                type="url"
                value={data.social_media_links?.instagram || ""}
                onChange={(e) => {
                  const current = data.social_media_links || {};
                  updateData({
                    social_media_links: {
                      ...current,
                      instagram: e.target.value.trim() || undefined,
                    },
                  });
                }}
                placeholder={t("web.provider.onboarding.business.instagramPlaceholder")}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twitter" className="text-sm font-semibold text-slate-800">
                {t("web.provider.onboarding.leftover3.x")}
              </Label>
              <Input
                id="twitter"
                type="url"
                value={data.social_media_links?.twitter || ""}
                onChange={(e) => {
                  const current = data.social_media_links || {};
                  updateData({
                    social_media_links: {
                      ...current,
                      twitter: e.target.value.trim() || undefined,
                    },
                  });
                }}
                placeholder={t("web.provider.onboarding.business.xPlaceholder")}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedin" className="text-sm font-semibold text-slate-800">
                {t("web.provider.onboarding.leftover3.linkedin")}
              </Label>
              <Input
                id="linkedin"
                type="url"
                value={data.social_media_links?.linkedin || ""}
                onChange={(e) => {
                  const current = data.social_media_links || {};
                  updateData({
                    social_media_links: {
                      ...current,
                      linkedin: e.target.value.trim() || undefined,
                    },
                  });
                }}
                placeholder={t("web.provider.onboarding.business.linkedinPlaceholder")}
                className={inputClass}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Step4PaymentSetup({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const TERMINAL_OWNERSHIP_OPTIONS = [
  {
    id: "has_terminal" as const,
    title: t("provider.mobile.screens.onboardingWizard.payment.ownership.has_terminal"),
    description: t("web.provider.onboarding.payment.hasTerminalSub"),
  },
  {
    id: "no_terminal" as const,
    title: t("provider.mobile.screens.onboardingWizard.payment.ownership.no_terminal"),
    description: t("web.provider.onboarding.payment.noTerminalSub"),
  },
  {
    id: "planning_to_get_terminal" as const,
    title: t("provider.mobile.screens.onboardingWizard.payment.ownership.planning_to_get_terminal"),
    description: t("web.provider.onboarding.payment.planningSub"),
  },
  {
    id: "unsure" as const,
    title: t("provider.mobile.screens.onboardingWizard.payment.ownership.unsure"),
    description: t("web.provider.onboarding.payment.unsureSub"),
  },
];
  const TERMINAL_VENDOR_OPTIONS = [
  { id: "yoco", label: "Yoco" },
  { id: "ikhokha", label: "iKhokha" },
  { id: "capitec", label: "Capitec" },
  { id: "fnb", label: "FNB" },
  { id: "nedbank", label: "Nedbank" },
  { id: "absa", label: "Absa" },
  { id: "standard_bank", label: "Standard Bank" },
  { id: "psp", label: t("web.provider.onboarding.payment.psp") },
  { id: "other", label: t("web.provider.bookings.detail.paymentMethods.other") },
  { id: "unsure", label: t("provider.mobile.screens.onboardingWizard.payment.ownership.unsure") },
];
  const TERMINAL_COUNT_OPTIONS = [
  { id: "one", label: "1" },
  { id: "two_to_three", label: "2–3" },
  { id: "four_to_ten", label: "4–10" },
  { id: "more_than_ten", label: t("web.provider.onboarding.payment.moreThan10") },
  { id: "unsure", label: t("provider.mobile.screens.onboardingWizard.payment.ownership.unsure") },
];
  const TERMINAL_USAGE_OPTIONS = [
  { id: "yes", label: t("web.provider.onboarding.payment.yesActivelyUsed") },
  { id: "sometimes", label: t("web.provider.onboarding.leftover.sometimes") },
  { id: "no", label: t("web.provider.onboarding.payment.noNotUsed") },
  { id: "unsure", label: t("provider.mobile.screens.onboardingWizard.payment.ownership.unsure") },
];
  const TERMINAL_INTEREST_OPTIONS = [
  { id: "yes", label: t("common.yes") },
  { id: "maybe_later", label: t("web.provider.onboarding.leftover.maybeLater") },
  { id: "no", label: t("common.no") },
];
  const ownershipStatus = data.terminal_ownership_status;
  const hasTerminal = ownershipStatus === "has_terminal";
  const noOrPlanning = ownershipStatus === "no_terminal" || ownershipStatus === "planning_to_get_terminal";

  function renderRadioGroup<T extends string>(
    options: { id: T; label: string }[],
    selected: T | undefined,
    onSelect: (v: T) => void,
  ) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`rounded-xl border px-4 py-2 text-sm transition-all duration-200 ${
              selected === opt.id
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-slate-900 sm:text-lg">{t("web.provider.onboarding.payment.cardMachineTitle")}</p>
            <p className="text-sm leading-relaxed text-slate-600">
{t("web.provider.onboarding.leftover3.paymentHint")}
            </p>
          </div>
        </div>
      </div>

      {/* Primary question */}
      <div className="space-y-3">
        <p className="text-base font-semibold text-slate-900">{t("web.provider.onboarding.payment.haveTerminalQ")}</p>
        <div className="space-y-3">
          {TERMINAL_OWNERSHIP_OPTIONS.map((option) => {
            const isSelected = ownershipStatus === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => updateData({ terminal_ownership_status: option.id })}
                className={`w-full rounded-[1.5rem] border p-5 text-start transition-all duration-300 sm:p-6 ${
                  isSelected
                    ? "border-slate-900 bg-slate-900/5 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="mb-1 text-base font-semibold text-slate-900">{option.title}</h3>
                    <p className="text-sm text-slate-500">{option.description}</p>
                  </div>
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                      isSelected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                    }`}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Follow-ups when provider HAS a terminal */}
      {hasTerminal && (
        <div className="space-y-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{t("web.provider.onboarding.payment.whichProvider")}</p>
            {renderRadioGroup(
              TERMINAL_VENDOR_OPTIONS,
              data.terminal_provider as any,
              (v) => updateData({ terminal_provider: v, terminal_provider_other: v !== "other" ? undefined : data.terminal_provider_other }),
            )}
            {data.terminal_provider === "other" && (
              <Input
                value={data.terminal_provider_other || ""}
                onChange={(e) => updateData({ terminal_provider_other: e.target.value })}
                placeholder={t("web.provider.onboarding.payment.whichModel")}
                className="mt-2 h-11 text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-xl"
              />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{t("web.provider.onboarding.payment.howMany")}</p>
            {renderRadioGroup(
              TERMINAL_COUNT_OPTIONS,
              data.terminal_count_range as any,
              (v) => updateData({ terminal_count_range: v }),
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{t("web.provider.onboarding.payment.activelyUsedQ")}</p>
            {renderRadioGroup(
              TERMINAL_USAGE_OPTIONS,
              data.terminal_active_usage_status as any,
              (v) => updateData({ terminal_active_usage_status: v }),
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{t("web.provider.onboarding.payment.interestedIntegrated")}</p>
            {renderRadioGroup(
              TERMINAL_INTEREST_OPTIONS,
              data.interested_in_platform_terminal as any,
              (v) => updateData({ interested_in_platform_terminal: v }),
            )}
          </div>
        </div>
      )}

      {/* Interest question for No / Planning */}
      {noOrPlanning && (
        <div className="space-y-3 rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-6">
          <p className="text-sm font-semibold text-slate-800">{t("web.provider.onboarding.payment.interestedFuture")}</p>
          <p className="text-xs text-slate-500">{t("web.provider.onboarding.payment.interestedFutureHint")}</p>
          {renderRadioGroup(
            TERMINAL_INTEREST_OPTIONS,
            data.interested_in_platform_terminal as any,
            (v) => updateData({ interested_in_platform_terminal: v }),
          )}
        </div>
      )}

      {/* VAT Registration */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("web.provider.onboarding.payment.vatRegistration")}</h3>
          <p className="text-sm text-gray-600 mb-4">
{t("web.provider.onboarding.leftover3.vatSarsHint")}
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              updateData({
                is_vat_registered: true,
                vat_number: data.vat_number || "",
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-start ${
              data.is_vat_registered === true
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">{t("web.provider.onboarding.payment.yesVat")}</h4>
                <p className="text-sm text-gray-600">{t("web.provider.onboarding.payment.yesVatSub")}</p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  data.is_vat_registered === true ? "border-primary bg-primary" : "border-gray-300"
                }`}
              >
                {data.is_vat_registered === true && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              updateData({
                is_vat_registered: false,
                vat_number: undefined,
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-start ${
              data.is_vat_registered === false
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">{t("web.provider.onboarding.payment.noVat")}</h4>
                <p className="text-sm text-gray-600">{t("web.provider.onboarding.payment.noVatSub")}</p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  data.is_vat_registered === false ? "border-primary bg-primary" : "border-gray-300"
                }`}
              >
                {data.is_vat_registered === false && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>
        </div>

        {data.is_vat_registered === true && (
          <div className="mt-4">
            <Label
              htmlFor="vat_number"
              className="text-base font-semibold text-gray-900 mb-2 block"
            >
              {t("web.provider.settings.pages.sales/taxes.vatNumberSars")} <span className="text-primary">*</span>
            </Label>
            <Input
              id="vat_number"
              type="text"
              placeholder={t("web.provider.settings.pages.sales/taxes.n4123456789")}
              value={data.vat_number || ""}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, "");
                if (value.length <= 10) {
                  updateData({ vat_number: value });
                }
              }}
              maxLength={10}
              required
              className="h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-xl"
            />
            <p className="text-xs text-gray-600 mt-2">
              {t("web.provider.onboarding.leftover2.vatNumberHint")}
            </p>
            {data.vat_number &&
              data.vat_number.length === 10 &&
              !data.vat_number.startsWith("4") && (
                <p className="text-xs text-red-600 mt-1">
                  {t("web.provider.onboarding.validation.vatStartsWith4")}
                </p>
              )}
          </div>
        )}

        {data.is_vat_registered === false && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <strong>{t("web.provider.onboarding.payment.notVatRegistered")}</strong> {t("web.provider.onboarding.leftover2.notVatSuitable")}
            </p>
          </div>
        )}
      </div>

      {/* Payout — deferred to post-wizard setup checklist */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {t("web.provider.onboarding.leftover2.payoutAccountTitle")}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {t("web.provider.onboarding.leftover2.payoutAccountBody", { path: t("web.provider.onboarding.payment.payoutAccountsPath") })}
          </p>
        </div>
      </div>
    </div>
  );
}

// Step 5: Current Software
function Step5CurrentSoftware({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [softwareOptions, setSoftwareOptions] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await fetcher.get<{
          data: Array<{ id: string; name: string; slug: string }>;
        }>("/api/public/previous-software-options");
        setSoftwareOptions(response.data || []);
      } catch (error) {
        console.error("Error loading software options:", error);
        setSoftwareOptions([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadOptions();
  }, []);

  const knownSlugs = useMemo(
    () => new Set(["none", "other", ...softwareOptions.map((o) => o.slug)]),
    [softwareOptions]
  );
  const displayValue =
    data.previous_software === "other" && data.previous_software_other
      ? data.previous_software_other
      : data.previous_software || null;
  const staticSuggestions = useMemo(
    () => [
      { value: "none", label: t("web.provider.onboarding.leftover.softwareNew") },
      ...softwareOptions.map((opt) => ({ value: opt.slug, label: opt.name })),
      { value: "other", label: t("web.provider.onboarding.leftover2.other") },
    ],
    [softwareOptions, t]
  );

  const handlePreviousSoftwareChange = (v: string | null) => {
    if (!v) {
      updateData({ previous_software: undefined, previous_software_other: undefined });
      return;
    }
    if (knownSlugs.has(v)) {
      updateData({
        previous_software: v,
        previous_software_other: v === "other" ? data.previous_software_other : undefined,
      });
    } else {
      updateData({ previous_software: "other", previous_software_other: v });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("web.provider.onboarding.steps.software.title")}</h3>
        <p className="text-base text-gray-600 mb-2">{t("web.provider.onboarding.steps.software.description")}</p>
        <p className="text-sm text-gray-500">
{t("web.provider.onboarding.leftover.softwareHint")}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <ChipCombobox
            singleSelect
            value={displayValue}
            onChange={handlePreviousSoftwareChange}
            staticSuggestions={staticSuggestions}
            allowFreeForm
            placeholder={t("web.provider.onboarding.software.selectPlaceholder")}
            aria-label={t("web.provider.onboarding.software.previousAria")}
          />
          {data.previous_software === "other" && !data.previous_software_other && (
            <div className="mt-2">
              <Label
                htmlFor="previous_software_other"
                className="text-base font-semibold text-gray-900 mb-2 block"
              >
                {t("web.provider.onboarding.leftover.whatSoftware")}
              </Label>
              <Input
                id="previous_software_other"
                value={data.previous_software_other || ""}
                onChange={(e) => updateData({ previous_software_other: e.target.value })}
                placeholder={t("web.provider.onboarding.software.enterName")}
                className="h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-xl"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 6: Payroll
function Step6Payroll({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { id: "commission", title: t("web.provider.onboarding.leftover.commission"), description: t("web.provider.onboarding.payroll.commissionSub") },
    { id: "hourly", title: t("web.provider.onboarding.payroll.hourly"), description: t("web.provider.onboarding.payroll.hourlySub") },
    { id: "both", title: t("provider.mobile.screens.onboardingWizard.business.bothLabel"), description: t("web.provider.onboarding.payroll.bothSub") },
    { id: "other", title: t("web.provider.bookings.detail.paymentMethods.other"), description: t("web.provider.onboarding.payroll.otherSub") },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-slate-900 sm:text-lg">{t("web.provider.onboarding.payroll.title")}</p>
            <p className="text-sm leading-relaxed text-slate-600">
{t("web.provider.onboarding.leftover.payrollHint")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {options.map((option) => {
          const isSelected = data.payroll_type === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateData({ payroll_type: option.id as any })}
              className={`w-full rounded-[1.5rem] border p-5 text-start transition-all duration-300 sm:p-6 ${
                isSelected
                  ? "border-slate-900 bg-slate-900/5 shadow-sm"
                  : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="mb-1 text-lg font-semibold text-slate-900">{option.title}</h3>
                  <p className="text-sm text-slate-500">{option.description}</p>
                </div>
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isSelected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.payroll_type === "other" && (
        <div className="mt-4">
          <Label
            htmlFor="payroll_details"
            className="text-sm font-semibold text-slate-900 mb-2 block"
          >
            {t("web.provider.onboarding.leftover.describePayroll")}
          </Label>
          <Textarea
            id="payroll_details"
            value={data.payroll_details || ""}
            onChange={(e) => updateData({ payroll_details: e.target.value })}
            placeholder={t("web.provider.onboarding.payroll.detailsPlaceholder")}
            className="min-h-[100px] text-base border-slate-200 bg-white rounded-xl resize-none focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 shadow-sm transition-all"
          />
        </div>
      )}
    </div>
  );
}

function Step7Location({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const isMobileOnly = data.business_type === "mobile";
  const isSalon = data.business_type === "salon";
  const isBoth = data.business_type === "both";
  const houseCallOrNoSalonNote = isMobileOnly || isBoth || data.team_size === "freelancer";

  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const defaultCountryDisplay = data.address?.country?.trim() || "South Africa";

  const mapboxCountryIso = useMemo(() => {
    const row = countries.find((c) => c.name === defaultCountryDisplay);
    return row?.code ?? countryFilterIso2FromStorage(defaultCountryDisplay) ?? "ZA";
  }, [countries, defaultCountryDisplay]);

  const proximity = useMemo(() => {
    const lat = data.address?.latitude;
    const lng = data.address?.longitude;
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      (lat === 0 && lng === 0)
    ) {
      return undefined;
    }
    return { latitude: lat, longitude: lng };
  }, [data.address?.latitude, data.address?.longitude]);

  const hasValidCoords =
    data.address?.latitude != null &&
    data.address?.longitude != null &&
    !(data.address.latitude === 0 && data.address.longitude === 0);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ code: string; name: string }> }>(
          "/api/public/countries"
        );
        const countriesData = response.data || [];

        if (countriesData.length === 0) {
          console.warn("Countries API returned empty array, using fallback");
          setCountries([
            { code: "ZA", name: "South Africa" },
            { code: "KE", name: "Kenya" },
            { code: "GH", name: "Ghana" },
            { code: "NG", name: "Nigeria" },
            { code: "EG", name: "Egypt" },
            { code: "US", name: "United States" },
            { code: "GB", name: "United Kingdom" },
            { code: "CA", name: "Canada" },
            { code: "AU", name: "Australia" },
            { code: "NZ", name: "New Zealand" },
          ]);
        } else {
          setCountries(countriesData);
        }
      } catch (error) {
        console.error("Error loading countries:", error);
        setCountries([
          { code: "ZA", name: "South Africa" },
          { code: "KE", name: "Kenya" },
          { code: "GH", name: "Ghana" },
          { code: "NG", name: "Nigeria" },
          { code: "EG", name: "Egypt" },
          { code: "US", name: "United States" },
          { code: "GB", name: "United Kingdom" },
          { code: "CA", name: "Canada" },
          { code: "AU", name: "Australia" },
          { code: "NZ", name: "New Zealand" },
        ]);
      } finally {
        setIsLoadingCountries(false);
      }
    };
    loadCountries();
  }, []);

  const handleAddressSelect = useCallback(
    (addressData: {
      address_line1: string;
      city: string;
      state?: string;
      postal_code?: string;
      country: string;
      latitude: number;
      longitude: number;
      place_name?: string;
    }) => {
      const coordsOk =
        addressData.latitude != null &&
        addressData.longitude != null &&
        !(addressData.latitude === 0 && addressData.longitude === 0);
      const prev = data.address;
      // DB provider_locations.address_line1 = street line (same as mobile); not full Mapbox place_name.
      const line1 =
        (addressData.address_line1 || "").trim() ||
        (prev?.line1 ?? "").trim() ||
        (addressData.place_name || "").trim() ||
        "";
      updateData({
        address: {
          line1,
          line2: prev?.line2 || undefined,
          city: addressData.city ?? prev?.city ?? "",
          state: addressData.state ?? prev?.state ?? "",
          postal_code: addressData.postal_code ?? prev?.postal_code ?? "",
          country: addressData.country?.trim() || defaultCountryDisplay,
          latitude: coordsOk ? addressData.latitude : (prev?.latitude ?? undefined),
          longitude: coordsOk ? addressData.longitude : (prev?.longitude ?? undefined),
        },
      });
    },
    [data.address, defaultCountryDisplay, updateData]
  );

  const onAddressLineTyping = useCallback(
    (value: string) => {
      const a = data.address;
      updateData({
        address: {
          line1: value,
          line2: a?.line2,
          city: a?.city ?? "",
          state: a?.state ?? "",
          postal_code: a?.postal_code ?? "",
          country: a?.country ?? defaultCountryDisplay,
          latitude: a?.latitude,
          longitude: a?.longitude,
        } as OnboardingData["address"],
      });
    },
    [data.address, defaultCountryDisplay, updateData]
  );

  const onMapLocationPicked = useCallback(
    (picked: PickedMapLocation) => {
      handleAddressSelect({
        address_line1: picked.address_line1,
        city: picked.city,
        state: picked.state,
        postal_code: picked.postal_code,
        country: picked.country?.trim() || defaultCountryDisplay,
        latitude: picked.latitude,
        longitude: picked.longitude,
        place_name: picked.place_name,
      });
    },
    [defaultCountryDisplay, handleAddressSelect]
  );

  const fieldClass =
    "h-14 text-base rounded-xl border-slate-200 bg-white focus-visible:border-slate-900 focus-visible:ring-1 focus-visible:ring-slate-900 shadow-sm transition-all";
  const helper = "text-sm text-slate-600 leading-relaxed";
  const helperMuted = "text-sm text-slate-500 leading-relaxed";

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
            <MapPin className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <h4 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              {t("web.provider.onboarding.leftover2.businessLocation")}
            </h4>
            {isMobileOnly ? (
              <p className={helper}>
                {t("web.provider.onboarding.leftover2.enterYour")} <strong className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover2.baseAddress")}</strong>{" "}
                {t("web.provider.onboarding.leftover2.mobileLocationBody")}
              </p>
            ) : isSalon ? (
              <p className={helper}>
                {t("web.provider.onboarding.leftover2.enterYour")} <strong className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover2.salonOrStudio")}</strong>{" "}
                {t("web.provider.onboarding.leftover2.salonLocationBody")}
              </p>
            ) : (
              <p className={helper}>
                {t("web.provider.onboarding.leftover2.operateFromBody")}
              </p>
            )}
            {houseCallOrNoSalonNote ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className={`${helperMuted} text-sm`}>
                  <span className="font-semibold text-slate-800">{t("web.provider.onboarding.location.houseCallsHint")}</span>{" "}
                  {t("web.provider.onboarding.leftover2.houseCallsBody")}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className="space-y-3 rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Label
              htmlFor="provider-onboarding-address"
              className="text-sm font-semibold text-slate-900"
            >
              {t("web.provider.onboarding.leftover2.streetAddress")} <span className="text-slate-400">*</span>
            </Label>
            <p className={`${helperMuted} mt-1 max-w-xl`}>
              {t("web.provider.onboarding.leftover2.searchMapboxHint")}{" "}
              <strong className="font-medium text-slate-800">{t("web.provider.onboarding.location.chooseSuggestion")}</strong> {t("web.provider.onboarding.leftover2.chooseSuggestionSuffix")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 rounded-full border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 shadow-sm"
            onClick={() => setMapPickerOpen(true)}
          >
            <MapPinned className="h-4 w-4" aria-hidden />
            {t("provider.mobile.screens.locationDetail.dropPin")}
          </Button>
        </div>

        <div className="mt-4">
          <AddressAutocomplete
            inputId="provider-onboarding-address"
            value={data.address?.line1 || ""}
            onChange={handleAddressSelect}
            onInputChange={onAddressLineTyping}
            placeholder={t("web.provider.onboarding.location.streetPlaceholder")}
            country={mapboxCountryIso}
            defaultCountryName={defaultCountryDisplay}
            proximity={proximity}
            inputClassName={cn(fieldClass, "ps-10")}
            required
          />
        </div>

        {hasValidCoords ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-emerald-800">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            </div>
            {t("web.provider.onboarding.leftover2.mapCoordsSaved")}
          </div>
        ) : (
          <p
            className={`${helperMuted} mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-amber-950`}
          >
            {t("web.provider.onboarding.leftover2.noGpsYet", { action: t("provider.mobile.screens.locationDetail.dropPin") })}
          </p>
        )}
      </section>

      <LocationMapPickerDialog
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initialLongitude={data.address?.longitude}
        initialLatitude={data.address?.latitude}
        defaultCountryName={defaultCountryDisplay}
        onLocationPicked={onMapLocationPicked}
      />

      <section className="space-y-3">
        <Label htmlFor="address_line2" className="text-sm font-semibold text-slate-900">
          {t("web.provider.onboarding.leftover2.apartmentSuite")} <span className="text-slate-400 font-normal">{t("web.provider.onboarding.leftover2.optionalParen")}</span>
        </Label>
        <p className={helperMuted}>{t("web.provider.onboarding.location.unitHint")}</p>
        <Input
          id="address_line2"
          value={data.address?.line2 || ""}
          onChange={(e) =>
            updateData({
              address: {
                ...data.address,
                line2: e.target.value || undefined,
              } as OnboardingData["address"],
            })
          }
          placeholder={t("web.provider.onboarding.location.unitPlaceholder")}
          className={fieldClass}
        />
      </section>

      <section className="space-y-3">
        <Label htmlFor="city" className="text-sm font-semibold text-slate-900">
          {t("web.provider.onboarding.leftover2.cityLabel")} <span className="text-slate-400">*</span>
        </Label>
        <Input
          id="city"
          value={data.address?.city || ""}
          onChange={(e) =>
            updateData({
              address: {
                ...data.address,
                city: e.target.value,
              } as OnboardingData["address"],
            })
          }
          placeholder={t("web.provider.onboarding.location.cityPlaceholder")}
          className={fieldClass}
          required
        />
        {data.address?.city ? (
          <p className="text-sm font-medium text-emerald-800">
{t("web.provider.onboarding.leftover3.filledFromMapbox")}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <section className="space-y-2">
          <Label htmlFor="state" className="text-base font-semibold text-slate-900">
            {t("web.provider.onboarding.leftover2.stateProvince")} <span className="text-slate-600 text-sm font-normal">{t("web.provider.onboarding.leftover2.optionalParen")}</span>
          </Label>
          <Input
            id="state"
            value={data.address?.state || ""}
            onChange={(e) =>
              updateData({
                address: {
                  ...data.address,
                  state: e.target.value,
                } as OnboardingData["address"],
              })
            }
            placeholder={t("web.provider.onboarding.location.provincePlaceholder")}
            className={fieldClass}
          />
        </section>
        <section className="space-y-2">
          <Label htmlFor="postal_code" className="text-base font-semibold text-slate-900">
            {t("web.provider.onboarding.leftover2.postalCodeLabel")} <span className="text-slate-600 text-sm font-normal">{t("web.provider.onboarding.leftover2.optionalParen")}</span>
          </Label>
          <Input
            id="postal_code"
            value={data.address?.postal_code || ""}
            onChange={(e) =>
              updateData({
                address: {
                  ...data.address,
                  postal_code: e.target.value,
                } as OnboardingData["address"],
              })
            }
            placeholder={t("web.provider.onboarding.location.postalPlaceholder")}
            className={fieldClass}
          />
        </section>
      </div>

      <section className="space-y-2">
        <Label htmlFor="country" className="text-base font-semibold text-slate-900">
          {t("web.provider.onboarding.leftover2.countryLabel")} <span className="text-primary">*</span>
        </Label>
        <p className={helperMuted}>
          {t("web.provider.onboarding.leftover2.countryBiasHint")}
        </p>
        {isLoadingCountries ? (
          <div
            className={cn(fieldClass, "flex items-center justify-center border border-slate-200")}
          >
            <p className="text-sm text-slate-600">{t("web.provider.onboarding.location.loadingCountries")}</p>
          </div>
        ) : (
          <select
            id="country"
            value={data.address?.country || "South Africa"}
            onChange={(e) =>
              updateData({
                address: {
                  ...data.address,
                  country: e.target.value,
                } as OnboardingData["address"],
              })
            }
            className={cn(fieldClass, "w-full px-4")}
            required
          >
            {countries.map((country) => (
              <option key={country.code} value={country.name}>
                {country.name}
              </option>
            ))}
          </select>
        )}
      </section>
    </div>
  );
}

function formatWebPlatformTravelDefaults(
  limits: {
    default_rate_per_km?: number;
    default_minimum_fee?: number;
    default_free_within_km?: number;
    default_maximum_fee?: number | null;
    default_currency?: string;
  } | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!limits) return t("web.provider.onboarding.location.loadingTravelRates");
  const currency = limits.default_currency?.trim() || LAST_RESORT_CURRENCY;
  const fmt = (amount: number) =>
    new Intl.NumberFormat(getDefaultMoneyLocale(), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  const parts: string[] = [];
  if (limits.default_rate_per_km != null && Number.isFinite(limits.default_rate_per_km)) {
    parts.push(t("web.provider.onboarding.leftover2.ratePerKm", { amount: fmt(limits.default_rate_per_km) }));
  }
  if (limits.default_minimum_fee != null && Number.isFinite(limits.default_minimum_fee)) {
    parts.push(t("web.provider.onboarding.leftover2.minFee", { amount: fmt(limits.default_minimum_fee) }));
  }
  if (limits.default_free_within_km != null && limits.default_free_within_km > 0) {
    parts.push(t("web.provider.onboarding.leftover2.freeWithinKm", { km: limits.default_free_within_km }));
  } else if (limits.default_free_within_km === 0) {
    parts.push(t("web.provider.onboarding.location.chargedFromFirstKm"));
  }
  if (limits.default_maximum_fee != null && Number.isFinite(limits.default_maximum_fee)) {
    parts.push(t("web.provider.onboarding.leftover2.maxFee", { amount: fmt(limits.default_maximum_fee) }));
  }
  return parts.length > 0 ? parts.join(" · ") : t("web.provider.onboarding.location.platformRatesApply");
}

function Step9ServiceZones({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [suggestedZones, setSuggestedZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>(data.selected_zone_ids || []);
  const [platformTravelLimits, setPlatformTravelLimits] = useState<{
    default_rate_per_km?: number;
    default_minimum_fee?: number;
    default_free_within_km?: number;
    default_maximum_fee?: number | null;
    default_currency?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetcher.get<{ data: typeof platformTravelLimits }>(
          "/api/provider/travel-fees/platform-limits",
        );
        if (!cancelled) setPlatformTravelLimits(response.data ?? null);
      } catch {
        if (!cancelled) setPlatformTravelLimits(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadZones = async () => {
      if (!data.address?.latitude || !data.address?.longitude) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // Call onboarding-specific suggest endpoint
        const response = await fetcher.post<{ data: { suggested_zones: any[] } }>(
          "/api/provider/onboarding/suggest-zones",
          {
            address: data.address?.line1 || "",
            latitude: data.address?.latitude,
            longitude: data.address?.longitude,
            city: data.address?.city || "",
            postal_code: data.address?.postal_code || "",
            country: data.address?.country || "",
          }
        );
        const zones = response.data?.suggested_zones || [];
        setSuggestedZones(zones);

        // Auto-select all suggested zones
        if (zones.length > 0) {
          const autoSelected = zones.map((z: any) => z.id);
          setSelectedZoneIds(autoSelected);
          updateData({ selected_zone_ids: autoSelected });
          toast.success(
            t("web.provider.onboarding.leftover2.autoSelectedZones", { count: autoSelected.length })
          );
        }
      } catch (error) {
        console.error("Error loading suggested zones:", error);
        // If suggest endpoint fails, we'll skip zone selection
        // Zones can be configured after onboarding
      } finally {
        setIsLoading(false);
      }
    };

    loadZones();
  }, [data.address?.latitude, data.address?.longitude]);

  const toggleZone = (zoneId: string) => {
    const newSelection = selectedZoneIds.includes(zoneId)
      ? selectedZoneIds.filter((id) => id !== zoneId)
      : [...selectedZoneIds, zoneId];
    setSelectedZoneIds(newSelection);
    updateData({ selected_zone_ids: newSelection });
  };

  const selectAll = () => {
    const allIds = suggestedZones.map((z) => z.id);
    setSelectedZoneIds(allIds);
    updateData({ selected_zone_ids: allIds });
    toast.success(t("web.provider.onboarding.toast.zonesSelected", { count: allIds.length }));
  };

  const deselectAll = () => {
    setSelectedZoneIds([]);
    updateData({ selected_zone_ids: [] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/50 px-8 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
          <p className="text-sm font-medium text-slate-800">
            {t("web.provider.onboarding.leftover2.findingZones")}
          </p>
        </div>
      </div>
    );
  }

  if (!data.address?.latitude || !data.address?.longitude) {
    return (
      <Alert className="rounded-[1.5rem] border-none bg-slate-50">
        <AlertCircle className="w-5 h-5 text-slate-500" />
        <AlertDescription className="text-sm leading-relaxed text-slate-600 ms-2">
          {t("web.provider.onboarding.leftover2.completeLocationFirst")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="rounded-[1.5rem] border-none bg-slate-50">
        <AlertCircle className="h-5 w-5 text-slate-500" />
        <AlertDescription className="text-sm leading-relaxed text-slate-600 ms-2">
          <strong className="text-slate-900">{t("web.provider.onboarding.zones.title")}</strong> {t("web.provider.onboarding.leftover2.zonesIntro")}
        </AlertDescription>
      </Alert>

      <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          {t("web.provider.onboarding.leftover2.travelFeesDefaults")}
        </p>
        <p className="mt-1 text-sm text-slate-800">
          {formatWebPlatformTravelDefaults(platformTravelLimits, t)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("web.provider.onboarding.leftover2.customizeTravelFees")}
        </p>
      </div>

      {suggestedZones.length === 0 ? (
        <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            {t("web.provider.onboarding.leftover2.noZonesMatched")}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {t("web.provider.onboarding.leftover2.foundZones", { count: suggestedZones.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full shadow-sm"
                onClick={selectAll}
              >
                {t("common.selectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full shadow-sm"
                onClick={deselectAll}
              >
                {t("web.provider.onboarding.leftover2.deselectAll")}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {suggestedZones.map((zone) => (
              <div
                key={zone.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleZone(zone.id);
                  }
                }}
                className={`cursor-pointer rounded-[1.5rem] border p-5 transition-all duration-300 ${
                  selectedZoneIds.includes(zone.id)
                    ? "border-slate-900 bg-slate-900/5 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                }`}
                onClick={() => toggleZone(zone.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedZoneIds.includes(zone.id)}
                        onChange={() => toggleZone(zone.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        aria-label={t("web.provider.onboarding.leftover2.selectZoneAria", { name: zone.name })}
                      />
                      <h3 className="text-lg font-semibold text-slate-900">{zone.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {zone.zone_type === "postal_code"
                          ? t("web.provider.onboarding.leftover2.postalCodeType")
                          : zone.zone_type === "city"
                            ? t("web.provider.onboarding.leftover2.cityType")
                            : zone.zone_type === "radius"
                              ? t("web.provider.onboarding.zones.radius")
                              : t("web.provider.onboarding.zones.polygon")}
                      </span>
                    </div>
                    <p className="mb-1 text-sm font-medium text-sky-800">{zone.match_reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedZoneIds.length > 0 && (
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:rounded-3xl sm:p-5">
              <p className="text-sm font-medium text-slate-900">
                {t("web.provider.onboarding.leftover2.zonesSelectedTravel", { count: selectedZoneIds.length })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Step10GlobalCategories({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-select common categories for freelancers
  useEffect(() => {
    if (
      data.business_type === "mobile" &&
      globalCategories.length > 0 &&
      (!data.global_category_ids || data.global_category_ids.length === 0)
    ) {
      // Suggest common categories for mobile services
      const commonCategories = globalCategories
        .filter((cat) => {
          const slug = cat.slug?.toLowerCase() || cat.name?.toLowerCase() || "";
          return (
            slug.includes("hair") ||
            slug.includes("massage") ||
            slug.includes("nails") ||
            slug.includes("barber")
          );
        })
        .slice(0, 2)
        .map((cat) => cat.id);

      if (commonCategories.length > 0) {
        updateData({ global_category_ids: commonCategories });
        toast.info(
          t("web.provider.onboarding.leftover2.preselectedCategories", { count: commonCategories.length }),
          { duration: 3000 }
        );
      }
    }
  }, [globalCategories, data.business_type]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: GlobalCategory[];
          error: null;
        }>("/api/public/categories/global?all=true");
        setGlobalCategories(response.data || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? t("web.provider.common.requestTimeout")
            : err instanceof FetchError
              ? err.message
              : t("web.provider.onboarding.categories.loadFailed");
        setError(errorMessage);
        console.error("Error loading global categories:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCategories();
  }, []);

  const toggleCategory = (categoryId: string) => {
    const categoryIds = data.global_category_ids || [];
    if (categoryIds.includes(categoryId)) {
      updateData({
        global_category_ids: categoryIds.filter((id) => id !== categoryId),
      });
    } else {
      updateData({ global_category_ids: [...categoryIds, categoryId] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-8 py-10 text-center shadow-sm sm:rounded-3xl">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-slate-800">{t("web.provider.onboarding.categories.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm sm:rounded-3xl">
        <p className="text-sm font-medium text-red-950">{error}</p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="mt-4 rounded-xl"
        >
          {t("web.provider.common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <Alert className="rounded-2xl border-indigo-200 bg-indigo-50 sm:rounded-3xl">
        <Sparkles className="h-4 w-4 text-indigo-700" />
        <AlertDescription className="text-sm leading-relaxed text-indigo-950">
          <strong className="text-indigo-950">{t("web.provider.onboarding.categories.tip")}</strong> {t("web.provider.onboarding.leftover2.categoriesTipBody")}
          {(!data.services || data.services.length === 0) && (
            <span>
              {" "}
              {t("web.provider.onboarding.leftover2.categoriesDraftHint")}
            </span>
          )}
        </AlertDescription>
      </Alert>
      {globalCategories.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-amber-950">
            {t("web.provider.onboarding.leftover2.noCategoriesAvailable")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {globalCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.id)}
              className={`rounded-[1.5rem] border p-4 text-start transition-all duration-300 sm:p-5 ${
                data.global_category_ids?.includes(category.id)
                  ? "border-slate-900 bg-slate-900/5 shadow-sm scale-[1.02]"
                  : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    data.global_category_ids?.includes(category.id)
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  <GlobalCategoryIcon
                    icon={category.icon || "Tag"}
                    size={20}
                    strokeWidth={2}
                    isActive={Boolean(data.global_category_ids?.includes(category.id))}
                  />
                </div>
                <span
                  className={`font-semibold ${
                    data.global_category_ids?.includes(category.id)
                      ? "text-slate-900"
                      : "text-slate-700"
                  }`}
                >
                  {category.name}
                </span>
              </div>
              {category.description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {category.description}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      {data.global_category_ids && data.global_category_ids.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-slate-900">
{t("web.provider.onboarding.leftover.categorySelected", { count: data.global_category_ids.length })}
          </p>
        </div>
      )}
    </div>
  );
}

function Step11ServiceCatalog({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [services, setServices] = useState<Service[]>(data.services || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formService, setFormService] = useState<Partial<Service>>({
    title: "",
    description: "",
    duration_minutes: 60,
    price: 0,
    currency: tenantCurrency,
    supports_at_home: false,
    supports_at_salon: true,
    addons: [],
  });

  useEffect(() => {
    updateData({ services });
  }, [services]);

  const handleAddService = () => {
    if (!formService.title || !formService.duration_minutes || formService.price === undefined) {
      toast.error(t("web.provider.onboarding.toast.fillRequired"));
      return;
    }

    if (editingIndex !== null) {
      const updated = [...services];
      updated[editingIndex] = formService as Service;
      setServices(updated);
      setEditingIndex(null);
    } else {
      setServices([...services, formService as Service]);
    }

    setFormService({
      title: "",
      description: "",
      duration_minutes: 60,
      price: 0,
      currency: tenantCurrency,
      supports_at_home: false,
      supports_at_salon: true,
      addons: [],
    });
    setShowAddForm(false);
    toast.success(editingIndex !== null ? t("provider.mobile.screens.onboardingWizard.services.updated") : t("provider.mobile.screens.onboardingWizard.services.added"));
  };

  const handleEditService = (index: number) => {
    setFormService(services[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
    toast.success(t("web.provider.onboarding.toast.serviceRemoved"));
  };

  return (
    <div className="space-y-6">
      <Alert className="rounded-[1.5rem] border-none bg-slate-50">
        <AlertCircle className="h-5 w-5 text-slate-500" />
        <AlertDescription className="text-sm leading-relaxed text-slate-600 ms-2">
{t("web.provider.onboarding.leftover3.catalogIntro")}
        </AlertDescription>
      </Alert>

      {services.length > 0 && (
        <div className="space-y-4">
          {services.map((service, index) => (
            <div
              key={index}
              className="space-y-3 rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900">{service.title}</h4>
                  {service.description && (
                    <p className="mt-1 text-sm text-slate-500">{service.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      {service.duration_minutes} mins
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      {service.currency} {service.price}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      {service.supports_at_salon && t("web.provider.onboarding.catalog.atSalon")}
                      {service.supports_at_salon && service.supports_at_home && " • "}
                      {service.supports_at_home && t("web.provider.onboarding.catalog.atHome")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 ms-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className={ONBOARDING_SOFT_SECONDARY_BTN}
                    onClick={() => handleEditService(index)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`${ONBOARDING_SOFT_SECONDARY_BTN} hover:border-red-200 hover:bg-red-50 hover:text-red-800`}
                    onClick={() => handleDeleteService(index)}
                    aria-label={t("web.provider.portal.appointmentCreate.removeService")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {/* Addons Section */}
              {service.addons && service.addons.length > 0 && (
                <div className="space-y-2 border-s-2 border-primary/25 ps-4">
                  <p className="text-xs font-semibold text-slate-600">{t("web.provider.onboarding.leftover.addOns")}</p>
                  {service.addons.map((addon, addonIndex) => (
                    <div
                      key={addonIndex}
                      className="flex items-center justify-between text-sm text-slate-700"
                    >
                      <span>
                        {addon.name}{" "}
                        {addon.duration_minutes ? t("web.provider.onboarding.leftover2.plusMinsParen", { minutes: addon.duration_minutes }) : ""}
                      </span>
                      <span className="font-medium">
                        {addon.currency} {addon.price}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 sm:rounded-3xl sm:p-6">
          <h4 className="mb-4 text-lg font-semibold text-slate-900">
            {editingIndex !== null ? t("provider.mobile.screens.onboardingWizard.services.editService") : t("provider.mobile.screens.onboardingWizard.services.addService")}
          </h4>
          <div className="space-y-4">
            <div>
              <Label htmlFor="service_title">{t("web.provider.onboarding.catalog.serviceName")}</Label>
              <Input
                id="service_title"
                value={formService.title || ""}
                onChange={(e) => setFormService({ ...formService, title: e.target.value })}
                placeholder={t("web.provider.onboarding.catalog.namePlaceholder")}
                required
              />
            </div>
            <div>
              <Label htmlFor="service_description">
                {t("web.provider.onboarding.leftover.description")}
                <span className="text-gray-500 font-normal text-xs ms-2">
                  {t("web.provider.onboarding.leftover.recommendedChars")}
                </span>
              </Label>
              <Textarea
                id="service_description"
                value={formService.description || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 500) {
                    setFormService({ ...formService, description: value });
                  }
                }}
                placeholder={t("web.provider.onboarding.leftover2.serviceDescPlaceholder")}
                rows={3}
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {formService.description && formService.description.length < 20 ? (
                    <span className="text-amber-600">
                      {t("web.provider.onboarding.leftover.considerMoreDetails", { count: formService.description.length })}
                    </span>
                  ) : (
                    <span>
                      {t("web.provider.onboarding.leftover.charsCount", { count: formService.description?.length || 0 })}
                      {formService.description && formService.description.length >= 20 && (
                        <span className="text-green-600 ms-2">{t("web.provider.onboarding.leftover.goodLength")}</span>
                      )}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const templates = [
                      t("web.provider.onboarding.leftover2.descTemplate1"),
                      t("web.provider.onboarding.leftover2.descTemplate2"),
                      t("web.provider.onboarding.leftover2.descTemplate3"),
                    ];
                    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
                    setFormService({ ...formService, description: randomTemplate });
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {t("web.provider.onboarding.leftover.useTemplate")}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="service_duration">{t("web.provider.onboarding.catalog.durationMins")}</Label>
                <Input
                  id="service_duration"
                  type="number"
                  min="1"
                  value={formService.duration_minutes || 60}
                  onChange={(e) =>
                    setFormService({
                      ...formService,
                      duration_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="service_price">{t("web.provider.onboarding.catalog.price")}</Label>
                <Input
                  id="service_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formService.price || 0}
                  onChange={(e) =>
                    setFormService({
                      ...formService,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="service_currency">{t("web.provider.onboarding.catalog.currency")}</Label>
                <select
                  id="service_currency"
                  value={formService.currency || tenantCurrency}
                  onChange={(e) => setFormService({ ...formService, currency: e.target.value })}
                  className="w-full p-2 border rounded-md"
                >
                  <option value={LAST_RESORT_CURRENCY}>
                    {currencySelectLabel(LAST_RESORT_CURRENCY)}
                  </option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formService.supports_at_salon !== false}
                  onChange={(e) =>
                    setFormService({ ...formService, supports_at_salon: e.target.checked })
                  }
                />
                <span className="text-sm">{t("web.provider.onboarding.leftover.availableAtSalon")}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formService.supports_at_home || false}
                  onChange={(e) =>
                    setFormService({ ...formService, supports_at_home: e.target.checked })
                  }
                />
                <span className="text-sm">{t("web.provider.onboarding.leftover.availableAtHome")}</span>
              </label>
            </div>

            {/* Addons Section */}
            <ServiceAddonsManager
              addons={formService.addons || []}
              currency={formService.currency || tenantCurrency}
              onAddonsChange={(addons) => setFormService({ ...formService, addons })}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleAddService}
                className="bg-primary hover:bg-primary-hover text-white"
              >
                {editingIndex !== null ? t("web.provider.onboarding.leftover.updateService") : t("web.provider.onboarding.leftover.addServiceBtn")}
              </Button>
              <Button
                variant="outline"
                className={ONBOARDING_SOFT_SECONDARY_BTN}
                onClick={() => {
                  setShowAddForm(false);
                  setEditingIndex(null);
                  setFormService({
                    title: "",
                    description: "",
                    duration_minutes: 60,
                    price: 0,
                    currency: tenantCurrency,
                    supports_at_home: false,
                    supports_at_salon: true,
                    addons: [],
                  });
                }}
              >
                {t("web.provider.common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowAddForm(true)} variant="outline" className="w-full">
          <Plus className="w-4 h-4 me-2" />
          {t("web.provider.catalogue.services.addService")}
        </Button>
      )}

      {services.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>{t("web.provider.onboarding.catalog.empty")}</p>
        </div>
      )}
    </div>
  );
}

function ServiceAddonsManager({
  addons,
  currency,
  onAddonsChange,
}: {
  addons: ServiceAddon[];
  currency: string;
  onAddonsChange: (addons: ServiceAddon[]) => void;
}) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formAddon, setFormAddon] = useState<Partial<ServiceAddon>>({
    name: "",
    description: "",
    price: 0,
    currency: currency,
    duration_minutes: 0,
  });

  const handleAddAddon = () => {
    if (!formAddon.name || formAddon.price === undefined) {
      toast.error(t("web.provider.onboarding.toast.addonRequired"));
      return;
    }

    if (editingIndex !== null) {
      const updated = [...addons];
      updated[editingIndex] = formAddon as ServiceAddon;
      onAddonsChange(updated);
      setEditingIndex(null);
    } else {
      onAddonsChange([...addons, formAddon as ServiceAddon]);
    }

    setFormAddon({
      name: "",
      description: "",
      price: 0,
      currency: currency,
      duration_minutes: 0,
    });
    setShowAddForm(false);
    toast.success(editingIndex !== null ? t("web.provider.onboarding.toast.addonUpdated") : t("web.provider.onboarding.toast.addonAdded"));
  };

  const handleEditAddon = (index: number) => {
    setFormAddon(addons[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteAddon = (index: number) => {
    onAddonsChange(addons.filter((_, i) => i !== index));
    toast.success(t("web.provider.onboarding.toast.addonRemoved"));
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{t("web.provider.onboarding.leftover.addonsOptional")}</Label>
          <p className="text-xs text-gray-500 mt-1">
            {t("web.provider.onboarding.leftover.addonsHint")}
          </p>
        </div>
        {!showAddForm && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 me-1" />
            {t("web.provider.onboarding.catalog.addAddon")}
          </Button>
        )}
      </div>

      {addons.length > 0 && (
        <div className="space-y-2">
          {addons.map((addon, index) => (
            <div
              key={index}
              className="p-3 bg-gray-50 rounded-lg flex items-center justify-between"
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{addon.name}</span>
                {addon.description && (
                  <p className="text-xs text-gray-600 mt-1">{addon.description}</p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  {addon.duration_minutes && addon.duration_minutes > 0 && (
                    <span>{t("web.provider.onboarding.catalog.addonMins", { minutes: addon.duration_minutes })}</span>
                  )}
                  <span>
                    {addon.currency} {addon.price}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ONBOARDING_SOFT_SECONDARY_BTN}
                  onClick={() => handleEditAddon(index)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`${ONBOARDING_SOFT_SECONDARY_BTN} hover:border-red-200 hover:bg-red-50 hover:text-red-800`}
                  onClick={() => handleDeleteAddon(index)}
                  aria-label={t("web.provider.onboarding.catalog.removeAddonAria")}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <h5 className="font-medium text-sm">
            {editingIndex !== null ? t("web.provider.onboarding.catalog.editAddon") : t("web.provider.onboarding.catalog.addAddon")}
          </h5>
          <div className="space-y-3">
            <div>
              <Label htmlFor="addon_name" className="text-xs">
                {t("web.provider.onboarding.leftover2.nameRequired")}
              </Label>
              <Input
                id="addon_name"
                value={formAddon.name || ""}
                onChange={(e) => setFormAddon({ ...formAddon, name: e.target.value })}
                placeholder={t("web.provider.onboarding.catalog.addonNamePlaceholder")}
                className="text-sm"
                required
              />
            </div>
            <div>
              <Label htmlFor="addon_description" className="text-xs">
                {t("web.provider.onboarding.leftover.description")}
              </Label>
              <Textarea
                id="addon_description"
                value={formAddon.description || ""}
                onChange={(e) => setFormAddon({ ...formAddon, description: e.target.value })}
                placeholder={t("web.provider.onboarding.catalog.addonDescriptionPlaceholder")}
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="addon_price" className="text-xs">
                  {t("web.provider.onboarding.catalog.price")}
                </Label>
                <Input
                  id="addon_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAddon.price || 0}
                  onChange={(e) =>
                    setFormAddon({
                      ...formAddon,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm"
                  required
                />
              </div>
              <div>
                <Label htmlFor="addon_currency" className="text-xs">
                  {t("web.provider.onboarding.catalog.currency")}
                </Label>
                <select
                  id="addon_currency"
                  value={formAddon.currency || currency}
                  onChange={(e) => setFormAddon({ ...formAddon, currency: e.target.value })}
                  className="w-full p-2 border rounded-md text-sm"
                >
                  <option value={LAST_RESORT_CURRENCY}>
                    {currencySelectLabel(LAST_RESORT_CURRENCY)}
                  </option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <Label htmlFor="addon_duration" className="text-xs">
                  {t("web.provider.onboarding.leftover3.extraTimeMins")}
                </Label>
                <Input
                  id="addon_duration"
                  type="number"
                  min="0"
                  value={formAddon.duration_minutes || 0}
                  onChange={(e) =>
                    setFormAddon({
                      ...formAddon,
                      duration_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="text-sm"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleAddAddon}
                size="sm"
                className="bg-primary hover:bg-primary-hover text-white"
              >
                {editingIndex !== null ? t("web.provider.onboarding.leftover3.updateAddon") : t("web.provider.onboarding.catalog.addAddon")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={ONBOARDING_SOFT_SECONDARY_BTN}
                onClick={() => {
                  setShowAddForm(false);
                  setEditingIndex(null);
                  setFormAddon({
                    name: "",
                    description: "",
                    price: 0,
                    currency: currency,
                    duration_minutes: 0,
                  });
                }}
              >
                {t("web.provider.common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Step12Hours({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const days = [
    { key: "monday", label: t("provider.mobile.screens.onboardingWizard.hours.days.monday") },
    { key: "tuesday", label: t("provider.mobile.screens.onboardingWizard.hours.days.tuesday") },
    { key: "wednesday", label: t("provider.mobile.screens.onboardingWizard.hours.days.wednesday") },
    { key: "thursday", label: t("provider.mobile.screens.onboardingWizard.hours.days.thursday") },
    { key: "friday", label: t("provider.mobile.screens.onboardingWizard.hours.days.friday") },
    { key: "saturday", label: t("provider.mobile.screens.onboardingWizard.hours.days.saturday") },
    { key: "sunday", label: t("provider.mobile.screens.onboardingWizard.hours.days.sunday") },
  ];

  const updateHours = (
    day: string,
    field: "open" | "close" | "closed",
    value: string | boolean
  ) => {
    const hours = data.operating_hours || {};
    updateData({
      operating_hours: {
        ...hours,
        [day]: { ...hours[day as keyof typeof hours], [field]: value },
      },
    });
  };

  const isFreelancer = data.business_type === "mobile";

  // Smart defaults for freelancers (more flexible hours)
  useEffect(() => {
    if (isFreelancer && !data.operating_hours) {
      updateData({
        operating_hours: {
          monday: { open: "08:00", close: "20:00", closed: false },
          tuesday: { open: "08:00", close: "20:00", closed: false },
          wednesday: { open: "08:00", close: "20:00", closed: false },
          thursday: { open: "08:00", close: "20:00", closed: false },
          friday: { open: "08:00", close: "20:00", closed: false },
          saturday: { open: "09:00", close: "18:00", closed: false },
          sunday: { open: "10:00", close: "16:00", closed: false },
        },
      });
    }
  }, [isFreelancer]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <Alert
        className={
          isFreelancer
            ? "rounded-[1.5rem] border-none bg-emerald-50/50"
            : "rounded-[1.5rem] border-none bg-slate-50"
        }
      >
        <AlertCircle
          className={`h-5 w-5 ${isFreelancer ? "text-emerald-600" : "text-slate-500"}`}
        />
        <AlertDescription
          className={`text-sm leading-relaxed ms-2 ${isFreelancer ? "text-emerald-800" : "text-slate-600"}`}
        >
          {isFreelancer ? (
            <span>
              <strong className="text-emerald-900">{t("web.provider.onboarding.leftover2.freelancerHoursTitle")}</strong> {t("web.provider.onboarding.leftover2.freelancerHoursBody")}
            </span>
          ) : (
            <span>
              <strong className="text-slate-900">{t("web.provider.onboarding.leftover2.locationBookingWindowTitle")}</strong> {t("web.provider.onboarding.leftover2.locationBookingWindowBody")}
            </span>
          )}
        </AlertDescription>
      </Alert>
      <div className="space-y-3">
        {days.map((day) => {
          const dayHours = data.operating_hours?.[day.key as keyof typeof data.operating_hours];
          return (
            <div
              key={day.key}
              className="flex flex-col items-start gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-5"
            >
              <div className="w-full text-sm font-semibold text-slate-900 sm:w-32 sm:text-base">
                {day.label}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!dayHours?.closed}
                  onChange={(e) => updateHours(day.key, "closed", !e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span className="text-sm font-medium text-slate-700">{t("web.provider.common.open")}</span>
              </label>
              {!dayHours?.closed && (
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                  <Input
                    type="time"
                    value={dayHours?.open || "09:00"}
                    onChange={(e) => updateHours(day.key, "open", e.target.value)}
                    className="w-full sm:w-32 text-sm sm:text-base"
                  />
                  <span className="text-sm sm:text-base">{t("web.provider.onboarding.leftover2.hoursTo")}</span>
                  <Input
                    type="time"
                    value={dayHours?.close || "18:00"}
                    onChange={(e) => updateHours(day.key, "close", e.target.value)}
                    className="w-full sm:w-32 text-sm sm:text-base"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step13Review({ data }: { data: Partial<OnboardingData> }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.businessInformation")}</h3>
        <div className={`${ONBOARDING_REVIEW_CARD} space-y-2`}>
          <p>
            <span className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover.nameColon")}</span> {data.business_name}
          </p>
          <p>
            <span className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover.typeColon")}</span> {data.business_type}
          </p>
          <p>
            <span className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover.phoneColon")}</span> {data.phone}
          </p>
          <p>
            <span className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover.emailColon")}</span> {data.email}
          </p>
          {data.previous_software && (
            <p>
              <span className="font-semibold text-slate-900">{t("web.provider.onboarding.leftover.previousSoftware")}</span>{" "}
              {data.previous_software === "other"
                ? data.previous_software_other || t("web.provider.onboarding.leftover2.other")
                : data.previous_software === "none"
                  ? t("web.provider.onboarding.software.noneFirstTime")
                  : data.previous_software.charAt(0).toUpperCase() +
                    data.previous_software.slice(1).replace(/_/g, " ")}
            </p>
          )}
        </div>
      </div>
      {data.description && (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.businessDescription")}</h3>
          <div className={ONBOARDING_REVIEW_CARD}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {data.description}
            </p>
            <p className="mt-3 text-xs text-slate-600">
              {t("web.provider.onboarding.leftover.characters", { count: data.description.length })}
              {data.description.length >= 50 && (
                <span className="ms-2 font-medium text-emerald-700">{t("web.provider.onboarding.leftover.goodLength")}</span>
              )}
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.steps.location.title")}</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          <p className="text-slate-800">
            {data.address?.line1}, {data.address?.city}, {data.address?.state}{" "}
            {data.address?.postal_code}
          </p>
          {data.address?.latitude && data.address?.longitude && (
            <p className="mt-2 text-xs text-slate-600">
              {t("web.provider.onboarding.leftover.coordinates", { lat: data.address.latitude.toFixed(6), lng: data.address.longitude.toFixed(6) })}
            </p>
          )}
        </div>
      </div>
      {(data.business_type === "mobile" || data.business_type === "both") &&
        data.selected_zone_ids &&
        data.selected_zone_ids.length > 0 && (
          <div>
            <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.zones.title")}</h3>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:rounded-3xl sm:p-5">
              <p className="text-sm font-medium text-sky-950">
                {t("web.provider.onboarding.leftover.zonesSelected", { count: data.selected_zone_ids.length })}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-sky-900">
                {t("web.provider.onboarding.leftover.travelFeesDefault")}
              </p>
            </div>
          </div>
        )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.serviceCategories")}</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          {data.global_category_ids && data.global_category_ids.length > 0 ? (
            <p className="text-slate-800">
              {t("web.provider.onboarding.leftover.categorySelected", { count: data.global_category_ids.length })}
            </p>
          ) : (
            <p className="text-slate-600">{t("web.provider.onboarding.leftover.noCategories")}</p>
          )}
        </div>
      </div>
      {(data.selected_plan_id || data.selected_plan_name) && (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.subscriptionPlan")}</h3>
          <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-4 sm:rounded-3xl sm:p-5">
            <p className="text-sm text-slate-900">
              {data.selected_plan_name ? (
                <span className="font-semibold">{data.selected_plan_name}</span>
              ) : (
                <span className="font-semibold">{t("web.provider.onboarding.leftover.planSelected")}</span>
              )}
              {data.selected_plan_id && !data.selected_plan_name && (
                <span className="ms-1 text-slate-600">{t("web.provider.onboarding.leftover.confirmNextStep")}</span>
              )}
            </p>
          </div>
        </div>
      )}
      {data.services && data.services.length > 0 ? (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.servicesCount", { count: data.services.length })}</h3>
          <div className={`${ONBOARDING_REVIEW_CARD} space-y-4`}>
            {data.services.map((service, index) => (
              <div key={index} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                <div className="text-sm">
                  <div className="mb-1 font-medium text-slate-900">
                    {t("web.provider.onboarding.leftover2.serviceReviewLine", {
                      title: service.title,
                      minutes: service.duration_minutes,
                      currency: service.currency,
                      price: service.price,
                    })}
                  </div>
                  {service.description && (
                    <div className="mt-2 border-s-2 border-primary/30 ps-3">
                      <p className="text-xs italic text-slate-700">
                        &ldquo;{service.description}&rdquo;
                      </p>
                    </div>
                  )}
                  {service.addons && service.addons.length > 0 && (
                    <div className="mt-2 space-y-1 border-s-2 border-slate-200 ps-4">
                      {service.addons.map((addon, addonIndex) => (
                        <div key={addonIndex} className="text-xs text-slate-700">
                          {t("web.provider.onboarding.leftover2.addonReviewLine", {
                            name: addon.name,
                            currency: addon.currency,
                            price: addon.price,
                          })}
                          {addon.duration_minutes &&
                            addon.duration_minutes > 0 &&
                            t("web.provider.onboarding.leftover2.plusMinSuffix", { minutes: addon.duration_minutes })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.services")}</h3>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5">
            <p className="text-sm font-medium text-amber-950">
              <span className="font-semibold">{t("web.provider.onboarding.leftover2.draftServicesLabel")}</span> {t("web.provider.onboarding.leftover.draftServicesBody")}
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>{t("web.provider.onboarding.leftover.operatingHours")}</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          {data.operating_hours && Object.keys(data.operating_hours).length > 0 ? (
            <div className="space-y-2 text-sm">
              {Object.entries(data.operating_hours).map(([day, hours]: [string, any]) => (
                <div
                  key={day}
                  className="flex justify-between gap-4 border-b border-slate-100 py-1 last:border-0"
                >
                  <span className="capitalize font-semibold text-slate-900">{t(`provider.mobile.screens.onboardingWizard.hours.days.${day}`)}</span>
                  <span className="text-slate-700">
                    {hours.closed ? t("provider.mobile.screens.onboardingWizard.hours.closedLabel") : `${hours.open} – ${hours.close}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600">{t("web.provider.onboarding.leftover.defaultHours")}</p>
          )}
        </div>
      </div>
      <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 sm:rounded-3xl">
        <Check className="h-4 w-4 text-emerald-700" />
        <AlertDescription className="text-sm leading-relaxed text-emerald-950">
          <strong className="text-emerald-950">{t("web.provider.onboarding.leftover.almostDone")}</strong> {t("web.provider.onboarding.leftover.afterSubmit")}
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-950/95">
            {data.business_type === "mobile" && <li>{t("web.provider.onboarding.review.markMobileReady")}</li>}
            {data.selected_zone_ids && data.selected_zone_ids.length > 0 && (
              <li>
                {t("web.provider.onboarding.leftover.attachZones", { count: data.selected_zone_ids.length })}
              </li>
            )}
            {(!data.services || data.services.length === 0) &&
              data.global_category_ids &&
              data.global_category_ids.length > 0 && (
                <li>{t("web.provider.onboarding.review.draftServices")}</li>
              )}
            <li>{t("web.provider.onboarding.review.createProfile")}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Step 14: Plan Selection
function Step14PlanSelection({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [pricingPlans, setPricingPlans] = useState<
    Array<{
      id: string;
      name: string;
      price: string;
      period: string | null;
      description: string | null;
      cta_text: string;
      is_popular: boolean;
      features: string[];
      is_free?: boolean;
    }>
  >([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      try {
        setIsLoadingPlans(true);
        const plans = await getPricingPlans();
        setPricingPlans(plans);

        // If plan was pre-selected from query params, ensure it's in the list
        if (data.selected_plan_id && !plans.find((p) => p.id === data.selected_plan_id)) {
          // Plan might not be active anymore, clear selection
          updateData({ selected_plan_id: undefined });
        }
      } catch (error) {
        console.error("Error loading pricing plans:", error);
        toast.error(t("web.provider.onboarding.toast.plansFailed"));
      } finally {
        setIsLoadingPlans(false);
      }
    }
    loadPlans();
  }, []);

  /** Default to first catalog plan (display_order: Starter free) when none selected */
  useEffect(() => {
    if (pricingPlans.length === 0) return;
    if (data.selected_plan_id?.trim()) return;
    updateData({ selected_plan_id: pricingPlans[0].id });
  }, [pricingPlans, data.selected_plan_id, updateData]);

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-6 py-5 shadow-sm sm:rounded-3xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <span className="text-sm font-medium text-slate-800">{t("web.provider.onboarding.leftover.loadingPlans")}</span>
        </div>
      </div>
    );
  }

  if (pricingPlans.length === 0) {
    return (
      <div className="text-center py-12">
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            {t("web.provider.onboarding.leftover2.noPlansAvailable")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedPlan = pricingPlans.find((p) => p.id === data.selected_plan_id) ?? null;
  const selectedIsFree = selectedPlan?.is_free === true;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 text-center shadow-sm sm:rounded-3xl sm:p-8">
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t("web.provider.onboarding.leftover2.chooseYourPlan")}
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600 sm:mt-3 sm:text-base">
          {t("web.provider.onboarding.leftover2.planIntro")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
        {pricingPlans.map((plan) => {
          const isSelected = data.selected_plan_id === plan.id;
          const planIsFree = plan.is_free === true;
          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              onClick={() => updateData({ selected_plan_id: plan.id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  updateData({ selected_plan_id: plan.id });
                }
              }}
              className={`relative cursor-pointer rounded-2xl border-2 p-5 shadow-sm transition-all sm:rounded-3xl sm:p-7 ${
                isSelected
                  ? "border-primary bg-primary/[0.06] shadow-lg ring-2 ring-primary/20"
                  : plan.is_popular
                    ? "border-slate-300 bg-white hover:border-primary/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {t("web.provider.onboarding.leftover2.mostPopularLower")}
                  </span>
                </div>
              )}

              <div className="mb-5 text-center sm:mb-6">
                <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
                  <h4 className="text-xl font-bold text-slate-900">{plan.name}</h4>
                  {planIsFree ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {t("web.provider.onboarding.leftover2.free")}
                    </span>
                  ) : null}
                </div>
                <div className="mb-2 flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                  {plan.period && <span className="text-sm text-slate-600">{plan.period}</span>}
                </div>
                {plan.description ? (
                  <div className="text-sm text-slate-600 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                    <PricingFeatureHtml html={plan.description} className="block leading-snug" />
                  </div>
                ) : null}
              </div>

              <ul className="mb-5 space-y-2.5 sm:mb-6 sm:space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 text-sm text-slate-800 [&_a]:text-primary [&_a]:underline [&_p]:m-0">
                      <PricingFeatureHtml html={feature} className="block leading-snug" />
                    </div>
                  </li>
                ))}
              </ul>

              <div
                className={`mb-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                  planIsFree ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-primary"
                }`}
              >
                {planIsFree ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    <span>{t("web.provider.onboarding.plan.activatesInstantly")}</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    <span>{t("web.provider.onboarding.plan.securePayment")}</span>
                  </>
                )}
              </div>

              <div
                className={`flex h-11 w-full items-center justify-center rounded-2xl ${
                  isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {isSelected ? (
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" aria-hidden />
                    <span className="font-semibold">{t("web.provider.onboarding.leftover2.selected")}</span>
                  </div>
                ) : (
                  <span className="font-semibold">{t("web.provider.onboarding.leftover2.selectPlan")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.selected_plan_id ? (
        <Alert
          className={`rounded-2xl sm:rounded-3xl ${
            selectedIsFree
              ? "border-emerald-200 bg-emerald-50"
              : "border-primary/30 bg-primary/[0.05]"
          }`}
        >
          <Check className={`h-4 w-4 ${selectedIsFree ? "text-emerald-700" : "text-primary"}`} />
          <AlertDescription
            className={`text-sm leading-relaxed ${
              selectedIsFree ? "text-emerald-950" : "text-slate-900"
            }`}
          >
            <strong>{selectedIsFree ? t("web.provider.onboarding.toast.freePlanSelected") : t("web.provider.onboarding.toast.paidPlanSelected")}</strong>{" "}
            {selectedIsFree
              ? t("web.provider.onboarding.leftover2.afterSubmitFreeActual")
              : t("web.provider.onboarding.leftover2.afterSubmitPaidActual")}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="rounded-2xl border-slate-200 bg-slate-50 sm:rounded-3xl">
          <AlertCircle className="h-4 w-4 text-slate-700" />
          <AlertDescription className="text-sm leading-relaxed text-slate-800">
            {t("web.provider.onboarding.leftover2.selectPlanToContinue")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
