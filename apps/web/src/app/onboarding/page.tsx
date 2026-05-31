"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Check, Loader2, MapPin, Phone, Sparkles, User, ChevronRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { isCompleteE164 } from "@/lib/phone";
import { getSupabaseClient } from "@/lib/supabase/client";
import RoleGuard from "@/components/auth/RoleGuard";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase/auth-sms-otp";

/* ─────────────────────────────────────────────────────────────────────────────
   Constants & Types
───────────────────────────────────────────────────────────────────────────── */

const DRAFT_KEY = "beautonomi_customer_onboarding_v3";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HAIR_TYPES = [
  "Natural / Afro",
  "Relaxed / Permed",
  "Locs / Dreadlocks",
  "Braids / Weaves",
  "Short / Tapered",
  "Wavy",
  "Straight",
  "Curly",
  "Other",
];

const SKIN_TYPES = ["Oily", "Dry", "Combination", "Normal", "Sensitive"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type AddressPayload = {
  address_line1: string;
  city: string;
  state?: string;
  postal_code?: string;
  country: string;
  latitude: number;
  longitude: number;
  place_name?: string;
};

interface Draft {
  ts: number;
  step: number;
  preferredName: string;
  avatarUrl: string;
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  phoneE164: string;
  address: AddressPayload | null;
  addressDisplay: string;
  hairTypes: string[];
  skinType: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

function saveDraft(draft: Partial<Draft>) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadDraftRaw();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, ...draft, ts: Date.now() }));
  } catch {}
}

function loadDraftRaw(): Partial<Draft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (parsed.ts && Date.now() - parsed.ts > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function buildDobString(year: string, month: string, day: string): string | null {
  if (!year || !month || !day) return null;
  const m = String(MONTHS.indexOf(month) + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseDobString(dob: string | null | undefined): { year: string; month: string; day: string } {
  if (!dob) return { year: "", month: "", day: "" };
  const [y, m, d] = dob.split("-");
  return {
    year: y || "",
    month: m ? MONTHS[parseInt(m, 10) - 1] || "" : "",
    day: d ? String(parseInt(d, 10)) : "",
  };
}

function daysInMonth(month: string, year: string): number {
  const mIdx = MONTHS.indexOf(month) + 1;
  if (!mIdx) return 31;
  const y = parseInt(year, 10) || 2000;
  return new Date(y, mIdx, 0).getDate();
}

const currentYear = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 88 }, (_, i) => String(currentYear - 13 - i));

/* ─────────────────────────────────────────────────────────────────────────────
   Step indicator
───────────────────────────────────────────────────────────────────────────── */

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all duration-300",
            i + 1 === current
              ? "w-6 h-2 bg-primary"
              : i + 1 < current
              ? "w-2 h-2 bg-primary/40"
              : "w-2 h-2 bg-slate-200"
          )}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step shell
───────────────────────────────────────────────────────────────────────────── */

function StepShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 1 — Preferred name
───────────────────────────────────────────────────────────────────────────── */

