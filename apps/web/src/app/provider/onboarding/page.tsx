"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Check, Plus, Trash2, AlertCircle, Sparkles, Upload, Image as ImageIcon, X, Loader2, MapPin, CircleUser, Globe, Share2, Building2, MapPinned } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { LocationMapPickerDialog, type PickedMapLocation } from "@/components/mapbox/LocationMapPickerDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Breadcrumb from "@/components/ui/breadcrumb";
import { validateFileType, validateFileSize, IMAGE_CONSTRAINTS } from "@/lib/supabase/storage-client";
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
} from "@/lib/supabase/auth-sms-otp";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";
import { GlobalCategoryIcon } from "@/components/icons/GlobalCategoryIcon";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { currencySelectLabel } from "@/lib/locale/currency";

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
  
  // Step 4: Payment Setup
  yoco_machine: "yes" | "no" | "other";
  yoco_machine_other?: string;
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
  avatar_url?: string; // optional profile circle (business face) for listing cards
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
  "h-9 min-h-9 shrink-0 border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35";

/** Shared shell: rounded cards, depth, and text contrast across onboarding steps. */
const ONBOARDING_PAGE_BG =
  "min-h-screen bg-gradient-to-b from-slate-50 via-rose-50/35 to-violet-100/30";
const ONBOARDING_CONTAINER = "w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-5 sm:py-8 md:py-10";
const ONBOARDING_PROGRESS_CARD =
  "mb-5 sm:mb-7 rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white/90 shadow-md shadow-slate-200/40 backdrop-blur-sm px-4 py-4 sm:px-6 sm:py-5 ring-1 ring-slate-100";
const ONBOARDING_MAIN_CARD =
  "rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-300/25 ring-1 ring-slate-200/80 p-5 sm:p-8 md:p-10";
const ONBOARDING_STEP_TITLE =
  "text-2xl sm:text-3xl font-bold tracking-tight text-slate-900";
const ONBOARDING_STEP_DESC = "mt-2 text-base text-slate-600 leading-relaxed max-w-2xl";
const ONBOARDING_NAV_ROW =
  "flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-slate-200";
const ONBOARDING_BTN_BACK =
  "w-full sm:w-auto h-12 sm:h-14 rounded-xl sm:rounded-2xl border-2 border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400";
const ONBOARDING_BTN_SKIP =
  "flex-1 sm:flex-none h-12 sm:h-14 rounded-xl sm:rounded-2xl border-2 border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50 hover:border-slate-400";
const ONBOARDING_BTN_NEXT =
  "flex-1 sm:flex-none h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold shadow-lg shadow-primary/25";
const ONBOARDING_REVIEW_HEADING = "font-semibold text-slate-900 mb-3 text-base sm:text-lg";
const ONBOARDING_REVIEW_CARD =
  "rounded-2xl sm:rounded-3xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5 text-sm text-slate-800 shadow-sm";

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

  const e164 =
    normalizeFullPhoneToE164(trimmed) ?? normalizeFullPhoneToE164(compact);
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
  rawProfilePhone: string | null;
};

async function fetchProfilePrefillForOnboarding(): Promise<ProfilePrefillResult | null> {
  try {
    const response = await fetcher.get<{
      data: {
        full_name?: string | null;
        email?: string | null;
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
    if (em) ownerPatch.owner_email = em;
    const e164 = coerceOwnerPhoneToE164ForForm(ph);
    if (e164) ownerPatch.owner_phone = e164;
    return {
      ownerPatch,
      phoneVerifiedInDb: Boolean(p.phone_verified),
      rawProfilePhone: ph || null,
    };
  } catch {
    return null;
  }
}

function mergeAccountIntoOnboardingForm(form: Partial<OnboardingData>, prefill: ProfilePrefillResult) {
  if (!form.owner_name?.trim() && prefill.ownerPatch.owner_name) {
    form.owner_name = prefill.ownerPatch.owner_name;
  }
  if (!form.owner_email?.trim() && prefill.ownerPatch.owner_email) {
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
  if (!form.phone?.trim() && form.owner_phone) {
    form.phone = form.owner_phone;
  }
  if (!form.email?.trim() && form.owner_email) {
    form.email = form.owner_email;
  }
}

const INITIAL_ONBOARDING_DATA: Partial<OnboardingData> = {
  team_size: undefined,
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  phone_verified: false,
  business_name: "",
  business_type: "salon",
  description: "",
  yoco_machine: undefined,
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

// New streamlined step order
const STEPS = [
  { id: 1, title: "Team Size", description: "Tell us about your team" },
  { id: 2, title: "Your Identity", description: "Your name, email, and phone" },
  { id: 3, title: "Business Details", description: "Tell us about your business" },
  { id: 4, title: "Payment Setup", description: "Do you have a Yoco machine?" },
  { id: 5, title: "Current Software", description: "Are you moving from another system?" },
  { id: 6, title: "Payroll", description: "How do you pay your staff?", conditional: (data: Partial<OnboardingData>) => data.team_size !== "freelancer" },
  { id: 7, title: "Location", description: "Where are you located?" },
  { id: 8, title: "Photos", description: "Add your photos" },
  { id: 9, title: "Service Zones", description: "Select service areas", canSkip: true, conditional: (data: Partial<OnboardingData>) => data.business_type === "mobile" || data.business_type === "both" },
  { id: 10, title: "Service Categories", description: "Select categories" },
  { id: 11, title: "Service Catalog", description: "Add your services", canSkip: true },
  { id: 12, title: "Operating Hours", description: "When are you open?" },
  { id: 13, title: "Review", description: "Review and submit" },
  { id: 14, title: "Choose Your Plan", description: "Select a subscription plan" },
];

export default function ProviderOnboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [inAppFromUrl, setInAppFromUrl] = useState(false);
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

  // Auto-save draft when form data changes
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (formData.business_name || formData.address) {
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
          typeof window !== "undefined" ? window.sessionStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY) : null;
        if (raw) {
          const parsed = JSON.parse(raw) as { draft_data?: Partial<OnboardingData>; current_step?: number };
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

    const prefill = await fetchProfilePrefillForOnboarding();
    if (prefill) {
      mergeAccountIntoOnboardingForm(merged, prefill);
    }

    setFormData(merged);
    setCurrentStep(step);
    if (resumed === "server") {
      toast.success("Resumed from saved draft");
    } else if (resumed === "session") {
      toast.success("Resumed from saved progress");
    }
  };

  const saveDraft = async () => {
    try {
      setIsSavingDraft(true);
      await fetcher.post("/api/provider/onboarding/draft", {
        draft_data: formData,
        current_step: currentStep,
      });
    } catch (error) {
      // When not logged in (401), persist to sessionStorage so progress isn't lost
      if (error instanceof FetchError && error.status === 401) {
        try {
          sessionStorage.setItem(
            ONBOARDING_DRAFT_STORAGE_KEY,
            JSON.stringify({ draft_data: formData, current_step: currentStep })
          );
        } catch {
          // Ignore storage errors
        }
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
        if (!formData.team_size) errors.push("Please select your team size");
        break;
      case 2: // Identity
        if (!formData.owner_name?.trim()) errors.push("Your name is required");
        if (!formData.owner_email?.trim()) errors.push("Email is required");
        if (formData.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.owner_email)) {
          errors.push("Invalid email address");
        }
        if (!isValidOwnerPhoneE164(formData.owner_phone)) errors.push("Phone number is required");
        if (!formData.phone_verified) errors.push("Please verify your phone number");
        break;
      case 3: // Business Details
        if (!formData.business_name?.trim()) errors.push("Business name is required");
        break;
      case 4: // Payment Setup
        // Validate VAT registration if selected
        if (formData.is_vat_registered === true) {
          if (!formData.vat_number?.trim()) {
            errors.push("VAT number is required when VAT registered");
          } else if (formData.vat_number.length !== 10) {
            errors.push("VAT number must be 10 digits");
          } else if (!formData.vat_number.startsWith('4')) {
            errors.push("South African VAT numbers must start with 4");
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
        if (!formData.address?.line1?.trim()) errors.push("Street address is required");
        if (!formData.address?.city?.trim()) errors.push("City is required");
        if (!formData.address?.country?.trim()) errors.push("Country is required");
        break;
      case 8: // Photos
        // Optional - no validation
        break;
      case 9: // Service Zones
        // Optional (can skip)
        break;
      case 10: // Service Categories
        if (!formData.global_category_ids || formData.global_category_ids.length === 0) {
          errors.push("Please select at least one service category");
        }
        break;
      case 11: // Service Catalog
        // Optional - no validation
        break;
      case 12: { // Hours
        const hours = formData.operating_hours;
        if (!hours || Object.keys(hours).length === 0) {
          errors.push("Please set your operating hours");
        } else {
          const hasOpenDay = Object.values(hours).some(
            (h: any) => h && !h.closed
          );
          if (!hasOpenDay) {
            errors.push("At least one day must be open");
          }
        }
        break;
      }
      case 13: // Review
        // Optional - no validation
        break;
      case 14: // Plan Selection
        if (!formData.selected_plan_id?.trim()) {
          errors.push("Please select a subscription plan");
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

      // Final validation
      const validation = validateStep(1);
      if (!validation.valid) {
        validation.errors.forEach((error) => toast.error(error));
        return;
      }

      // Validate required fields
      if (!formData.team_size) {
        toast.error("Please select your team size");
        return;
      }
      if (
        !formData.owner_name ||
        !formData.owner_email ||
        !isValidOwnerPhoneE164(formData.owner_phone)
      ) {
        toast.error("Please complete your identity information");
        return;
      }
      if (!formData.phone_verified) {
        toast.error("Please verify your phone number");
        return;
      }
      if (!formData.business_name || !formData.address) {
        toast.error("Please complete all required fields");
        return;
      }

      if (!formData.global_category_ids || formData.global_category_ids.length === 0) {
        toast.error("Please select at least one service category");
        return;
      }

      // Submit onboarding data
      const onboardingData = {
        // New fields
        team_size: formData.team_size,
        owner_name: formData.owner_name,
        owner_email: formData.owner_email,
        owner_phone: coerceOwnerPhoneToE164ForForm(formData.owner_phone) || formData.owner_phone,
        yoco_machine: formData.yoco_machine || null,
        yoco_machine_other: formData.yoco_machine_other || null,
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
        thumbnail_url: formData.thumbnail_url || null,
        avatar_url: formData.avatar_url || null,
        gallery: formData.gallery || [],
        years_in_business: formData.years_in_business || null,
        accepts_custom_requests: formData.accepts_custom_requests || false,
        response_rate: formData.response_rate || 100,
        response_time_hours: formData.response_time_hours || 1,
        languages_spoken: formData.languages_spoken || ["English"],
        social_media_links: formData.social_media_links || {},
        website: formData.website || null,
        tax_rate_percent: formData.tax_rate_percent || null,
        tips_enabled: formData.tips_enabled || false,
        cancellation_window_hours: formData.cancellation_window_hours || 24,
        requires_deposit: formData.requires_deposit || false,
        deposit_percentage: formData.deposit_percentage || null,
        no_show_fee_enabled: formData.no_show_fee_enabled || false,
        no_show_fee_amount: formData.no_show_fee_amount || null,
        include_in_search_engines: formData.include_in_search_engines !== false, // Default to true
        selected_plan_id: formData.selected_plan_id || null,
      };

      // Validate required fields before sending
      if (!onboardingData.address.line1 || !onboardingData.address.city || !onboardingData.address.country) {
        toast.error("Please complete all required address fields");
        return;
      }

      if (!onboardingData.global_category_ids || onboardingData.global_category_ids.length === 0) {
        toast.error("Please select at least one service category");
        return;
      }

      // §Provider-launch (audit 2026-04): never log the full onboarding
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
        };
        error: null;
      }>("/api/provider/onboarding", onboardingData);

      const successMessage = response.data?.message || "Onboarding submitted! We'll review your application.";
      const autoConfig = response.data?.auto_configured;
      const subscriptionEndpoint = response.data?.subscription_endpoint;
      const selectedPlanId = response.data?.selected_plan_id;

      // If a plan was selected, send user to subscription checkout (Cart + Order summary), then Paystack
      if (subscriptionEndpoint && selectedPlanId) {
        try {
          sessionStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
        } catch {}
        toast.success("Onboarding complete. Complete your subscription below.", { duration: 3000 });
        const inAppParam = inAppFromUrl ? "&in_app=1" : "";
        router.push(`/provider/subscription-checkout?planId=${selectedPlanId}${inAppParam}`);
        return;
      }

      // Show detailed success message
      if (autoConfig && (autoConfig.zones > 0 || autoConfig.services > 0 || autoConfig.mobile_ready)) {
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
      } catch {}
      // Small delay to let user see the success message
      setTimeout(() => {
        router.push("/provider/dashboard");
      }, 1500);
    } catch (error) {
      let errorMessage = "Failed to submit onboarding. Please try again.";
      
      if (error instanceof FetchError) {
        console.error("FetchError details:", {
          message: error.message,
          status: error.status,
          code: error.code,
          details: error.details
        });
        
        // Try to extract validation errors from the details
        if (error.details && Array.isArray(error.details)) {
          console.error("Validation errors:", JSON.stringify(error.details, null, 2));
          // Show all validation errors - format for toast (toast doesn't support newlines well)
          const validationErrors = error.details.map((err: any, index: number) => {
            if (typeof err === 'string') return `${index + 1}. ${err}`;
            const path = err.path || 'field';
            const msg = err.message || 'Invalid value';
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
              errorMessage += ` (and ${validationErrors.length - 1} more - see console)`;
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
  const totalVisibleSteps = STEPS.filter(s => !s.conditional || (s.conditional && s.conditional(formData))).length;

  return (
    <RoleGuard 
      allowedRoles={["customer", "provider_owner"]} 
      redirectTo="/become-a-partner"
      showLoading={true}
    >
      <div className={ONBOARDING_PAGE_BG}>
        <div className={ONBOARDING_CONTAINER}>
          <div className="mb-4 sm:mb-5">
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Become a Partner", href: "/become-a-partner" },
                { label: "Onboarding" },
              ]}
            />
          </div>

          <div className={ONBOARDING_PROGRESS_CARD}>
            {/* Mobile: compact progress */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">
                  Step {getActualStepIndex()} of {totalVisibleSteps}
                </p>
                <p className="text-sm font-medium text-slate-600 tabular-nums">
                  {Math.round((getActualStepIndex() / totalVisibleSteps) * 100)}% complete
                </p>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(getActualStepIndex() / totalVisibleSteps) * 100}%` }}
                  role="progressbar"
                  aria-valuenow={getActualStepIndex()}
                  aria-valuemin={1}
                  aria-valuemax={totalVisibleSteps}
                />
              </div>
            </div>

            {/* Desktop: stepper */}
            <div className="hidden sm:block">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your progress
                </p>
                {isSavingDraft && (
                  <p className="text-xs font-medium text-slate-600">Saving…</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                {STEPS.filter((s) => !s.conditional || (s.conditional && s.conditional(formData))).map((step, index) => {
                  const isCompleted = currentStep > step.id;
                  const isCurrent = currentStep === step.id;
                  return (
                    <div key={step.id} className="flex flex-1 items-center">
                      <div className="flex flex-1 flex-col items-center">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200 sm:h-12 sm:w-12 ${
                            isCompleted || isCurrent
                              ? "scale-105 border-primary bg-primary text-white shadow-md"
                              : "border-slate-300 bg-white text-slate-500"
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                          ) : (
                            <span className="text-sm font-semibold sm:text-base">{index + 1}</span>
                          )}
                        </div>
                        <div className="mt-2 text-center px-0.5">
                          <p
                            className={`text-[10px] font-medium leading-tight sm:text-xs ${
                              isCompleted || isCurrent ? "text-slate-900" : "text-slate-500"
                            }`}
                          >
                            {step.title}
                          </p>
                        </div>
                      </div>
                      {index < totalVisibleSteps - 1 && (
                        <div
                          className={`mx-1 h-1 flex-1 rounded-full transition-all duration-300 sm:mx-2 ${
                            isCompleted ? "bg-primary" : "bg-slate-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {isSavingDraft && (
              <p className="mt-3 text-center text-xs font-medium text-slate-600 sm:hidden">Saving progress…</p>
            )}
          </div>

          <div className={ONBOARDING_MAIN_CARD}>
            <header className="mb-6 sm:mb-8">
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 sm:block">
                Step {getActualStepIndex()} of {totalVisibleSteps}
              </p>
              <h2 className={`${ONBOARDING_STEP_TITLE} mt-2`}>{currentStepData.title}</h2>
              <p className={ONBOARDING_STEP_DESC}>{currentStepData.description}</p>
            </header>

            {currentStep === 1 && (
              <Step1TeamSize data={formData} updateData={updateFormData} />
            )}
            {currentStep === 2 && (
              <Step2Identity data={formData} updateData={updateFormData} />
            )}
            {currentStep === 3 && (
              <Step3BusinessDetails data={formData} updateData={updateFormData} />
            )}
            {currentStep === 4 && (
              <Step4PaymentSetup data={formData} updateData={updateFormData} />
            )}
            {currentStep === 5 && (
              <Step5CurrentSoftware data={formData} updateData={updateFormData} />
            )}
            {currentStep === 6 && (
              <Step6Payroll data={formData} updateData={updateFormData} />
            )}
            {currentStep === 7 && (
              <Step7Location data={formData} updateData={updateFormData} />
            )}
            {currentStep === 8 && (
              <Step8Photos data={formData} updateData={updateFormData} />
            )}
            {currentStep === 9 && (
              <Step9ServiceZones data={formData} updateData={updateFormData} />
            )}
            {currentStep === 10 && (
              <Step10GlobalCategories data={formData} updateData={updateFormData} />
            )}
            {currentStep === 11 && (
              <Step11ServiceCatalog data={formData} updateData={updateFormData} />
            )}
            {currentStep === 12 && (
              <Step12Hours data={formData} updateData={updateFormData} />
            )}
            {currentStep === 13 && <Step13Review data={formData} />}
            {currentStep === 14 && (
              <Step14PlanSelection data={formData} updateData={updateFormData} />
            )}

            <nav className={ONBOARDING_NAV_ROW} aria-label="Onboarding steps">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                className={ONBOARDING_BTN_BACK}
              >
                <ChevronLeft className="mr-2 h-5 w-5" aria-hidden />
                Back
              </Button>
              <div className="flex w-full gap-3 sm:w-auto sm:gap-4">
                {canSkip && currentStep < STEPS.length && (
                  <Button variant="outline" onClick={handleSkip} className={ONBOARDING_BTN_SKIP}>
                    Skip for now
                  </Button>
                )}
                {currentStep < STEPS.length ? (
                  <Button onClick={handleNext} className={`${ONBOARDING_BTN_NEXT} bg-primary text-white hover:bg-primary-hover`}>
                    Next
                    <ChevronRight className="ml-2 h-5 w-5" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={`${ONBOARDING_BTN_NEXT} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`}
                  >
                    {isSubmitting ? "Submitting…" : "Submit"}
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
  const teamSizeOptions = [
    {
      id: "freelancer",
      title: "Freelancer or Solo",
      subtitle: "It's just me",
      description: "Perfect for independent professionals",
      badge: "Most Popular",
      icon: "👤",
    },
    {
      id: "small",
      title: "Small Team",
      subtitle: "2 – 10 staff members",
      description: "Growing business with a small team",
      icon: "👥",
    },
    {
      id: "medium",
      title: "Medium Team",
      subtitle: "11 – 20 staff members",
      description: "Established business with a solid team",
      icon: "👨‍👩‍👧‍👦",
    },
    {
      id: "large",
      title: "Large Team",
      subtitle: "20+ staff members",
      description: "Large operation with multiple staff",
      icon: "🏢",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 text-center shadow-sm sm:rounded-3xl sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">Tell us about your team</h3>
        <p className="mt-2 text-base text-slate-700">How many staff members are there?</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          We use this to tailor setup (for example, payroll steps only when you have a team). You&apos;ll choose salon,
          mobile, or both in the next step.
        </p>
      </div>

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
              className={`relative rounded-2xl border-2 p-6 text-left shadow-sm transition-all duration-200 hover:shadow-md sm:rounded-3xl sm:p-7 ${
                isSelected
                  ? "border-primary bg-primary/[0.06] shadow-md ring-2 ring-primary/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {option.badge && (
                <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white">
                  {option.badge}
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="text-4xl" aria-hidden>
                  {option.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-lg font-semibold text-slate-900">{option.title}</h3>
                  <p className="mb-2 text-sm font-medium text-slate-700">{option.subtitle}</p>
                  <p className="text-sm text-slate-600">{option.description}</p>
                </div>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    isSelected ? "border-primary bg-primary" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-4 w-4 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Legacy Step1BusinessInfo - keeping for reference, will be replaced
function _Step1BusinessInfo({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [previousSoftwareOptions, setPreviousSoftwareOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [isLoadingSoftwareOptions, setIsLoadingSoftwareOptions] = useState(true);

  useEffect(() => {
    const loadPreviousSoftwareOptions = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ id: string; name: string; slug: string }> }>("/api/public/previous-software-options");
        setPreviousSoftwareOptions(response.data || []);
      } catch (error) {
        console.error("Error loading previous software options:", error);
        // Fallback to empty array - the select will just be empty
        setPreviousSoftwareOptions([]);
      } finally {
        setIsLoadingSoftwareOptions(false);
      }
    };
    loadPreviousSoftwareOptions();
  }, []);
  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <Alert className="bg-blue-50 border-blue-200">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          <strong>Quick Setup:</strong> We'll automatically configure most settings for you! 
          {data.business_type === "mobile" && " As a freelancer, we'll mark you as mobile-ready and help you select service zones."}
          {data.business_type === "both" && " We'll help you set up both salon and mobile services."}
          {(!data.business_type || data.business_type === "salon") && " We'll help you get started quickly with smart defaults."}
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="business_name" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Name <span className="text-primary">*</span>
        </Label>
        <Input
          id="business_name"
          value={data.business_name || ""}
          onChange={(e) => updateData({ business_name: e.target.value })}
          placeholder="Enter your business name"
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
          required
        />
      </div>
      <div>
        <Label htmlFor="business_type" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Type <span className="text-primary">*</span>
        </Label>
        <select
          id="business_type"
          value={data.business_type || "salon"}
          onChange={(e) => {
            const newType = e.target.value as any;
            updateData({ business_type: newType });
            
            // Show helpful message about what will be auto-configured
            if (newType === "mobile") {
              toast.info("We'll automatically mark you as mobile-ready and help you set up service zones!", { duration: 4000 });
            }
          }}
          className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-primary focus:ring-primary bg-white"
        >
          <option value="salon">Salon/Studio (Fixed Location)</option>
          <option value="mobile">Freelancer (Mobile/At-Home Services)</option>
          <option value="both">Both (Salon + Mobile Services)</option>
        </select>
        <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
          {data.business_type === "mobile" && (
            <span>
              <strong>Freelancer mode:</strong> You'll be automatically set up as mobile-ready staff. 
              We'll help you select service zones where you can provide at-home services.
            </span>
          )}
          {data.business_type === "salon" && (
            <span>Salons have a fixed location where customers visit for services.</span>
          )}
          {data.business_type === "both" && (
            <span>
              <strong>Hybrid mode:</strong> You operate both a fixed location and provide mobile/at-home services. 
              We'll help you configure both.
            </span>
          )}
          {!data.business_type && (
            <span>Select your business model. You can upgrade from freelancer to salon later.</span>
          )}
        </p>
      </div>
      <div>
        <Label htmlFor="website" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Website URL
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <Input
          id="website"
          type="url"
          value={data.website || ""}
          onChange={(e) => {
            let value = e.target.value.trim();
            // Auto-add https:// if missing
            if (value && !value.match(/^https?:\/\//)) {
              value = `https://${value}`;
            }
            updateData({ website: value || undefined });
          }}
          placeholder="https://yourwebsite.com"
          className="h-12 sm:h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your website helps customers learn more about you and improves your search visibility.
        </p>
      </div>
      <div>
        <Label htmlFor="years_in_business" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Years in Business
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional)</span>
        </Label>
        <select
          id="years_in_business"
          value={data.years_in_business || ""}
          onChange={(e) => {
            const value = e.target.value;
            updateData({ years_in_business: value ? parseInt(value) : undefined });
          }}
          className="w-full h-12 sm:h-14 px-4 text-base border border-gray-300 rounded-lg focus:border-primary focus:ring-primary bg-white"
        >
          <option value="">Select years...</option>
          <option value="0">Just starting (0 years)</option>
          <option value="1">1 year</option>
          <option value="2">2 years</option>
          <option value="3">3 years</option>
          <option value="4">4 years</option>
          <option value="5">5 years</option>
          <option value="6">6-10 years</option>
          <option value="11">11-15 years</option>
          <option value="16">16-20 years</option>
          <option value="21">20+ years</option>
        </select>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your experience helps build trust with customers.
        </p>
      </div>
      <div>
        <Label htmlFor="description" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Business Description
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">
            (Recommended: 50-500 characters)
          </span>
        </Label>
        <Textarea
          id="description"
          value={data.description || ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= 2000) {
              updateData({ description: value });
            }
          }}
          placeholder="Tell customers about your business, your expertise, what makes you unique, and what they can expect..."
          className="min-h-[120px] sm:min-h-[140px] text-base border-gray-300 focus:border-primary focus:ring-primary rounded-lg resize-none"
          maxLength={2000}
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-2">
          <p className="text-xs sm:text-sm text-gray-600">
            {data.description && data.description.length < 50 ? (
              <span className="text-amber-600 font-medium">
                Consider adding more details ({data.description.length}/50 minimum recommended)
              </span>
            ) : (
              <span>
                {data.description?.length || 0}/2000 characters
                {data.description && data.description.length >= 50 && (
                  <span className="text-green-600 ml-2 font-medium">✓ Good length</span>
                )}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              const templates = [
                "Welcome to [Business Name]! We specialize in [service type] with [X] years of experience. Our team is dedicated to providing exceptional service in a relaxing, professional environment. We use only premium products and stay up-to-date with the latest techniques and trends.",
                "At [Business Name], we believe beauty is an art form. Our skilled professionals are passionate about helping you look and feel your best. From [service 1] to [service 2], we offer a full range of services tailored to your unique needs.",
                "[Business Name] is your trusted partner for all your beauty and wellness needs. Located in [location], we've been serving the community since [year]. Our commitment to excellence and customer satisfaction sets us apart.",
              ];
              const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
              updateData({ description: randomTemplate });
            }}
            className="text-xs sm:text-sm text-primary hover:text-primary-hover font-medium hover:underline transition-colors"
          >
            Use template
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="previous_software" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Previous Salon Software <span className="text-gray-500 font-normal">(Optional)</span>
        </Label>
        {isLoadingSoftwareOptions ? (
          <div className="h-12 sm:h-14 border border-gray-300 rounded-lg flex items-center justify-center">
            <p className="text-sm text-gray-500">Loading options...</p>
          </div>
        ) : (
          <>
            <ChipCombobox
              singleSelect
              value={
                data.previous_software === "other" && data.previous_software_other
                  ? data.previous_software_other
                  : data.previous_software || null
              }
              onChange={(v) => {
                if (!v) {
                  updateData({ previous_software: undefined, previous_software_other: undefined });
                  return;
                }
                const known = new Set(["none", "other", ...previousSoftwareOptions.map((o) => o.slug)]);
                if (known.has(v)) {
                  updateData({
                    previous_software: v,
                    previous_software_other: v === "other" ? data.previous_software_other : undefined,
                  });
                } else {
                  updateData({ previous_software: "other", previous_software_other: v });
                }
              }}
              staticSuggestions={[
                { value: "none", label: "None / First time using salon software" },
                ...previousSoftwareOptions.map((o) => ({ value: o.slug, label: o.name })),
                { value: "other", label: "Other" },
              ]}
              allowFreeForm
              placeholder="Select or type software..."
              aria-label="Previous salon software"
            />
            {data.previous_software === "other" && !data.previous_software_other && (
              <Input
                id="previous_software_other"
                value={data.previous_software_other || ""}
                onChange={(e) => updateData({ previous_software_other: e.target.value })}
                placeholder="Enter the name of the software"
                className="mt-3 h-12 sm:h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
              />
            )}
          </>
        )}
        <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
          Help us understand where providers are coming from. This information is only visible to administrators.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
        <div>
          <Label htmlFor="phone" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            Phone <span className="text-primary">*</span>
          </Label>
          <PhoneInput
            inputId="provider-onboarding-legacy-business-phone"
            label=""
            value={data.phone || ""}
            onChange={(e164) => updateData({ phone: e164 })}
            placeholder="Phone number"
            required
          />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
            Email <span className="text-primary">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ""}
            onChange={(e) => updateData({ email: e.target.value })}
            placeholder="business@example.com"
            className="h-12 sm:h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="languages_spoken" className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Languages You Speak
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-2">
          Select or type the languages you can communicate in with clients. At least one language is required.
        </p>
        <ChipCombobox
          singleSelect={false}
          value={data.languages_spoken?.length ? data.languages_spoken : ["English"]}
          onChange={(next) => updateData({ languages_spoken: next.length ? next : ["English"] })}
          staticSuggestions={[
            "English", "Afrikaans", "Zulu", "Xhosa", "Sesotho", "Tswana", "Venda", "Tsonga", "Swati", "Ndebele", "Southern Sotho", "Northern Sotho",
          ].map((l) => ({ value: l, label: l }))}
          allowFreeForm
          placeholder="Add language..."
          aria-label="Languages you speak"
        />
      </div>
    </div>
  );
}

// Step 2: Identity - Name, Email, Phone with Verification
function Step2Identity({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  /** E.164 used with `updateUser({ phone })` — must match `verifyOtp` phone. */
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    const ownerE164 = coerceOwnerPhoneToE164ForForm(data.owner_phone);
    if (!ownerE164) {
      toast.error("Please enter a valid phone number first");
      return;
    }

    const normalized = normalizeSupabaseAuthPhone(ownerE164);
    try {
      setIsSendingCode(true);
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;

      setPendingPhoneE164(normalized);
      setVerificationCode("");
      setCodeSent(true);
      setCountdown(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS);
      toast.success("Verification code sent to your phone.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send verification code.";
      toast.error(msg);
      console.error("Error sending code:", error);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? verificationCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      toast.error(`Please enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS.`);
      return;
    }

    try {
      setIsVerifying(true);
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(pendingPhoneE164);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "phone_change",
      });
      if (verifyError) throw verifyError;

      await fetcher.patch("/api/me/profile", {
        phone,
        phone_verified: true,
      });

      updateData({ phone_verified: true, owner_phone: phone });
      toast.success("Phone number verified!");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Verification failed. Please try again.";
      toast.error(msg);
      console.error("Error verifying code:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
            <CircleUser className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h4 className="mb-2 text-base font-semibold text-sky-950 sm:text-lg">Owner and contact details</h4>
            <p className="text-sm leading-relaxed text-sky-950/90">
              We use this for verification and to reach you about bookings and payouts. If you signed up with name,
              email, or phone already, those values should appear below — you can change them anytime.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <Label htmlFor="owner_name" className="mb-2 block text-base font-semibold text-slate-900">
            Your Name <span className="text-primary">*</span>
          </Label>
          <Input
            id="owner_name"
            value={data.owner_name || ""}
            onChange={(e) => updateData({ owner_name: e.target.value })}
            placeholder="Enter your full name"
            className="h-14 rounded-2xl border-slate-300 text-base focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            required
          />
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="owner_email" className="mb-2 block text-base font-semibold text-slate-900">
            Email Address <span className="text-primary">*</span>
          </Label>
          <Input
            id="owner_email"
            type="email"
            value={data.owner_email || ""}
            onChange={(e) => updateData({ owner_email: e.target.value })}
            placeholder="your.email@example.com"
            className="h-14 rounded-2xl border-slate-300 text-base focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            required
          />
        </div>

        {/* Phone with Verification */}
        <div>
          <Label htmlFor="owner_phone" className="mb-2 block text-base font-semibold text-slate-900">
            Mobile Number <span className="text-primary">*</span>
          </Label>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 w-full lg:flex-1">
              <PhoneInput
                inputId="provider-onboarding-owner-phone"
                label=""
                value={data.owner_phone || ""}
                onChange={(e164) => {
                  updateData({ owner_phone: e164, phone_verified: false });
                  setCodeSent(false);
                  setVerificationCode("");
                  setPendingPhoneE164("");
                }}
                placeholder="Phone number"
                required
              />
            </div>
            <Button
              type="button"
              onClick={handleSendCode}
              disabled={!isValidOwnerPhoneE164(data.owner_phone) || isSendingCode || countdown > 0}
              className="h-14 w-full shrink-0 rounded-2xl bg-primary px-6 text-white hover:bg-primary-hover disabled:opacity-50 lg:w-auto"
            >
              {isSendingCode ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : countdown > 0 ? (
                `Resend (${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')})`
              ) : (
                "Send Code"
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            We’ll SMS a {SUPABASE_AUTH_OTP_LENGTH}-digit code (valid for about{" "}
            {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
            {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}). For South Africa, enter the local number only
            (omit +27)—for example <span className="whitespace-nowrap">82 123 4567</span> or{" "}
            <span className="whitespace-nowrap">082 123 4567</span>—as shown under the field. Standard carrier rates may apply.
          </p>

          {/* Verification Code Input */}
          {codeSent && (
            <div className="mt-4 space-y-3">
              <Label
                htmlFor="provider-onboarding-verify-otp-0"
                className="mb-2 block text-base font-semibold text-slate-900"
              >
                Enter Verification Code <span className="text-primary">*</span>
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <OtpDigitInput
                  id="provider-onboarding-verify-otp"
                  length={SUPABASE_AUTH_OTP_LENGTH}
                  label="Phone verification code"
                  value={verificationCode}
                  onChange={setVerificationCode}
                  onComplete={(code) => {
                    if (!isVerifying && !data.phone_verified) void handleVerifyCode(code);
                  }}
                  disabled={isVerifying || Boolean(data.phone_verified)}
                  autoFocus
                  className="min-w-0 flex-1 [&>div:last-child]:!justify-start"
                />
                <Button
                  type="button"
                  onClick={() => void handleVerifyCode()}
                  disabled={!isCompleteSupabaseSmsOtp(verificationCode) || isVerifying || data.phone_verified}
                  className="h-14 shrink-0 rounded-2xl bg-primary px-6 text-white hover:bg-primary-hover disabled:opacity-50 sm:h-14"
                >
                  {isVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : data.phone_verified ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              {data.phone_verified && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  Phone number verified
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 8: Photos - Thumbnail and Gallery
function Step8Photos({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(data.thumbnail_url || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(data.avatar_url || null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>(data.gallery || []);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error("Invalid file type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setThumbnailPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
      toast.error("Invalid file type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setAvatarPreview(dataUrl);
      updateData({ avatar_url: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (!validateFileType(file, IMAGE_CONSTRAINTS.allowedTypes)) {
        toast.error(`${file.name}: Invalid file type`);
        continue;
      }
      if (!validateFileSize(file, IMAGE_CONSTRAINTS.maxSizeBytes)) {
        toast.error(`${file.name}: File too large (max 5MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setGalleryFiles([...galleryFiles, ...validFiles]);
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGalleryPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeGalleryImage = (index: number) => {
    const newPreviews = galleryPreviews.filter((_, i) => i !== index);
    const newFiles = galleryFiles.filter((_, i) => i !== index);
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
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 p-5 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
            <ImageIcon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h4 className="mb-2 text-base font-semibold text-violet-950 sm:text-lg">Why photos matter</h4>
            {data.business_type === "mobile" ? (
              <div className="space-y-2 text-sm leading-relaxed text-violet-950/90">
                <p>
                  <strong className="text-violet-950">Your photo:</strong> A clear, professional photo of you helps
                  clients trust you before they book.
                </p>
                <p>
                  <strong className="text-violet-950">Gallery:</strong> Show finished work and before/after shots so
                  customers see your quality.
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed text-violet-950/90">
                <p>
                  <strong className="text-violet-950">Salon or owner photo:</strong> Real spaces and faces outperform
                  generic logos in search and profile views.
                </p>
                <p>
                  <strong className="text-violet-950">Gallery:</strong> Portfolio images build confidence in your
                  services.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Upload */}
      <div>
        <Label className="mb-2 block text-sm font-semibold text-slate-900 sm:text-base">
          {data.business_type === "mobile" ? "Your Photo" : "Salon Photo or Owner Photo"}
          <span className="ml-2 text-xs font-normal text-slate-600 sm:text-sm">(Recommended)</span>
        </Label>
        <p className="mb-3 text-xs leading-relaxed text-slate-700 sm:text-sm">
          {data.business_type === "mobile" ? (
            <>
              <strong>For freelancers:</strong> Upload a professional photo of yourself. People are more likely to click on a human face than a logo. 
              This helps build trust and personal connection with clients. Use a square image (recommended: 800x800px or larger).
            </>
          ) : (
            <>
              <strong>For salons:</strong> Upload a photo of your salon interior/exterior or a professional photo of yourself as the owner. 
              People are more likely to click on real photos than logos. This helps build trust and shows your space or team. 
              Use a square image (recommended: 800x800px or larger).
            </>
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {thumbnailPreview ? (
            <div className="relative h-48 w-full overflow-hidden rounded-2xl border-2 border-slate-200 sm:w-48">
              <Image
                src={thumbnailPreview}
                alt="Thumbnail preview"
                fill
                className="object-cover"
              />
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
                <p className="text-xs text-slate-600">No thumbnail</p>
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
            />
            <Label
              htmlFor="thumbnail-upload"
              className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              {thumbnailPreview ? "Change Thumbnail" : "Upload Thumbnail"}
            </Label>
            {thumbnailFile && (
              <p className="text-xs text-gray-600 mt-2">
                {thumbnailFile.name} ({(thumbnailFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Profile circle (optional) - business face on listing cards */}
      <div>
        <Label className="text-sm sm:text-base font-semibold text-gray-900 mb-2 block">
          Profile circle (business face)
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          This image appears in the small circle on your listing card. A clear headshot or logo helps clients recognize you. You can skip and set it later in Settings → Gallery.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {avatarPreview ? (
            <div className="relative w-24 h-24 rounded-full border-2 border-indigo-200 overflow-hidden flex-shrink-0">
              <Image src={avatarPreview} alt="Profile circle" fill className="object-cover" unoptimized />
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
            />
            <Label
              htmlFor="avatar-upload"
              className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors text-indigo-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              {avatarPreview ? "Change profile image" : "Upload profile image"}
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
          Portfolio / Work Gallery
          <span className="text-gray-500 font-normal text-xs sm:text-sm ml-2">(Optional but recommended)</span>
        </Label>
        <p className="text-xs sm:text-sm text-gray-600 mb-3">
          <strong>Showcase your work:</strong> Upload photos of your completed work, before/after transformations, or examples of your services. 
          This is your portfolio that helps clients see the quality of your work. You can add up to 10 images. Minimum 3 recommended for best results.
        </p>
        <Input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleGallerySelect}
          className="hidden"
          id="gallery-upload"
        />
        <Label
          htmlFor="gallery-upload"
          className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mb-4"
        >
              <Upload className="w-4 h-4 mr-2" />
          Add Portfolio Images
        </Label>

        {galleryPreviews.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
            {galleryPreviews.map((preview, index) => (
              <div key={index} className="relative aspect-square border-2 border-gray-200 rounded-lg overflow-hidden">
                <Image
                  src={preview}
                  alt={`Gallery image ${index + 1}`}
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

        {galleryFiles.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              {galleryFiles.length} image{galleryFiles.length !== 1 ? "s" : ""} ready to upload after onboarding
            </p>
          </div>
        )}
      </div>

      {(!thumbnailPreview && galleryPreviews.length === 0) && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            <strong>Tip:</strong> Providers with photos get 3x more views! Your portfolio gallery helps clients see your work quality. 
            You can skip this step and add photos later, but we recommend adding at least a thumbnail now to improve your visibility in search results.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const STEP3_LANGUAGE_SUGGESTIONS = [
  "English",
  "Afrikaans",
  "French",
  "Portuguese",
  "Swahili",
  "Zulu",
  "Xhosa",
  "Sesotho",
  "Tswana",
  "Venda",
  "Tsonga",
  "Swati",
  "Ndebele",
  "Southern Sotho",
  "Northern Sotho",
].map((l) => ({ value: l, label: l }));

function hasAnySocialLink(links: OnboardingData["social_media_links"] | undefined): boolean {
  if (!links) return false;
  return Boolean(
    links.facebook?.trim() ||
      links.instagram?.trim() ||
      links.twitter?.trim() ||
      links.linkedin?.trim(),
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
    "rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/35";
  const inputClass =
    "h-12 sm:h-14 text-base border-slate-200 bg-white rounded-xl focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15";
  const helper = "text-sm text-slate-700 leading-relaxed";
  const helperMuted = "text-sm text-slate-600 leading-relaxed";

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <p className={`${helper} font-medium text-slate-800`}>
              <span className="mr-1.5" aria-hidden>
                💡
              </span>
              Complete profiles build trust: add a clear description, the languages you speak, and optionally turn on a
              website or social links below.
            </p>
            {data.team_size === "freelancer" && (
              <p className={helperMuted}>
                <span className="font-semibold text-slate-800">Freelancer?</span> Mobile, studio, or both is set in a later
                step—here, focus on how you want your brand to read on your public profile.
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <Label htmlFor="business_name" className="text-base font-semibold text-slate-900">
          Business Name <span className="text-primary">*</span>
        </Label>
        <p className={helperMuted}>This is how customers will see your business on the platform.</p>
        <Input
          id="business_name"
          value={data.business_name || ""}
          onChange={(e) => updateData({ business_name: e.target.value })}
          placeholder="e.g. Studio Huumphrey"
          className={`${inputClass} mt-1`}
          required
        />
      </section>

      <section className="space-y-2">
        <Label htmlFor="description" className="text-base font-semibold text-slate-900">
          Business Description <span className="text-slate-600 font-normal text-sm">(Recommended)</span>
        </Label>
        <p className={helperMuted}>
          Describe your services, style, and what makes you special—this appears on your public profile.
        </p>
        <Textarea
          id="description"
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
          placeholder="Tell customers about your business, your expertise, and what makes you unique..."
          className={`min-h-[132px] text-base border-slate-200 bg-white rounded-xl resize-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 mt-1`}
          maxLength={2000}
        />
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm tabular-nums text-slate-700">
            {(data.description?.length || 0)}/2000 characters
          </p>
          {data.description != null && data.description.length > 0 && data.description.length < 50 && (
            <p className="text-sm font-medium text-amber-800">
              Consider adding more detail—we recommend at least 50 characters for a stronger profile.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="years_in_business" className="text-base font-semibold text-slate-900">
          Years in Business <span className="text-slate-600 font-normal text-sm">(Optional)</span>
        </Label>
        <p className={helperMuted}>Your experience helps build trust with customers.</p>
        <select
          id="years_in_business"
          value={data.years_in_business ?? ""}
          onChange={(e) => updateData({ years_in_business: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          className={`mt-1 w-full ${inputClass} px-4`}
        >
          <option value="">Select years…</option>
          <option value="0">Just starting (0 years)</option>
          <option value="1">1 year</option>
          <option value="2">2 years</option>
          <option value="3">3 years</option>
          <option value="4">4 years</option>
          <option value="5">5 years</option>
          <option value="6">6–10 years</option>
          <option value="11">11–15 years</option>
          <option value="16">16–20 years</option>
          <option value="21">20+ years</option>
        </select>
      </section>

      <section className="space-y-2">
        <Label htmlFor="languages_spoken" className="text-base font-semibold text-slate-900">
          Languages you speak <span className="text-slate-600 font-normal text-sm">(Optional but recommended)</span>
        </Label>
        <p className={helper}>
          Select or type every language you&apos;re comfortable using with clients. At least one language is required—we
          default to English until you add more.
        </p>
        <div className="mt-2">
          <ChipCombobox
            singleSelect={false}
            value={data.languages_spoken?.length ? data.languages_spoken : ["English"]}
            onChange={(next) => updateData({ languages_spoken: next.length ? next : ["English"] })}
            staticSuggestions={STEP3_LANGUAGE_SUGGESTIONS}
            allowFreeForm
            placeholder="Add language…"
            aria-label="Languages you speak"
          />
        </div>
      </section>

      {/* Website — collapsible */}
      <section className={`${fieldShell} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Globe className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <div>
              <p className="text-base font-semibold text-slate-900">Website URL</p>
              <p className={`${helperMuted} mt-0.5`}>Optional — helps customers learn more and can help discovery.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span id="onboarding-website-toggle-label" className="text-sm font-medium text-slate-800">
              Add website
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
              Website URL
            </Label>
            <p className={helperMuted}>Paste your full link; we&apos;ll add https:// if you omit it.</p>
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
              placeholder="https://yourwebsite.com"
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
              <p className="text-base font-semibold text-slate-900">Social media links</p>
              <p className={`${helperMuted} mt-0.5`}>
                Optional but recommended — helps clients find and follow you.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span id="onboarding-social-toggle-label" className="text-sm font-medium text-slate-800">
              Add profiles
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
                Facebook
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
                placeholder="https://facebook.com/yourpage"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instagram" className="text-sm font-semibold text-slate-800">
                Instagram
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
                placeholder="https://instagram.com/yourprofile"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twitter" className="text-sm font-semibold text-slate-800">
                X
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
                placeholder="https://x.com/yourhandle"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedin" className="text-sm font-semibold text-slate-800">
                LinkedIn
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
                placeholder="https://linkedin.com/in/yourprofile"
                className={inputClass}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// Step 4: Payment Setup - Yoco Machine
function Step4PaymentSetup({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const options = [
    { id: "yes", title: "Yes, I do", description: "I have a Yoco card machine" },
    { id: "no", title: "No (but I want one)", description: "I'd like to get a Yoco machine" },
    { id: "other", title: "Other", description: "I have another card machine" },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 text-center shadow-sm sm:rounded-3xl sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">Payment setup</h3>
        <p className="mt-2 text-base text-slate-700">Do you have a Yoco card machine?</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Yoco is widely used in South Africa. Whatever you choose here, you can connect payouts and terminals after
          onboarding.
        </p>
      </div>

      <div className="space-y-4">
        {options.map((option) => {
          const isSelected = data.yoco_machine === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateData({ yoco_machine: option.id as any })}
              className={`w-full rounded-2xl border-2 p-5 text-left shadow-sm transition-all duration-200 sm:rounded-3xl sm:p-6 ${
                isSelected
                  ? "border-primary bg-primary/[0.06] shadow-md ring-2 ring-primary/15"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="mb-1 text-lg font-semibold text-slate-900">{option.title}</h3>
                  <p className="text-sm text-slate-600">{option.description}</p>
                </div>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-primary bg-primary" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-4 w-4 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.yoco_machine === "other" && (
        <div className="mt-4">
          <Label htmlFor="yoco_machine_other" className="text-base font-semibold text-gray-900 mb-2 block">
            What card machine do you have?
          </Label>
          <Input
            id="yoco_machine_other"
            value={data.yoco_machine_other || ""}
            onChange={(e) => updateData({ yoco_machine_other: e.target.value })}
            placeholder="e.g., iZettle, Square, etc."
            className="h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-xl"
          />
        </div>
      )}

      {/* VAT Registration */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            VAT Registration
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Are you VAT registered with SARS? VAT registration is mandatory if your annual turnover is R1 million or more.
            If you make less than R1 million per year, you don't need to be VAT registered.
          </p>
        </div>
        
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              updateData({ 
                is_vat_registered: true,
                vat_number: data.vat_number || ""
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left ${
              data.is_vat_registered === true
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Yes, I am VAT registered</h4>
                <p className="text-sm text-gray-600">I have a SARS VAT number</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                data.is_vat_registered === true
                  ? "border-primary bg-primary"
                  : "border-gray-300"
              }`}>
                {data.is_vat_registered === true && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              updateData({ 
                is_vat_registered: false,
                vat_number: undefined
              });
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left ${
              data.is_vat_registered === false
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">No, I'm not VAT registered</h4>
                <p className="text-sm text-gray-600">My annual turnover is less than R1 million</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                data.is_vat_registered === false
                  ? "border-primary bg-primary"
                  : "border-gray-300"
              }`}>
                {data.is_vat_registered === false && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </button>
        </div>

        {data.is_vat_registered === true && (
          <div className="mt-4">
            <Label htmlFor="vat_number" className="text-base font-semibold text-gray-900 mb-2 block">
              VAT Number (SARS) <span className="text-primary">*</span>
            </Label>
            <Input
              id="vat_number"
              type="text"
              placeholder="4123456789"
              value={data.vat_number || ""}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, '');
                if (value.length <= 10) {
                  updateData({ vat_number: value });
                }
              }}
              maxLength={10}
              required
              className="h-14 text-base border-gray-300 focus:border-primary focus:ring-primary rounded-xl"
            />
            <p className="text-xs text-gray-600 mt-2">
              Your 10-digit SARS VAT registration number (must start with 4)
            </p>
            {data.vat_number && data.vat_number.length === 10 && !data.vat_number.startsWith('4') && (
              <p className="text-xs text-red-600 mt-1">
                South African VAT numbers must start with 4
              </p>
            )}
          </div>
        )}

        {data.is_vat_registered === false && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <strong>Not VAT Registered:</strong> No tax will be collected from customers. This is suitable for small businesses making less than R1 million per year.
            </p>
          </div>
        )}
      </div>

      {/* Payout Setup */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Payout Setup:</strong> To receive payments from bookings, you'll need to add your bank account details. 
            You can complete this now or set it up later in Settings.
          </p>
        </div>
        <div className="flex items-center justify-between p-4 bg-white border-2 border-gray-200 rounded-xl">
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Bank Account for Payouts
            </h3>
            <p className="text-sm text-gray-600">
              Add your bank details to receive payments
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Open payout setup in a new tab or modal
              // For now, mark as "will set up later"
              updateData({ payout_setup_complete: false });
              toast.info("You can set up your payout account after onboarding in Settings → Payout Accounts");
            }}
            className="border-primary text-primary hover:bg-primary/5"
          >
            Set Up Later
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          You can complete payout setup after onboarding. Payments will be held until your bank account is verified.
        </p>
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
  const [softwareOptions, setSoftwareOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{ id: string; name: string; slug: string }> }>("/api/public/previous-software-options");
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
      { value: "none", label: "No, I'm new to salon software" },
      ...softwareOptions.map((opt) => ({ value: opt.slug, label: opt.name })),
      { value: "other", label: "Other" },
    ],
    [softwareOptions]
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Current Software
        </h3>
        <p className="text-base text-gray-600 mb-2">
          Are you moving from another system?
        </p>
        <p className="text-sm text-gray-500">
          Select from the list or type your current software. This helps us provide better migration support.
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
            placeholder="Select or type software name..."
            aria-label="Previous salon software"
          />
          {data.previous_software === "other" && !data.previous_software_other && (
            <div className="mt-2">
              <Label htmlFor="previous_software_other" className="text-base font-semibold text-gray-900 mb-2 block">
                What software were you using?
              </Label>
              <Input
                id="previous_software_other"
                value={data.previous_software_other || ""}
                onChange={(e) => updateData({ previous_software_other: e.target.value })}
                placeholder="Enter software name"
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
  const options = [
    { id: "commission", title: "Commission", description: "Staff earn a percentage of sales" },
    { id: "hourly", title: "Hourly", description: "Staff are paid by the hour" },
    { id: "both", title: "Both", description: "Mix of commission and hourly" },
    { id: "other", title: "Other", description: "Different payment structure" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Payroll Structure
        </h3>
        <p className="text-base text-gray-600 mb-2">
          How do you pay your staff/yourself?
        </p>
        <p className="text-sm text-gray-500">
          This information helps us understand your business model (for analytics only)
        </p>
      </div>

      <div className="space-y-4">
        {options.map((option) => {
          const isSelected = data.payroll_type === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => updateData({ payroll_type: option.id as any })}
              className={`w-full p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {option.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {option.description}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isSelected
                    ? "border-primary bg-primary"
                    : "border-gray-300"
                }`}>
                  {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.payroll_type === "other" && (
        <div className="mt-4">
          <Label htmlFor="payroll_details" className="text-base font-semibold text-gray-900 mb-2 block">
            Please describe your payroll structure
          </Label>
          <Textarea
            id="payroll_details"
            value={data.payroll_details || ""}
            onChange={(e) => updateData({ payroll_details: e.target.value })}
            placeholder="Describe how you pay your staff..."
            className="min-h-[100px] text-base border-gray-300 focus:border-primary focus:ring-primary rounded-xl resize-none"
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
  const isMobileOnly = data.business_type === "mobile";
  const isSalon = data.business_type === "salon";
  const isBoth = data.business_type === "both";
  const houseCallOrNoSalonNote =
    isMobileOnly || isBoth || data.team_size === "freelancer";

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
        const response = await fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/public/countries");
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
    [data.address, defaultCountryDisplay, updateData],
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
    [data.address, defaultCountryDisplay, updateData],
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
    [defaultCountryDisplay, handleAddressSelect],
  );

  const fieldClass =
    "h-12 sm:h-14 text-base rounded-xl border-slate-200 bg-white focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15";
  const helper = "text-sm text-slate-700 leading-relaxed";
  const helperMuted = "text-sm text-slate-600 leading-relaxed";

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-white/80 px-4 py-4 sm:rounded-t-3xl sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MapPin className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <h4 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Business location</h4>
              {isMobileOnly ? (
                <p className={helper}>
                  Enter your <strong className="font-semibold text-slate-900">base address</strong> (often your home).
                  We use it for travel distance and fees only. Clients won&apos;t get a &quot;Visit salon&quot; option here
                  until you add a salon-style location in Settings.
                </p>
              ) : isSalon ? (
                <p className={helper}>
                  Enter your <strong className="font-semibold text-slate-900">salon or studio</strong> where clients
                  can visit. We also use it for travel math when you offer house calls.
                </p>
              ) : (
                <p className={helper}>
                  Add the address that best represents where you operate from (studio or main base). You can refine
                  multiple locations later in Settings.
                </p>
              )}
              {houseCallOrNoSalonNote ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 sm:px-4">
                  <p className={`${helperMuted} text-sm`}>
                    <span className="font-semibold text-slate-800">House calls or no shop yet?</span> Use the address
                    you travel from (e.g. home). Pick a Mapbox suggestion or drop a pin so we capture coordinates for
                    zones and fees—you can add a public salon listing later.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Label htmlFor="provider-onboarding-address" className="text-base font-semibold text-slate-900">
              Street address <span className="text-primary">*</span>
            </Label>
            <p className={`${helperMuted} mt-1 max-w-xl`}>
              Search powered by Mapbox. <strong className="font-medium text-slate-800">Choose a suggestion</strong> so
              city, area, postal code, and GPS coordinates stay in sync for service zones.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 rounded-xl border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
            onClick={() => setMapPickerOpen(true)}
          >
            <MapPinned className="h-4 w-4" aria-hidden />
            Drop pin on map
          </Button>
        </div>

        <div className="mt-3">
          <AddressAutocomplete
            inputId="provider-onboarding-address"
            value={data.address?.line1 || ""}
            onChange={handleAddressSelect}
            onInputChange={onAddressLineTyping}
            placeholder="Start typing (e.g. 12 Forest Drive, Sandton)"
            country={mapboxCountryIso}
            defaultCountryName={defaultCountryDisplay}
            proximity={proximity}
            inputClassName={cn(fieldClass, "h-12 sm:h-14 pl-10")}
            required
          />
        </div>

        {hasValidCoords ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-800">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-3.5 w-3.5" aria-hidden />
            </span>
            Map coordinates saved — zones and distance can use this point (
            {data.address!.latitude!.toFixed(5)}, {data.address!.longitude!.toFixed(5)}).
          </p>
        ) : (
          <p className={`${helperMuted} mt-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-amber-950`}>
            No GPS yet — select a suggestion or use <strong className="font-semibold">Drop pin on map</strong> so the
            next step can suggest service zones.
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

      <section className="space-y-2">
        <Label htmlFor="address_line2" className="text-base font-semibold text-slate-900">
          Apartment, suite, etc. <span className="text-slate-600 text-sm font-normal">(Optional)</span>
        </Label>
        <p className={helperMuted}>Unit or floor — helps couriers and clients find you.</p>
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
          placeholder="Apt 4B, Suite 200, etc."
          className={fieldClass}
        />
      </section>

      <section className="space-y-2">
        <Label htmlFor="city" className="text-base font-semibold text-slate-900">
          City <span className="text-primary">*</span>
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
          placeholder="e.g. Cape Town"
          className={fieldClass}
          required
        />
        {data.address?.city ? (
          <p className="text-sm font-medium text-emerald-800">Filled from Mapbox — you can edit if needed.</p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <section className="space-y-2">
          <Label htmlFor="state" className="text-base font-semibold text-slate-900">
            State / province <span className="text-slate-600 text-sm font-normal">(Optional)</span>
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
            placeholder="Province or state"
            className={fieldClass}
          />
        </section>
        <section className="space-y-2">
          <Label htmlFor="postal_code" className="text-base font-semibold text-slate-900">
            Postal code <span className="text-slate-600 text-sm font-normal">(Optional)</span>
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
            placeholder="Postal code"
            className={fieldClass}
          />
        </section>
      </div>

      <section className="space-y-2">
        <Label htmlFor="country" className="text-base font-semibold text-slate-900">
          Country <span className="text-primary">*</span>
        </Label>
        <p className={helperMuted}>Used to bias search results — change before typing if you operate outside South Africa.</p>
        {isLoadingCountries ? (
          <div className={cn(fieldClass, "flex items-center justify-center border border-slate-200")}>
            <p className="text-sm text-slate-600">Loading countries…</p>
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

function Step9ServiceZones({
  data,
  updateData,
}: {
  data: Partial<OnboardingData>;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [suggestedZones, setSuggestedZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>(data.selected_zone_ids || []);

  useEffect(() => {
    const loadZones = async () => {
      if (!data.address?.latitude || !data.address?.longitude) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // Call onboarding-specific suggest endpoint
        const response = await fetcher.post<{ data: { suggested_zones: any[] } }>("/api/provider/onboarding/suggest-zones", {
          address: data.address?.line1 || "",
          latitude: data.address?.latitude,
          longitude: data.address?.longitude,
          city: data.address?.city || "",
          postal_code: data.address?.postal_code || "",
          country: data.address?.country || "",
        });
        const zones = response.data?.suggested_zones || [];
        setSuggestedZones(zones);
        
        // Auto-select all suggested zones
        if (zones.length > 0) {
          const autoSelected = zones.map((z: any) => z.id);
          setSelectedZoneIds(autoSelected);
          updateData({ selected_zone_ids: autoSelected });
          toast.success(`Auto-selected ${autoSelected.length} zone${autoSelected.length !== 1 ? 's' : ''} matching your location`);
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
      ? selectedZoneIds.filter(id => id !== zoneId)
      : [...selectedZoneIds, zoneId];
    setSelectedZoneIds(newSelection);
    updateData({ selected_zone_ids: newSelection });
  };

  const selectAll = () => {
    const allIds = suggestedZones.map(z => z.id);
    setSelectedZoneIds(allIds);
    updateData({ selected_zone_ids: allIds });
    toast.success(`Selected all ${allIds.length} zones`);
  };

  const deselectAll = () => {
    setSelectedZoneIds([]);
    updateData({ selected_zone_ids: [] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-8 py-10 text-center shadow-sm sm:rounded-3xl">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-slate-800">Finding service zones for your location…</p>
        </div>
      </div>
    );
  }

  if (!data.address?.latitude || !data.address?.longitude) {
    return (
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Please complete the location step first. We need your address coordinates to find matching service zones.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <Alert className="rounded-2xl border-sky-200 bg-sky-50 sm:rounded-3xl">
        <AlertCircle className="h-4 w-4 text-sky-700" />
        <AlertDescription className="text-sm leading-relaxed text-sky-950">
          <strong className="text-sky-950">Service zones</strong> define where you offer at-home services. We&apos;ve
          suggested zones near your address. You can adjust this now or finish later in Settings.
        </AlertDescription>
      </Alert>

      {suggestedZones.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-amber-950">
            No zones matched this address yet. You can add service zones later under Settings → Service Zones.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-3xl sm:p-5">
            <p className="text-sm text-slate-800">
              Found <strong className="font-semibold text-slate-900">{suggestedZones.length}</strong> zone
              {suggestedZones.length !== 1 ? "s" : ""} near you
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={selectAll}>
                Select all
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={deselectAll}>
                Deselect all
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
                className={`cursor-pointer rounded-2xl border-2 p-4 transition-all sm:rounded-3xl sm:p-5 ${
                  selectedZoneIds.includes(zone.id)
                    ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/15"
                    : "border-slate-200 bg-white hover:border-slate-300"
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
                        aria-label={`Select ${zone.name}`}
                      />
                      <h3 className="text-lg font-semibold text-slate-900">{zone.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {zone.zone_type === "postal_code"
                          ? "Postal code"
                          : zone.zone_type === "city"
                            ? "City"
                            : zone.zone_type === "radius"
                              ? "Radius"
                              : "Polygon"}
                      </span>
                    </div>
                    <p className="mb-1 text-sm font-medium text-sky-800">{zone.match_reason}</p>
                    <p className="text-xs text-slate-600">Travel fees per zone can be customized after onboarding.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedZoneIds.length > 0 && (
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:rounded-3xl sm:p-5">
              <p className="text-sm font-medium text-slate-900">
                <span className="text-primary">{selectedZoneIds.length}</span> zone
                {selectedZoneIds.length !== 1 ? "s" : ""} selected — set travel fees anytime after signup.
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
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Auto-select common categories for freelancers
  useEffect(() => {
    if (data.business_type === "mobile" && globalCategories.length > 0 && (!data.global_category_ids || data.global_category_ids.length === 0)) {
      // Suggest common categories for mobile services
      const commonCategories = globalCategories
        .filter(cat => {
          const slug = cat.slug?.toLowerCase() || cat.name?.toLowerCase() || "";
          return slug.includes("hair") || slug.includes("massage") || slug.includes("nails") || slug.includes("barber");
        })
        .slice(0, 2)
        .map(cat => cat.id);
      
      if (commonCategories.length > 0) {
        updateData({ global_category_ids: commonCategories });
        toast.info(`We've pre-selected ${commonCategories.length} common categories. You can change them!`, { duration: 3000 });
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
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load categories";
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
          <p className="text-sm font-medium text-slate-800">Loading categories…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm sm:rounded-3xl">
        <p className="text-sm font-medium text-red-950">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="mt-4 rounded-xl">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <Alert className="rounded-2xl border-indigo-200 bg-indigo-50 sm:rounded-3xl">
        <Sparkles className="h-4 w-4 text-indigo-700" />
        <AlertDescription className="text-sm leading-relaxed text-indigo-950">
          <strong className="text-indigo-950">Tip:</strong> Categories help clients discover you in search and filters.
          {(!data.services || data.services.length === 0) && (
            <span> If you skip services for now, we can draft simple services from the categories you pick.</span>
          )}
        </AlertDescription>
      </Alert>
      {globalCategories.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-amber-950">No categories available. Please contact support.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {globalCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.id)}
              className={`rounded-2xl border-2 p-4 text-left shadow-sm transition-all sm:rounded-3xl sm:p-5 ${
                data.global_category_ids?.includes(category.id)
                  ? "border-primary bg-primary/[0.07] ring-1 ring-primary/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="mb-2 flex items-center gap-3">
                <GlobalCategoryIcon
                  icon={category.icon || "Tag"}
                  size={28}
                  strokeWidth={1.75}
                  isActive={Boolean(data.global_category_ids?.includes(category.id))}
                  className={
                    data.global_category_ids?.includes(category.id) ? "text-primary" : "text-slate-600"
                  }
                />
                <span
                  className={`font-semibold ${
                    data.global_category_ids?.includes(category.id) ? "text-primary" : "text-slate-900"
                  }`}
                >
                  {category.name}
                </span>
              </div>
              {category.description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{category.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
      {data.global_category_ids && data.global_category_ids.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-slate-900">
            <span className="text-primary">{data.global_category_ids.length}</span>{" "}
            {data.global_category_ids.length === 1 ? "category" : "categories"} selected
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
      toast.error("Please fill in all required fields");
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
    toast.success(editingIndex !== null ? "Service updated" : "Service added");
  };

  const handleEditService = (index: number) => {
    setFormService(services[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
    toast.success("Service removed");
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Alert className="rounded-2xl border-slate-200 bg-slate-50 sm:rounded-3xl">
        <AlertCircle className="h-4 w-4 text-slate-700" />
        <AlertDescription className="text-sm leading-relaxed text-slate-800">
          Add the services you sell today with price and duration. Clients see these on your booking page; you can refine
          them anytime after onboarding.
        </AlertDescription>
      </Alert>

      {services.length > 0 && (
        <div className="space-y-4">
          {services.map((service, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900">{service.title}</h4>
                  {service.description && <p className="mt-1 text-sm text-slate-600">{service.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
                    <span>{service.duration_minutes} mins</span>
                    <span>{service.currency} {service.price}</span>
                    <span>
                      {service.supports_at_salon && "At Salon"}
                      {service.supports_at_salon && service.supports_at_home && " • "}
                      {service.supports_at_home && "At Home"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={ONBOARDING_SOFT_SECONDARY_BTN}
                    onClick={() => handleEditService(index)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`${ONBOARDING_SOFT_SECONDARY_BTN} hover:border-red-200 hover:bg-red-50 hover:text-red-800`}
                    onClick={() => handleDeleteService(index)}
                    aria-label="Remove service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {/* Addons Section */}
              {service.addons && service.addons.length > 0 && (
                <div className="space-y-2 border-l-2 border-primary/25 pl-4">
                  <p className="text-xs font-semibold text-slate-600">Add-ons</p>
                  {service.addons.map((addon, addonIndex) => (
                    <div key={addonIndex} className="flex items-center justify-between text-sm text-slate-700">
                      <span>{addon.name} {addon.duration_minutes ? `(+${addon.duration_minutes} mins)` : ""}</span>
                      <span className="font-medium">{addon.currency} {addon.price}</span>
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
            {editingIndex !== null ? "Edit service" : "Add service"}
          </h4>
          <div className="space-y-4">
            <div>
              <Label htmlFor="service_title">Service Name *</Label>
              <Input
                id="service_title"
                value={formService.title || ""}
                onChange={(e) => setFormService({ ...formService, title: e.target.value })}
                placeholder="e.g., Haircut, Manicure, Massage"
                required
              />
            </div>
            <div>
              <Label htmlFor="service_description">
                Description
                <span className="text-gray-500 font-normal text-xs ml-2">
                  (Recommended: 20-300 characters)
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
                placeholder="Describe what's included in this service, what customers can expect, and any special features..."
                rows={3}
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {formService.description && formService.description.length < 20 ? (
                    <span className="text-amber-600">
                      Consider adding more details ({formService.description.length}/20 minimum recommended)
                    </span>
                  ) : (
                    <span>
                      {formService.description?.length || 0}/500 characters
                      {formService.description && formService.description.length >= 20 && (
                        <span className="text-green-600 ml-2">✓ Good length</span>
                      )}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const templates = [
                      "Professional [service name] using premium products. Includes consultation, [key step 1], [key step 2], and styling. Perfect for [target audience].",
                      "Comprehensive [service name] tailored to your needs. Our expert team will [main action] using [technique/product]. Results last [duration].",
                      "Full [service name] experience. We begin with [step 1], followed by [step 2], and finish with [step 3]. Includes complimentary [extra].",
                    ];
                    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
                    setFormService({ ...formService, description: randomTemplate });
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Use template
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="service_duration">Duration (minutes) *</Label>
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
                <Label htmlFor="service_price">Price *</Label>
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
                <Label htmlFor="service_currency">Currency</Label>
                <select
                  id="service_currency"
                  value={formService.currency || tenantCurrency}
                  onChange={(e) =>
                    setFormService({ ...formService, currency: e.target.value })
                  }
                  className="w-full p-2 border rounded-md"
                >
                  <option value={LAST_RESORT_CURRENCY}>{currencySelectLabel(LAST_RESORT_CURRENCY)}</option>
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
                <span className="text-sm">Available at salon</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formService.supports_at_home || false}
                  onChange={(e) =>
                    setFormService({ ...formService, supports_at_home: e.target.checked })
                  }
                />
                <span className="text-sm">Available at home</span>
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
                {editingIndex !== null ? "Update" : "Add"} Service
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
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setShowAddForm(true)}
          variant="outline"
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Service
        </Button>
      )}

      {services.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No services added yet. You can add services later if you prefer.</p>
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
      toast.error("Addon name and price are required");
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
    toast.success(editingIndex !== null ? "Addon updated" : "Addon added");
  };

  const handleEditAddon = (index: number) => {
    setFormAddon(addons[index]);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDeleteAddon = (index: number) => {
    onAddonsChange(addons.filter((_, i) => i !== index));
    toast.success("Addon removed");
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Add-ons (Optional)</Label>
          <p className="text-xs text-gray-500 mt-1">
            Add optional extras customers can purchase with this service (e.g., "Hair Treatment", "Nail Art")
          </p>
        </div>
        {!showAddForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Add-on
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
                    <span>+{addon.duration_minutes} mins</span>
                  )}
                  <span>{addon.currency} {addon.price}</span>
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
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`${ONBOARDING_SOFT_SECONDARY_BTN} hover:border-red-200 hover:bg-red-50 hover:text-red-800`}
                  onClick={() => handleDeleteAddon(index)}
                  aria-label="Remove add-on"
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
            {editingIndex !== null ? "Edit Add-on" : "Add Add-on"}
          </h5>
          <div className="space-y-3">
            <div>
              <Label htmlFor="addon_name" className="text-xs">Name *</Label>
              <Input
                id="addon_name"
                value={formAddon.name || ""}
                onChange={(e) => setFormAddon({ ...formAddon, name: e.target.value })}
                placeholder="e.g., Hair Treatment, Nail Art"
                className="text-sm"
                required
              />
            </div>
            <div>
              <Label htmlFor="addon_description" className="text-xs">Description</Label>
              <Textarea
                id="addon_description"
                value={formAddon.description || ""}
                onChange={(e) => setFormAddon({ ...formAddon, description: e.target.value })}
                placeholder="Brief description of the add-on"
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="addon_price" className="text-xs">Price *</Label>
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
                <Label htmlFor="addon_currency" className="text-xs">Currency</Label>
                <select
                  id="addon_currency"
                  value={formAddon.currency || currency}
                  onChange={(e) =>
                    setFormAddon({ ...formAddon, currency: e.target.value })
                  }
                  className="w-full p-2 border rounded-md text-sm"
                >
                  <option value={LAST_RESORT_CURRENCY}>{currencySelectLabel(LAST_RESORT_CURRENCY)}</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <Label htmlFor="addon_duration" className="text-xs">Extra Time (mins)</Label>
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
                {editingIndex !== null ? "Update" : "Add"} Add-on
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
                Cancel
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
  const days = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
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
            ? "rounded-2xl border-emerald-200 bg-emerald-50 sm:rounded-3xl"
            : "rounded-2xl border-slate-200 bg-slate-50 sm:rounded-3xl"
        }
      >
        <AlertCircle className={`h-4 w-4 ${isFreelancer ? "text-emerald-700" : "text-slate-600"}`} />
        <AlertDescription
          className={`text-sm leading-relaxed ${isFreelancer ? "text-emerald-950" : "text-slate-800"}`}
        >
          {isFreelancer ? (
            <span>
              <strong className="text-emerald-950">Freelancer hours:</strong> We started you on broad weekday hours (8:00–20:00);
              tweak them to match how you actually work. You can change this anytime in Settings.
            </span>
          ) : (
            <span>
              <strong className="text-slate-900">Booking window:</strong> Clients only see slots inside these hours. Adjust
              now or later under Settings.
            </span>
          )}
        </AlertDescription>
      </Alert>
      {days.map((day) => {
        const dayHours = data.operating_hours?.[day.key as keyof typeof data.operating_hours];
        return (
          <div
            key={day.key}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:rounded-3xl sm:p-4"
          >
            <div className="w-full text-sm font-semibold text-slate-900 sm:w-28 sm:text-base">{day.label}</div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!dayHours?.closed}
                onChange={(e) => updateHours(day.key, "closed", !e.target.checked)}
              />
              <span className="text-sm">Open</span>
            </label>
            {!dayHours?.closed && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Input
                  type="time"
                  value={dayHours?.open || "09:00"}
                  onChange={(e) => updateHours(day.key, "open", e.target.value)}
                  className="w-full sm:w-32 text-sm sm:text-base"
                />
                <span className="text-sm sm:text-base">to</span>
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
  );
}

function Step13Review({ data }: { data: Partial<OnboardingData> }) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>Business information</h3>
        <div className={`${ONBOARDING_REVIEW_CARD} space-y-2`}>
          <p>
            <span className="font-semibold text-slate-900">Name:</span> {data.business_name}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Type:</span> {data.business_type}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Phone:</span> {data.phone}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Email:</span> {data.email}
          </p>
          {data.previous_software && (
            <p>
              <span className="font-semibold text-slate-900">Previous software:</span>{" "}
              {data.previous_software === "other"
                ? data.previous_software_other || "Other"
                : data.previous_software === "none"
                  ? "None / first time using salon software"
                  : data.previous_software.charAt(0).toUpperCase() + data.previous_software.slice(1).replace(/_/g, " ")}
            </p>
          )}
        </div>
      </div>
      {data.description && (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>Business description</h3>
          <div className={ONBOARDING_REVIEW_CARD}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{data.description}</p>
            <p className="mt-3 text-xs text-slate-600">
              {data.description.length} characters
              {data.description.length >= 50 && (
                <span className="ml-2 font-medium text-emerald-700">Good length</span>
              )}
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>Location</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          <p className="text-slate-800">
            {data.address?.line1}, {data.address?.city}, {data.address?.state} {data.address?.postal_code}
          </p>
          {data.address?.latitude && data.address?.longitude && (
            <p className="mt-2 text-xs text-slate-600">
              Coordinates: {data.address.latitude.toFixed(6)}, {data.address.longitude.toFixed(6)}
            </p>
          )}
        </div>
      </div>
      {(data.business_type === "mobile" || data.business_type === "both") &&
        data.selected_zone_ids &&
        data.selected_zone_ids.length > 0 && (
          <div>
            <h3 className={ONBOARDING_REVIEW_HEADING}>Service zones</h3>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:rounded-3xl sm:p-5">
              <p className="text-sm font-medium text-sky-950">
                <span className="font-semibold">{data.selected_zone_ids.length}</span> zone
                {data.selected_zone_ids.length !== 1 ? "s" : ""} selected for at-home services
              </p>
              <p className="mt-2 text-xs leading-relaxed text-sky-900">
                Travel fees start at platform defaults; you can customize after onboarding.
              </p>
            </div>
          </div>
        )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>Service categories</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          {data.global_category_ids && data.global_category_ids.length > 0 ? (
            <p className="text-slate-800">
              {data.global_category_ids.length} {data.global_category_ids.length === 1 ? "category" : "categories"}{" "}
              selected
            </p>
          ) : (
            <p className="text-slate-600">No categories selected</p>
          )}
        </div>
      </div>
      {(data.selected_plan_id || data.selected_plan_name) && (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>Subscription plan</h3>
          <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-4 sm:rounded-3xl sm:p-5">
            <p className="text-sm text-slate-900">
              {data.selected_plan_name ? (
                <span className="font-semibold">{data.selected_plan_name}</span>
              ) : (
                <span className="font-semibold">Plan selected</span>
              )}
              {data.selected_plan_id && !data.selected_plan_name && (
                <span className="ml-1 text-slate-600">(confirm on the next step)</span>
              )}
            </p>
          </div>
        </div>
      )}
      {data.services && data.services.length > 0 ? (
        <div>
          <h3 className={ONBOARDING_REVIEW_HEADING}>Services ({data.services.length})</h3>
          <div className={`${ONBOARDING_REVIEW_CARD} space-y-4`}>
            {data.services.map((service, index) => (
              <div key={index} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                <div className="text-sm">
                  <div className="mb-1 font-medium text-slate-900">
                    {service.title} — {service.duration_minutes} min — {service.currency} {service.price}
                  </div>
                  {service.description && (
                    <div className="mt-2 border-l-2 border-primary/30 pl-3">
                      <p className="text-xs italic text-slate-700">&ldquo;{service.description}&rdquo;</p>
                    </div>
                  )}
                  {service.addons && service.addons.length > 0 && (
                    <div className="mt-2 space-y-1 border-l-2 border-slate-200 pl-4">
                      {service.addons.map((addon, addonIndex) => (
                        <div key={addonIndex} className="text-xs text-slate-700">
                          + {addon.name} — {addon.currency} {addon.price}
                          {addon.duration_minutes && addon.duration_minutes > 0 && ` (+${addon.duration_minutes} min)`}
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
          <h3 className={ONBOARDING_REVIEW_HEADING}>Services</h3>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl sm:p-5">
            <p className="text-sm font-medium text-amber-950">
              <span className="font-semibold">Draft services:</span> We can create starter services from your categories
              after you submit. You can edit them anytime.
            </p>
          </div>
        </div>
      )}
      <div>
        <h3 className={ONBOARDING_REVIEW_HEADING}>Operating hours</h3>
        <div className={ONBOARDING_REVIEW_CARD}>
          {data.operating_hours && Object.keys(data.operating_hours).length > 0 ? (
            <div className="space-y-2 text-sm">
              {Object.entries(data.operating_hours).map(([day, hours]: [string, any]) => (
                <div key={day} className="flex justify-between gap-4 border-b border-slate-100 py-1 last:border-0">
                  <span className="capitalize font-semibold text-slate-900">{day}</span>
                  <span className="text-slate-700">
                    {hours.closed ? "Closed" : `${hours.open} – ${hours.close}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600">Default hours will be applied</p>
          )}
        </div>
      </div>
      <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 sm:rounded-3xl">
        <Check className="h-4 w-4 text-emerald-700" />
        <AlertDescription className="text-sm leading-relaxed text-emerald-950">
          <strong className="text-emerald-950">Almost done.</strong> After you submit, we will:
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-950/95">
            {data.business_type === "mobile" && <li>Mark you as mobile-ready where applicable</li>}
            {data.selected_zone_ids && data.selected_zone_ids.length > 0 && (
              <li>
                Attach {data.selected_zone_ids.length} service zone{data.selected_zone_ids.length !== 1 ? "s" : ""} with
                default travel settings
              </li>
            )}
            {(!data.services || data.services.length === 0) &&
              data.global_category_ids &&
              data.global_category_ids.length > 0 && <li>Draft basic services from your categories</li>}
            <li>Create your provider profile and primary location</li>
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
  const [pricingPlans, setPricingPlans] = useState<Array<{
    id: string;
    name: string;
    price: string;
    period: string | null;
    description: string | null;
    cta_text: string;
    is_popular: boolean;
    features: string[];
  }>>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      try {
        setIsLoadingPlans(true);
        const plans = await getPricingPlans();
        setPricingPlans(plans);
        
        // If plan was pre-selected from query params, ensure it's in the list
        if (data.selected_plan_id && !plans.find(p => p.id === data.selected_plan_id)) {
          // Plan might not be active anymore, clear selection
          updateData({ selected_plan_id: undefined });
        }
      } catch (error) {
        console.error("Error loading pricing plans:", error);
        toast.error("Failed to load pricing plans. Please try again.");
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
          <span className="text-sm font-medium text-slate-800">Loading plans…</span>
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
            No pricing plans available at the moment. Please contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 text-center shadow-sm sm:rounded-3xl sm:p-8">
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Choose your plan</h3>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
          Beautonomi Starter is free and includes online booking, Yoco, and calendar sync. Upgrade anytime for SMS, WhatsApp, and higher limits.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
        {pricingPlans.map((plan) => {
          const isSelected = data.selected_plan_id === plan.id;
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
              className={`relative cursor-pointer rounded-2xl border-2 p-6 shadow-sm transition-all sm:rounded-3xl sm:p-7 ${
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
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6 text-center">
                <h4 className="mb-2 text-xl font-bold text-slate-900">{plan.name}</h4>
                <div className="mb-2 flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                  {plan.period && <span className="text-sm text-slate-600">{plan.period}</span>}
                </div>
                {plan.description && <p className="text-sm text-slate-600">{plan.description}</p>}
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="text-sm text-slate-800">{feature}</span>
                  </li>
                ))}
              </ul>

              <div
                className={`flex h-11 w-full items-center justify-center rounded-2xl ${
                  isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {isSelected ? (
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" aria-hidden />
                    <span className="font-semibold">Selected</span>
                  </div>
                ) : (
                  <span className="font-semibold">Select plan</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.selected_plan_id && (
        <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 sm:rounded-3xl">
          <Check className="h-4 w-4 text-emerald-700" />
          <AlertDescription className="text-sm leading-relaxed text-emerald-950">
            <strong className="text-emerald-950">Plan selected.</strong> After you submit, you&apos;ll be on this plan and
            can start your trial.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