function Step1Name({
  value,
  onChange,
  email,
}: {
  value: string;
  onChange: (v: string) => void;
  email: string;
}) {
  return (
    <StepShell
      icon={<User className="h-7 w-7" />}
      title="What should we call you?"
      subtitle="If you signed up with phone, email code, or Google, tell us your preferred name here — this is how you'll appear to beauty providers."
    >
      <div className="space-y-4">
        {email && (
          <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-center text-sm text-slate-500">
            Signing in as <span className="font-medium text-slate-700">{email}</span>
          </p>
        )}
        <div>
          <Label htmlFor="preferred_name" className="mb-2 block text-sm font-semibold text-slate-700">
            Preferred name <span className="text-primary">*</span>
          </Label>
          <Input
            id="preferred_name"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. Nolo"
            className="h-14 rounded-2xl border-slate-200 text-base focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-400">This can be a first name, nickname, or whatever you prefer.</p>
        </div>
      </div>
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 2 — Profile photo
───────────────────────────────────────────────────────────────────────────── */

function Step2Photo({
  avatarUrl,
  onAvatarChange,
  onFileChange,
}: {
  avatarUrl: string;
  onAvatarChange: (url: string) => void;
  onFileChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be under 5 MB.");
      return;
    }
    onFileChange(file);
    const reader = new FileReader();
    reader.onloadend = () => onAvatarChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <StepShell
      icon={<Camera className="h-7 w-7" />}
      title="Add a profile photo"
      subtitle="Help providers recognise you. You can always update this later."
    >
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-primary/30 bg-primary/5 transition hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Upload profile photo"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-10 w-10 text-primary/50 transition group-hover:text-primary" />
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-8 w-8 text-white" />
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border-slate-200"
        >
          {avatarUrl ? "Change photo" : "Choose photo"}
        </Button>
        <p className="text-center text-xs text-slate-400">JPEG, PNG or WebP · max 5 MB</p>
      </div>
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 3 — Date of birth
───────────────────────────────────────────────────────────────────────────── */

function Step3Birthday({
  dobYear,
  dobMonth,
  dobDay,
  onYearChange,
  onMonthChange,
  onDayChange,
}: {
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  onYearChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onDayChange: (v: string) => void;
}) {
  const maxDay = daysInMonth(dobMonth, dobYear);
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1));

  return (
    <StepShell
      icon={<Sparkles className="h-7 w-7" />}
      title="When's your birthday?"
      subtitle="Used for birthday perks and age-appropriate recommendations"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {/* Day */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-600">Day</Label>
            <select
              value={dobDay}
              onChange={(e) => onDayChange(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">--</option>
              {days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-600">Month</Label>
            <select
              value={dobMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">--</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-600">Year</Label>
            <select
              value={dobYear}
              onChange={(e) => onYearChange(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">----</option>
              {BIRTH_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          You must be at least 13 years old to use Beautonomi.
        </p>
      </div>
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 4 — Phone + OTP (required unless already verified)
───────────────────────────────────────────────────────────────────────────── */

function Step4Phone({
  phoneE164,
  onPhoneChange,
  alreadyVerified,
  onVerified,
}: {
  phoneE164: string;
  onPhoneChange: (e164: string) => void;
  alreadyVerified: boolean;
  onVerified: () => void;
}) {
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  // §UX-audit 2026-05: 30s resend cooldown — consistent with login screen.
  // Previously used the full OTP expiry (SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  // ~5 min) which disabled the button for 5 minutes after the first send.
  const RESEND_COOLDOWN_SECS = 30;
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localVerified, setLocalVerified] = useState(alreadyVerified);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setInterval(() => setResendCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (!isCompleteE164(phoneE164)) {
      toast.error("Please enter a valid phone number first.");
      return;
    }
    const normalized = normalizeSupabaseAuthPhone(phoneE164);
    setIsSending(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Client not ready");
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;
      setPendingPhoneE164(normalized);
      setVerificationCode("");
      setCodeSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECS);
      toast.success("Verification code sent!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send code. Try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? verificationCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      toast.error(`Please enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS.`);
      return;
    }
    setIsVerifying(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Client not ready");
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhoneE164,
        token,
        type: "phone_change",
      });
      if (error) throw error;
      // Use the dedicated server endpoint that validates Supabase's phone_confirmed_at
      // before writing phone_verified=true — prevents client-side spoofing.
      await fetcher.post("/api/me/phone/verify", { phone: pendingPhoneE164 });
      setLocalVerified(true);
      onVerified();
      toast.success("Phone number verified!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <StepShell
      icon={<Phone className="h-7 w-7" />}
      title="Add your phone number"
      subtitle="Required for booking confirmations and house-call services"
    >
      {localVerified ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-900">Phone verified</p>
            <p className="text-sm text-slate-500">{phoneE164}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-sm font-semibold text-slate-700">
              Mobile number <span className="text-primary">*</span>
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <PhoneInput
                  inputId="onboarding-phone"
                  label=""
                  value={phoneE164}
                  onChange={(e164) => {
                    onPhoneChange(e164);
                    setCodeSent(false);
                    setVerificationCode("");
                    setPendingPhoneE164("");
                  }}
                  placeholder="Phone number"
                />
              </div>
              <Button
                type="button"
                onClick={handleSendCode}
                disabled={!isCompleteE164(phoneE164) || isSending || resendCooldown > 0}
                className="h-12 shrink-0 rounded-xl bg-primary px-4 text-white hover:bg-primary/90 disabled:opacity-50"
                aria-label={
                  resendCooldown > 0
                    ? `Resend in ${resendCooldown} seconds`
                    : codeSent ? "Resend code" : "Send code"
                }
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  codeSent ? "Resend" : "Send code"
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              We'll SMS a {SUPABASE_AUTH_OTP_LENGTH}-digit code. For SA numbers, enter local format (e.g. 082 123 4567).
            </p>
          </div>

          {codeSent && (
            <div className="space-y-3">
              <Label className="block text-sm font-semibold text-slate-700">
                Enter verification code <span className="text-primary">*</span>
              </Label>
              <div className="flex gap-2">
                <OtpDigitInput
                  id="onboarding-otp"
                  length={SUPABASE_AUTH_OTP_LENGTH}
                  label="Phone verification code"
                  value={verificationCode}
                  onChange={setVerificationCode}
                  onComplete={(code) => {
                    if (!isVerifying && !localVerified) void handleVerifyCode(code);
                  }}
                  disabled={isVerifying || localVerified}
                  autoFocus
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => void handleVerifyCode()}
                  disabled={!isCompleteSupabaseSmsOtp(verificationCode) || isVerifying || localVerified}
                  className="h-12 shrink-0 rounded-xl bg-primary px-4 text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 5 — Location (required unless address exists)
───────────────────────────────────────────────────────────────────────────── */

function Step5Location({
  address,
  addressDisplay,
  onAddressChange,
  alreadyHasAddress,
}: {
  address: AddressPayload | null;
  addressDisplay: string;
  onAddressChange: (a: AddressPayload, display: string) => void;
  alreadyHasAddress: boolean;
}) {
  return (
    <StepShell
      icon={<MapPin className="h-7 w-7" />}
      title="Where are you based?"
      subtitle="Used for house-call bookings and showing you nearby services"
    >
      <div className="space-y-4">
        {alreadyHasAddress && !address && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">
              You already have a saved address. You can add another one or continue.
            </p>
          </div>
        )}

        <div>
          <Label className="mb-2 block text-sm font-semibold text-slate-700">
            Home address {!alreadyHasAddress && <span className="text-primary">*</span>}
          </Label>
          <AddressAutocomplete
            inputId="onboarding-address"
            value={addressDisplay}
            onChange={(a) => {
              onAddressChange(
                {
                  address_line1: a.address_line1,
                  city: a.city,
                  state: a.state,
                  postal_code: a.postal_code,
                  country: a.country,
                  latitude: a.latitude,
                  longitude: a.longitude,
                  place_name: a.place_name,
                },
                a.place_name || a.address_line1
              );
            }}
            onInputChange={() => {}}
            placeholder="Search for your address…"
            country="ZA"
            defaultCountryName="South Africa"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Your exact address is only shared with providers when you make a house-call booking.
          </p>
        </div>

        {address && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-slate-700">{address.place_name || address.address_line1}, {address.city}</span>
          </div>
        )}
      </div>
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step 6 — Beauty preferences
───────────────────────────────────────────────────────────────────────────── */

function Step6Beauty({
  hairTypes,
  skinType,
  onHairToggle,
  onSkinChange,
}: {
  hairTypes: string[];
  skinType: string;
  onHairToggle: (h: string) => void;
  onSkinChange: (s: string) => void;
}) {
  return (
    <StepShell
      icon={<Sparkles className="h-7 w-7" />}
      title="Your beauty profile"
      subtitle="We'll personalise service recommendations just for you"
    >
      <div className="space-y-6">
        <div>
          <Label className="mb-3 block text-sm font-semibold text-slate-700">Hair type (select all that apply)</Label>
          <div className="flex flex-wrap gap-2">
            {HAIR_TYPES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onHairToggle(h)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  hairTypes.includes(h)
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary"
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-3 block text-sm font-semibold text-slate-700">Skin type</Label>
          <div className="flex flex-wrap gap-2">
            {SKIN_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSkinChange(s === skinType ? "" : s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  skinType === s
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────────────── */

const TOTAL_STEPS = 6;

function CustomerOnboardingWizard() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  // ── Step state ──
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // ── Field state ──
  const [preferredName, setPreferredName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");

  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");

  const [phoneE164, setPhoneE164] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [address, setAddress] = useState<AddressPayload | null>(null);
  const [addressDisplay, setAddressDisplay] = useState("");
  const [alreadyHasAddress, setAlreadyHasAddress] = useState(false);

  const [hairTypes, setHairTypes] = useState<string[]>([]);
  const [skinType, setSkinType] = useState("");

  // ── On mount: redirect if not logged in, prefill, restore draft ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!user) {
        router.replace("/signup?type=customer");
        return;
      }

      // Check guard — already completed?
      try {
        const res = await fetcher.get<{ data: { completed: boolean } }>("/api/me/onboarding/complete");
        if (res.data?.completed) {
          router.replace("/");
          return;
        }
      } catch {}

      // Restore localStorage draft first (will be overridden by server data below)
      const draft = loadDraftRaw();
      if (draft.step) setCurrentStep(draft.step);
      if (draft.preferredName) setPreferredName(draft.preferredName);
      if (draft.avatarUrl) setAvatarUrl(draft.avatarUrl);
      if (draft.dobYear) setDobYear(draft.dobYear);
      if (draft.dobMonth) setDobMonth(draft.dobMonth);
      if (draft.dobDay) setDobDay(draft.dobDay);
      if (draft.phoneE164) setPhoneE164(draft.phoneE164);
      if (draft.address) { setAddress(draft.address); setAddressDisplay(draft.addressDisplay || ""); }
      if (draft.hairTypes) setHairTypes(draft.hairTypes);
      if (draft.skinType) setSkinType(draft.skinType);

      // Server prefill — wins over draft for profile fields
      try {
        const [profileRes, addressesRes, prefsRes] = await Promise.allSettled([
          fetcher.get<{ data: Record<string, unknown> }>("/api/me/profile"),
          fetcher.get<{ data: Array<{ id: string }> }>("/api/me/addresses"),
          fetcher.get<{ data: { hair_type?: string | null; skin_type?: string | null } }>("/api/me/beauty-preferences"),
        ]);

        if (cancelled) return;

        if (profileRes.status === "fulfilled") {
          const p = profileRes.value.data as Record<string, unknown>;
          // Preferred name: use existing preferred_name, or derive first name from full_name
          const pname = (p?.preferred_name as string | null) || "";
          const fullFirst = ((p?.full_name as string | null) || "").split(" ")[0] || "";
          const emailLocal =
            !pname && !fullFirst && user?.email
              ? user.email.split("@")[0]?.replace(/[.+_-]/g, " ").trim() || ""
              : "";
          if (!draft.preferredName) setPreferredName(pname || fullFirst || emailLocal);
          // Avatar
          if (p?.avatar_url && !draft.avatarUrl) setAvatarUrl(p.avatar_url as string);
          // DOB
          if (p?.date_of_birth && !draft.dobYear) {
            const parsed = parseDobString(p.date_of_birth as string);
            setDobYear(parsed.year);
            setDobMonth(parsed.month);
            setDobDay(parsed.day);
          }
          // Phone
          if (p?.phone && !draft.phoneE164) setPhoneE164(p.phone as string);
          if (p?.phone_verified) setPhoneVerified(true);
        }

        if (addressesRes.status === "fulfilled") {
          const addrs = addressesRes.value.data || [];
          if (Array.isArray(addrs) && addrs.length > 0) setAlreadyHasAddress(true);
        }

        if (prefsRes.status === "fulfilled") {
          const prefs = prefsRes.value.data;
          if (prefs?.hair_type && !draft.hairTypes?.length) {
            setHairTypes(
              Array.isArray(prefs.hair_type) ? prefs.hair_type : [prefs.hair_type as string]
            );
          }
          if (prefs?.skin_type && !draft.skinType) setSkinType(prefs.skin_type as string);
        }
      } catch {}

      if (!cancelled) setIsInitializing(false);
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per login; `user` identity may churn without a new id
  }, [user]);

  // ── Auto-save draft ──
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isInitializing) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft({ step: currentStep, preferredName, avatarUrl, dobYear, dobMonth, dobDay, phoneE164, address, addressDisplay, hairTypes, skinType });
    }, 1200);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [currentStep, preferredName, avatarUrl, dobYear, dobMonth, dobDay, phoneE164, address, addressDisplay, hairTypes, skinType, isInitializing]);

  /* ── Step validation ── */

  const validateStep = useCallback((): string | null => {
    if (currentStep === 1) {
      if (!preferredName.trim()) return "Please enter a name to continue.";
    }
    if (currentStep === 4) {
      if (!phoneVerified && !phoneE164) return "A verified phone number is required.";
      if (!phoneVerified && phoneE164) return "Please verify your phone number to continue.";
    }
    if (currentStep === 5) {
      if (!alreadyHasAddress && !address) return "Please search for and select your address.";
    }
    return null;
  }, [currentStep, preferredName, phoneVerified, phoneE164, address, alreadyHasAddress]);

  /* ── Per-step API calls ── */

  const saveCurrentStep = useCallback(async (): Promise<boolean> => {
    try {
      switch (currentStep) {
        case 1: {
          await fetcher.patch("/api/me/profile", { preferred_name: preferredName.trim() });
          break;
        }
        case 2: {
          if (photoFile) {
            const fd = new FormData();
            fd.append("file", photoFile);
            const res = await fetcher.post<{ data: { url: string } }>("/api/me/avatar", fd);
            const url = res.data?.url;
            if (url) {
              await fetcher.patch("/api/me/profile", { avatar_url: url });
              setAvatarUrl(url);
            }
          }
          break;
        }
        case 3: {
          const dob = buildDobString(dobYear, dobMonth, dobDay);
          if (dob) {
            await fetcher.patch("/api/me/profile", { date_of_birth: dob });
          }
          break;
        }
        case 4: {
          // Phone was already saved during OTP verification in Step4Phone
          break;
        }
        case 5: {
          if (address && !alreadyHasAddress) {
            await fetcher.post("/api/me/addresses", {
              label: "Home",
              is_default: true,
              address_line1: address.address_line1,
              city: address.city,
              state: address.state ?? null,
              postal_code: address.postal_code ?? null,
              country: address.country,
              latitude: address.latitude,
              longitude: address.longitude,
            });
            setAlreadyHasAddress(true);
          } else if (address && alreadyHasAddress) {
            // User chose to add another
            await fetcher.post("/api/me/addresses", {
              label: "Home",
              is_default: false,
              address_line1: address.address_line1,
              city: address.city,
              state: address.state ?? null,
              postal_code: address.postal_code ?? null,
              country: address.country,
              latitude: address.latitude,
              longitude: address.longitude,
            });
          }
          break;
        }
        case 6: {
          if (hairTypes.length > 0 || skinType) {
            await fetcher.patch("/api/me/beauty-preferences", {
              hair_type: hairTypes.length > 0 ? hairTypes : null,
              skin_type: skinType || null,
            });
          }
          break;
        }
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      toast.error(msg);
      return false;
    }
  }, [currentStep, preferredName, photoFile, dobYear, dobMonth, dobDay, address, alreadyHasAddress, hairTypes, skinType]);

  const handleContinue = async () => {
    const err = validateStep();
    if (err) {
      toast.error(err);
      return;
    }
    setIsLoading(true);
    const ok = await saveCurrentStep();
    setIsLoading(false);
    if (!ok) return;

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    } else {
      await handleComplete();
    }
  };

  const handleSkip = async () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    } else {
      await handleComplete();
    }
  };

  // §UX-audit 2026-05: back navigation so users can correct earlier steps
  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      await fetcher.post("/api/me/onboarding/complete");
      clearDraft();
      await refreshUser();
      try { await fetcher.post("/api/me/analytics/identify"); } catch {}
      setIsLoading(false);
      router.push("/");
    } catch (err) {
      setIsLoading(false);
      toast.error("Could not complete setup. Please try again.");
      console.error("Onboarding complete failed:", err);
    }
  };

  /* ── Render ── */

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  const canSkipCurrentStep = currentStep !== 1 && currentStep !== 4 && currentStep !== 5;
  const isLastStep = currentStep === TOTAL_STEPS;
  const continueLabel = isLastStep ? "Finish" : "Continue";
  const canGoBack = currentStep > 1;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white to-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        {canGoBack ? (
          <button
            type="button"
            onClick={handleBack}
            disabled={isLoading}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40"
            aria-label="Go back to previous step"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
            Back
          </button>
        ) : (
          <span className="text-lg font-bold tracking-tight text-primary">Beautonomi</span>
        )}
        {canSkipCurrentStep && (
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            Skip
          </button>
        )}
      </header>

      {/* Progress */}
      <div className="px-4 pb-4 sm:px-8">
        <StepDots total={TOTAL_STEPS} current={currentStep} />
        <p className="mt-2 text-center text-xs text-slate-400">
          Step {currentStep} of {TOTAL_STEPS}
        </p>
      </div>

      {/* Step content */}
      <main className="flex flex-1 flex-col items-center px-4 pb-8 sm:px-8">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            <div key={currentStep}>
              {currentStep === 1 && (
                <Step1Name
                  value={preferredName}
                  onChange={setPreferredName}
                  email={(user as unknown as Record<string, unknown>)?.email as string || ""}
                />
              )}
              {currentStep === 2 && (
                <Step2Photo
                  avatarUrl={avatarUrl}
                  onAvatarChange={setAvatarUrl}
                  onFileChange={setPhotoFile}
                />
              )}
              {currentStep === 3 && (
                <Step3Birthday
                  dobYear={dobYear}
                  dobMonth={dobMonth}
                  dobDay={dobDay}
                  onYearChange={setDobYear}
                  onMonthChange={setDobMonth}
                  onDayChange={setDobDay}
                />
              )}
              {currentStep === 4 && (
                <Step4Phone
                  phoneE164={phoneE164}
                  onPhoneChange={setPhoneE164}
                  alreadyVerified={phoneVerified}
                  onVerified={() => setPhoneVerified(true)}
                />
              )}
              {currentStep === 5 && (
                <Step5Location
                  address={address}
                  addressDisplay={addressDisplay}
                  onAddressChange={(a, display) => { setAddress(a); setAddressDisplay(display); }}
                  alreadyHasAddress={alreadyHasAddress}
                />
              )}
              {currentStep === 6 && (
                <Step6Beauty
                  hairTypes={hairTypes}
                  skinType={skinType}
                  onHairToggle={(h) =>
                    setHairTypes((prev) =>
                      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
                    )
                  }
                  onSkinChange={setSkinType}
                />
              )}
            </div>
          </AnimatePresence>

          {/* Actions */}
          <div className="mt-8 space-y-3">
            <Button
              type="button"
              onClick={handleContinue}
              disabled={isLoading}
              className="h-14 w-full rounded-2xl bg-primary text-base font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {continueLabel}
                  {!isLastStep && <ChevronRight className="ml-1 h-4 w-4" />}
                </>
              )}
            </Button>

            {canSkipCurrentStep && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoading}
                className="w-full text-center text-sm text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                {isLastStep ? "Skip and finish" : "Skip for now"}
              </button>
            )}

            {/* Step 4 required notice */}
            {currentStep === 4 && !phoneVerified && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700">
                  Phone verification is required to make bookings. You must verify your number to continue.
                </p>
              </div>
            )}

            {/* Step 5 required notice */}
            {currentStep === 5 && !alreadyHasAddress && !address && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700">
                  An address is required for house-call bookings. Please search for and confirm your location.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CustomerOnboardingPage() {
  return (
    <RoleGuard allowedRoles={["customer"]} redirectTo="/login?return_to=/onboarding">
      <CustomerOnboardingWizard />
    </RoleGuard>
  );
}
