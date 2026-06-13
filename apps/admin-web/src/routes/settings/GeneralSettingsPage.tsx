import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { Globe, Mail, Smartphone } from "lucide-react";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";

type FullSettings = Record<string, unknown>;

type BrandingForm = {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
};

type LocalizationForm = {
  default_language: string;
  supported_languages: string[];
  default_currency: string;
  supported_currencies: string[];
  timezone: string;
};

type IsoCurrencyRow = { code: string; name: string; symbol?: string | null; is_active?: boolean };
type IsoLanguageRow = { code: string; name: string; native_name?: string | null; is_active?: boolean };
type IsoTimezoneRow = { code: string; name: string; is_active?: boolean };

function normalizeLocalizationForSave(loc: LocalizationForm): LocalizationForm {
  const langs = new Set(
    loc.supported_languages.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  langs.add(loc.default_language.trim().toLowerCase());
  const curs = new Set(
    loc.supported_currencies.map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  curs.add(loc.default_currency.trim().toUpperCase());
  return {
    ...loc,
    default_language: loc.default_language.trim().toLowerCase(),
    default_currency: loc.default_currency.trim().toUpperCase(),
    timezone: loc.timezone.trim(),
    supported_languages: Array.from(langs).sort(),
    supported_currencies: Array.from(curs).sort(),
  };
}

function filterActive<T extends { is_active?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => r.is_active !== false);
}

type FeaturesForm = {
  auto_approve_providers: boolean;
};

type VerificationForm = {
  otp_enabled: boolean;
  qr_code_enabled: boolean;
  require_verification: boolean;
  allow_provider_override: boolean;
  guest_link_email_enabled: boolean;
  guest_link_sms_enabled: boolean;
};

type SocialAuthForm = {
  google: boolean;
  apple: boolean;
};

type SupabaseAuthPolicyForm = {
  email_provider_enabled: boolean;
  secure_email_change: boolean;
  secure_password_change: boolean;
  require_current_password: boolean;
  prevent_leaked_passwords: boolean;
  minimum_password_length: number;
  password_requirements: "none" | "letters_and_digits" | "lowercase_uppercase_number";
  email_otp_expiration_seconds: number;
  email_otp_length: number;
  phone_provider_enabled: boolean;
  phone_confirmations_enabled: boolean;
  sms_provider: "twilio";
  sms_otp_expiration_seconds: number;
  sms_otp_length: number;
  sms_message_template: string;
};

type TwilioForm = {
  enabled: boolean;
  account_sid: string;
  auth_token: string;
  message_service_sid: string;
  content_sid: string;
  sms_from: string;
  whatsapp_from: string;
};

type OnesignalForm = {
  enabled: boolean;
  app_id: string;
  app_id_provider: string;
  rest_api_key: string;
  rest_api_key_provider: string;
};

function inp(
  label: string,
  value: string,
  onChange: (v: string) => void,
  type = "text"
) {
  return (
    <div key={label}>
      <label className="mb-0.5 block text-xs font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

export function GeneralSettingsPage() {
  useAdminDocumentTitle("Platform Settings");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.settings(),
    queryFn: () => adminApi.getJson<FullSettings>("/api/admin/settings", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const isoQueries = useQueries({
    queries: [
      {
        queryKey: adminQueryKeys.isoCodes("currencies"),
        queryFn: () =>
          adminApi.getJson<IsoCurrencyRow[]>("/api/admin/iso-codes/currencies", {
            timeoutMs: 60_000,
          }),
        enabled: allowed,
      },
      {
        queryKey: adminQueryKeys.isoCodes("languages"),
        queryFn: () =>
          adminApi.getJson<IsoLanguageRow[]>("/api/admin/iso-codes/languages", {
            timeoutMs: 60_000,
          }),
        enabled: allowed,
      },
      {
        queryKey: adminQueryKeys.isoCodes("timezones"),
        queryFn: () =>
          adminApi.getJson<IsoTimezoneRow[]>("/api/admin/iso-codes/timezones", {
            timeoutMs: 60_000,
          }),
        enabled: allowed,
      },
    ],
  });

  const activeCurrencies = useMemo(() => {
    const raw = isoQueries[0].data;
    const rows = Array.isArray(raw) ? filterActive(raw) : [];
    return [...rows].sort((a, b) => a.code.localeCompare(b.code));
  }, [isoQueries[0].data]);

  const activeLanguages = useMemo(() => {
    const raw = isoQueries[1].data;
    const rows = Array.isArray(raw) ? filterActive(raw) : [];
    return [...rows].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  }, [isoQueries[1].data]);

  const activeTimezones = useMemo(() => {
    const raw = isoQueries[2].data;
    const rows = Array.isArray(raw) ? filterActive(raw) : [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [isoQueries[2].data]);

  const isoLoading = isoQueries.some((iq) => iq.isLoading);
  const isoError = isoQueries.find((iq) => iq.error)?.error;

  const [branding, setBranding] = useState<BrandingForm>({
    site_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "#6366f1",
    secondary_color: "#f59e0b",
  });
  const [localization, setLocalization] = useState<LocalizationForm>({
    default_language: "en",
    supported_languages: [],
    default_currency: "ZAR",
    supported_currencies: [],
    timezone: "Africa/Johannesburg",
  });
  const [features, setFeatures] = useState<FeaturesForm>({
    auto_approve_providers: false,
  });
  const [verification, setVerification] = useState<VerificationForm>({
    otp_enabled: true,
    qr_code_enabled: true,
    require_verification: true,
    allow_provider_override: true,
    guest_link_email_enabled: true,
    guest_link_sms_enabled: true,
  });
  const [socialAuth, setSocialAuth] = useState<SocialAuthForm>({
    google: true,
    apple: true,
  });
  const [onesignal, setOnesignal] = useState<OnesignalForm>({
    enabled: true,
    app_id: "",
    app_id_provider: "",
    rest_api_key: "",
    rest_api_key_provider: "",
  });
  const [auth, setAuth] = useState<SupabaseAuthPolicyForm>({
    email_provider_enabled: true,
    secure_email_change: true,
    secure_password_change: true,
    require_current_password: true,
    prevent_leaked_passwords: true,
    minimum_password_length: 8,
    password_requirements: "none",
    email_otp_expiration_seconds: 3600,
    email_otp_length: 6,
    phone_provider_enabled: true,
    phone_confirmations_enabled: true,
    sms_provider: "twilio",
    sms_otp_expiration_seconds: 120,
    sms_otp_length: 6,
    sms_message_template: "Your OTP code is {{ .Code }}",
  });
  const [twilio, setTwilio] = useState<TwilioForm>({
    enabled: false,
    account_sid: "",
    auth_token: "",
    message_service_sid: "",
    content_sid: "",
    sms_from: "",
    whatsapp_from: "",
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [supportedLangFilter, setSupportedLangFilter] = useState("");
  const [supportedCurrencyFilter, setSupportedCurrencyFilter] = useState("");

  useEffect(() => {
    if (!q.data) return;
    const b = (q.data.branding ?? {}) as Partial<BrandingForm>;
    const l = (q.data.localization ?? {}) as Partial<LocalizationForm>;
    const f = (q.data.features ?? {}) as Partial<FeaturesForm>;
    setBranding({
      site_name: b.site_name ?? "",
      logo_url: b.logo_url ?? "",
      favicon_url: b.favicon_url ?? "",
      primary_color: b.primary_color ?? "#6366f1",
      secondary_color: b.secondary_color ?? "#f59e0b",
    });
    setLocalization({
      default_language: l.default_language ?? "en",
      supported_languages: Array.isArray(l.supported_languages) ? l.supported_languages : [],
      default_currency: l.default_currency ?? "ZAR",
      supported_currencies: Array.isArray(l.supported_currencies) ? l.supported_currencies : [],
      timezone: l.timezone ?? "Africa/Johannesburg",
    });
    setFeatures({
      auto_approve_providers: f.auto_approve_providers ?? false,
    });
    const v = (q.data.verification ?? {}) as Partial<VerificationForm>;
    setVerification({
      otp_enabled: v.otp_enabled !== false,
      qr_code_enabled: v.qr_code_enabled !== false,
      require_verification: v.require_verification !== false,
      allow_provider_override: v.allow_provider_override !== false,
      guest_link_email_enabled: v.guest_link_email_enabled !== false,
      guest_link_sms_enabled: v.guest_link_sms_enabled !== false,
    });
    const sa = (q.data.social_auth ?? {}) as Partial<SocialAuthForm>;
    setSocialAuth({
      google: sa.google !== false,
      apple: sa.apple !== false,
    });
    const o = (q.data.onesignal ?? {}) as Partial<OnesignalForm>;
    setOnesignal({
      enabled: o.enabled !== false,
      app_id: o.app_id ?? "",
      app_id_provider: o.app_id_provider ?? "",
      rest_api_key: "",
      rest_api_key_provider: "",
    });
    const a = (q.data as { auth?: Partial<SupabaseAuthPolicyForm> }).auth;
    if (a && typeof a === "object") {
      setAuth({
        email_provider_enabled: a.email_provider_enabled !== false,
        secure_email_change: a.secure_email_change !== false,
        secure_password_change: a.secure_password_change !== false,
        require_current_password: a.require_current_password !== false,
        prevent_leaked_passwords: a.prevent_leaked_passwords !== false,
        minimum_password_length:
          typeof a.minimum_password_length === "number" && a.minimum_password_length > 0
            ? a.minimum_password_length
            : 8,
        password_requirements:
          a.password_requirements === "letters_and_digits" ||
          a.password_requirements === "lowercase_uppercase_number" ||
          a.password_requirements === "none"
            ? a.password_requirements
            : "none",
        email_otp_expiration_seconds:
          typeof a.email_otp_expiration_seconds === "number" && a.email_otp_expiration_seconds > 0
            ? a.email_otp_expiration_seconds
            : 3600,
        email_otp_length:
          typeof a.email_otp_length === "number" && a.email_otp_length > 0 ? a.email_otp_length : 6,
        phone_provider_enabled: a.phone_provider_enabled !== false,
        phone_confirmations_enabled: a.phone_confirmations_enabled !== false,
        sms_provider: a.sms_provider === "twilio" ? "twilio" : "twilio",
        sms_otp_expiration_seconds:
          typeof a.sms_otp_expiration_seconds === "number" && a.sms_otp_expiration_seconds > 0
            ? a.sms_otp_expiration_seconds
            : 120,
        sms_otp_length: typeof a.sms_otp_length === "number" && a.sms_otp_length > 0 ? a.sms_otp_length : 6,
        sms_message_template:
          typeof a.sms_message_template === "string" && a.sms_message_template.trim()
            ? a.sms_message_template.trim()
            : "Your OTP code is {{ .Code }}",
      });
    }
    const tw = (q.data as { twilio?: Partial<TwilioForm> }).twilio;
    if (tw && typeof tw === "object") {
      setTwilio({
        enabled: tw.enabled !== false,
        account_sid: (tw as { account_sid?: string }).account_sid === "***" ? "" : (tw as { account_sid?: string }).account_sid ?? "",
        auth_token: (tw as { auth_token?: string }).auth_token === "***" ? "" : (tw as { auth_token?: string }).auth_token ?? "",
        message_service_sid: (tw as { message_service_sid?: string }).message_service_sid ?? "",
        content_sid: (tw as { content_sid?: string }).content_sid ?? "",
        sms_from: (tw as { sms_from?: string }).sms_from ?? "",
        whatsapp_from: (tw as { whatsapp_from?: string }).whatsapp_from ?? "",
      });
    }
  }, [q.data]);

  const activeCurrencyCodes = useMemo(
    () => new Set(activeCurrencies.map((c) => c.code.toUpperCase())),
    [activeCurrencies],
  );
  const activeLanguageCodes = useMemo(
    () => new Set(activeLanguages.map((l) => l.code.toLowerCase())),
    [activeLanguages],
  );

  const orphanSupportedLanguages = useMemo(
    () =>
      localization.supported_languages.filter(
        (c) => !activeLanguageCodes.has(c.trim().toLowerCase()),
      ),
    [localization.supported_languages, activeLanguageCodes],
  );
  const orphanSupportedCurrencies = useMemo(
    () =>
      localization.supported_currencies.filter(
        (c) => !activeCurrencyCodes.has(c.trim().toUpperCase()),
      ),
    [localization.supported_currencies, activeCurrencyCodes],
  );

  const filteredLanguagesForGrid = useMemo(() => {
    const q = supportedLangFilter.trim().toLowerCase();
    if (!q) return activeLanguages;
    return activeLanguages.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.native_name ?? "").toLowerCase().includes(q),
    );
  }, [activeLanguages, supportedLangFilter]);

  const filteredCurrenciesForGrid = useMemo(() => {
    const q = supportedCurrencyFilter.trim().toLowerCase();
    if (!q) return activeCurrencies;
    return activeCurrencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.symbol ?? "").toLowerCase().includes(q),
    );
  }, [activeCurrencies, supportedCurrencyFilter]);

  const saveMut = useMutation({
    mutationFn: () => {
      // Merge changed sections into the existing settings
      const existing = q.data ?? {};
      const locSaved = normalizeLocalizationForSave(localization);
      const merged: FullSettings = {
        ...existing,
        branding: { ...((existing.branding as Record<string, unknown>) ?? {}), ...branding },
        localization: {
          ...((existing.localization as Record<string, unknown>) ?? {}),
          ...locSaved,
        },
        features: { ...((existing.features as Record<string, unknown>) ?? {}), ...features },
        verification: {
          ...((existing.verification as Record<string, unknown>) ?? {}),
          ...verification,
        },
        social_auth: {
          ...((existing.social_auth as Record<string, unknown>) ?? {}),
          google: socialAuth.google,
          apple: socialAuth.apple,
        } as Record<string, unknown>,
        onesignal: {
          ...((existing.onesignal as Record<string, unknown>) ?? {}),
          enabled: onesignal.enabled,
          app_id: onesignal.app_id.trim(),
          app_id_provider: onesignal.app_id_provider.trim(),
          ...(onesignal.rest_api_key.trim() ? { rest_api_key: onesignal.rest_api_key.trim() } : {}),
          ...(onesignal.rest_api_key_provider.trim()
            ? { rest_api_key_provider: onesignal.rest_api_key_provider.trim() }
            : {}),
        } as Record<string, unknown>,
        auth: {
          ...((existing.auth as Record<string, unknown>) ?? {}),
          ...auth,
        } as SupabaseAuthPolicyForm,
        twilio: {
          ...((existing.twilio as Record<string, unknown>) ?? {}),
          enabled: twilio.enabled,
          account_sid: twilio.account_sid.trim(),
          message_service_sid: twilio.message_service_sid.trim(),
          content_sid: twilio.content_sid.trim(),
          sms_from: twilio.sms_from.trim(),
          whatsapp_from: twilio.whatsapp_from.trim(),
          ...(twilio.auth_token.trim() ? { auth_token: twilio.auth_token.trim() } : {}),
        } as Record<string, unknown>,
      };
      return adminApi.patchJson("/api/admin/settings", merged);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.settings() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.isoCodesAll() });
      setOnesignal((p) => ({ ...p, rest_api_key: "", rest_api_key_provider: "" }));
      setTwilio((p) => ({ ...p, auth_token: "" }));
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : "Failed to save"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Platform settings" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform settings"
        description="Configure branding, localisation, Supabase email auth policy, and core platform features."
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        }
      />

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Branding</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {inp("Site name", branding.site_name, (v) => setBranding((p) => ({ ...p, site_name: v })))}
          {inp("Logo URL", branding.logo_url, (v) => setBranding((p) => ({ ...p, logo_url: v })), "url")}
          {inp("Favicon URL", branding.favicon_url, (v) => setBranding((p) => ({ ...p, favicon_url: v })), "url")}
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Primary colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primary_color}
                onChange={(e) => setBranding((p) => ({ ...p, primary_color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={branding.primary_color}
                onChange={(e) => setBranding((p) => ({ ...p, primary_color: e.target.value }))}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Secondary colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.secondary_color}
                onChange={(e) => setBranding((p) => ({ ...p, secondary_color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={branding.secondary_color}
                onChange={(e) => setBranding((p) => ({ ...p, secondary_color: e.target.value }))}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Localisation</h3>
          <Link
            to={adminSpaTo("/admin/iso-codes")}
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden />
            Manage ISO reference data
          </Link>
        </div>
        <p className="mb-4 text-xs text-gray-600">
          Supported languages and currencies control what appears in customer preference pickers and checkout. Defaults must stay
          inside the supported lists — they are added automatically when you save.
        </p>
        {isoError && (
          <div className="mb-4 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Could not load ISO lists ({isoError instanceof Error ? isoError.message : "error"}). Try again, or manage codes in
              ISO reference data.
            </span>
            <button
              type="button"
              className="shrink-0 rounded bg-amber-900 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800"
              onClick={() => void Promise.all(isoQueries.map((iq) => iq.refetch()))}
            >
              Retry ISO load
            </button>
          </div>
        )}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Default language</label>
            {isoLoading ? (
              <div className="w-full animate-pulse rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-400">
                Loading…
              </div>
            ) : (
              <select
                value={localization.default_language}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocalization((p) => ({
                    ...p,
                    default_language: v,
                    supported_languages: p.supported_languages.some((x) => x.toLowerCase() === v.toLowerCase())
                      ? p.supported_languages
                      : [...p.supported_languages, v],
                  }));
                }}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {!activeLanguageCodes.has(localization.default_language.trim().toLowerCase()) &&
                  localization.default_language.trim() !== "" && (
                    <option value={localization.default_language}>
                      {localization.default_language} (saved)
                    </option>
                  )}
                {activeLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Default currency (ISO 4217)</label>
            {isoLoading ? (
              <div className="w-full animate-pulse rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-400">
                Loading…
              </div>
            ) : (
              <select
                value={localization.default_currency}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocalization((p) => ({
                    ...p,
                    default_currency: v,
                    supported_currencies: p.supported_currencies.some((x) => x.toUpperCase() === v.toUpperCase())
                      ? p.supported_currencies
                      : [...p.supported_currencies, v],
                  }));
                }}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {!activeCurrencyCodes.has(localization.default_currency.trim().toUpperCase()) &&
                  localization.default_currency.trim() !== "" && (
                    <option value={localization.default_currency}>
                      {localization.default_currency} (saved)
                    </option>
                  )}
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Timezone (IANA)</label>
            {isoLoading ? (
              <div className="w-full animate-pulse rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-400">
                Loading…
              </div>
            ) : (
              <select
                value={localization.timezone}
                onChange={(e) => setLocalization((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {!activeTimezones.some((t) => t.code === localization.timezone) &&
                  localization.timezone.trim() !== "" && (
                    <option value={localization.timezone}>{localization.timezone} (saved)</option>
                  )}
                {activeTimezones.map((tz) => (
                  <option key={tz.code} value={tz.code}>
                    {tz.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <span className="text-xs font-medium text-gray-700">Supported languages</span>
              <span className="text-[11px] text-gray-500">Active ISO languages only; default cannot be unchecked.</span>
            </div>
            {!isoLoading && (
              <input
                type="search"
                value={supportedLangFilter}
                onChange={(e) => setSupportedLangFilter(e.target.value)}
                placeholder="Filter by code or name…"
                autoComplete="off"
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
            {isoLoading ? (
              <div className="max-h-56 animate-pulse rounded border border-gray-200 bg-gray-100 px-3 py-8 text-center text-sm text-gray-400">
                Loading…
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded border border-gray-200 p-2">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {activeLanguages.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-gray-500">
                      No active languages in ISO reference data.
                    </p>
                  ) : filteredLanguagesForGrid.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-gray-500">
                      No languages match this filter.
                    </p>
                  ) : null}
                  {filteredLanguagesForGrid.map((lang) => {
                    const code = lang.code.toLowerCase();
                    const checked = localization.supported_languages.some((x) => x.toLowerCase() === code);
                    const isDefault = localization.default_language.trim().toLowerCase() === code;
                    return (
                      <label
                        key={lang.code}
                        className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm ${isDefault ? "bg-indigo-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                          checked={checked || isDefault}
                          disabled={isDefault}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setLocalization((p) => {
                              const set = new Set(p.supported_languages.map((x) => x.toLowerCase()));
                              if (on) set.add(code);
                              else set.delete(code);
                              return {
                                ...p,
                                supported_languages: Array.from(set).sort(),
                              };
                            });
                          }}
                        />
                        <span className="text-gray-800">
                          {lang.name}{" "}
                          <span className="text-gray-500">({lang.code})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {orphanSupportedLanguages.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-800">
                Saved codes not in the active ISO list:{" "}
                {orphanSupportedLanguages.map((c, i) => (
                  <span key={c}>
                    {i > 0 ? ", " : ""}
                    <button
                      type="button"
                      className="font-mono text-indigo-700 underline"
                      onClick={() =>
                        setLocalization((p) => ({
                          ...p,
                          supported_languages: p.supported_languages.filter(
                            (x) => x.toLowerCase() !== c.toLowerCase(),
                          ),
                        }))
                      }
                    >
                      {c} ×
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <span className="text-xs font-medium text-gray-700">Supported currencies</span>
              <span className="text-[11px] text-gray-500">Checkout and preference pickers use this ∩ active ISO currencies.</span>
            </div>
            {!isoLoading && (
              <input
                type="search"
                value={supportedCurrencyFilter}
                onChange={(e) => setSupportedCurrencyFilter(e.target.value)}
                placeholder="Filter by code, name, or symbol…"
                autoComplete="off"
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
            {isoLoading ? (
              <div className="max-h-56 animate-pulse rounded border border-gray-200 bg-gray-100 px-3 py-8 text-center text-sm text-gray-400">
                Loading…
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded border border-gray-200 p-2">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {activeCurrencies.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-gray-500">
                      No active currencies in ISO reference data.
                    </p>
                  ) : filteredCurrenciesForGrid.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-sm text-gray-500">
                      No currencies match this filter.
                    </p>
                  ) : null}
                  {filteredCurrenciesForGrid.map((c) => {
                    const code = c.code.toUpperCase();
                    const checked = localization.supported_currencies.some((x) => x.toUpperCase() === code);
                    const isDefault = localization.default_currency.trim().toUpperCase() === code;
                    return (
                      <label
                        key={c.code}
                        className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm ${isDefault ? "bg-indigo-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                          checked={checked || isDefault}
                          disabled={isDefault}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setLocalization((p) => {
                              const set = new Set(p.supported_currencies.map((x) => x.toUpperCase()));
                              if (on) set.add(code);
                              else set.delete(code);
                              return {
                                ...p,
                                supported_currencies: Array.from(set).sort(),
                              };
                            });
                          }}
                        />
                        <span className="font-mono text-gray-800">
                          {c.code}
                          <span className="ml-1 font-sans text-gray-600">{c.name}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {orphanSupportedCurrencies.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-800">
                Saved codes not in the active ISO list:{" "}
                {orphanSupportedCurrencies.map((c, i) => (
                  <span key={c}>
                    {i > 0 ? ", " : ""}
                    <button
                      type="button"
                      className="font-mono text-indigo-700 underline"
                      onClick={() =>
                        setLocalization((p) => ({
                          ...p,
                          supported_currencies: p.supported_currencies.filter(
                            (x) => x.toUpperCase() !== c.toUpperCase(),
                          ),
                        }))
                      }
                    >
                      {c} ×
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">At-home arrival verification</h3>
        <p className="mb-4 text-xs text-gray-600">
          House-call PIN/QR verification, provider override escape hatch, and guest portal link delivery for shadow
          customers.
        </p>
        <div className="space-y-3">
          {(
            [
              ["otp_enabled", "Enable arrival PIN (customer shows code to provider)"],
              ["qr_code_enabled", "Enable arrival QR verification"],
              ["require_verification", "Require verification before service start"],
              ["allow_provider_override", "Allow provider manual override when customer cannot verify"],
              ["guest_link_email_enabled", "Email guest portal links to shadow customers"],
              ["guest_link_sms_enabled", "SMS guest portal links when no real email"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={verification[key]}
                onChange={(e) => setVerification((p) => ({ ...p, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Provider features</h3>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={features.auto_approve_providers}
            onChange={(e) => setFeatures((p) => ({ ...p, auto_approve_providers: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Auto-approve new providers (skip manual review)</span>
        </label>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Social login availability</h3>
        <p className="mb-4 text-xs text-gray-600">
          Controls whether social sign-in buttons are shown in first-party apps. Provider credentials are still managed in
          Supabase and provider dashboards.
        </p>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={socialAuth.google}
              onChange={(e) => setSocialAuth((p) => ({ ...p, google: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-700">Enable Google login/signup</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={socialAuth.apple}
              onChange={(e) => setSocialAuth((p) => ({ ...p, apple: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-700">Enable Apple login/signup</span>
          </label>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-3 flex items-start gap-2">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Email auth (Supabase)</h3>
            <p className="mt-1 text-xs text-gray-600">
              Record the same options you use under Supabase → Authentication so operators have a single checklist.
              Live enforcement is still in your Supabase project: update both when you change policy.
            </p>
          </div>
        </div>
        <div className="mb-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.email_provider_enabled}
              onChange={(e) => setAuth((p) => ({ ...p, email_provider_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Enable email provider (email sign up and sign in)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.secure_email_change}
              onChange={(e) => setAuth((p) => ({ ...p, secure_email_change: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Secure email change (confirm on both old and new address)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.secure_password_change}
              onChange={(e) => setAuth((p) => ({ ...p, secure_password_change: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">
              Secure password change (must be recently logged in to change password without reauthentication)
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.require_current_password}
              onChange={(e) => setAuth((p) => ({ ...p, require_current_password: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Require current password when updating password</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.prevent_leaked_passwords}
              onChange={(e) => setAuth((p) => ({ ...p, prevent_leaked_passwords: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Prevent use of leaked passwords (HaveIBeenPwned — Supabase Pro+)</span>
          </label>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Minimum password length</label>
            <input
              type="number"
              min={6}
              max={128}
              value={auth.minimum_password_length}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setAuth((p) => ({ ...p, minimum_password_length: n }));
              }}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-gray-500">Minimum 6 in Supabase; 8+ is often recommended.</p>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Password requirements (character rules)</label>
            <select
              value={auth.password_requirements}
              onChange={(e) =>
                setAuth((p) => ({
                  ...p,
                  password_requirements: e.target.value as SupabaseAuthPolicyForm["password_requirements"],
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="none">No required character classes (default)</option>
              <option value="letters_and_digits">Letters and digits</option>
              <option value="lowercase_uppercase_number">Lowercase, uppercase, and numbers</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Email OTP / link expiration (seconds)</label>
            <input
              type="number"
              min={120}
              max={604800}
              value={auth.email_otp_expiration_seconds}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setAuth((p) => ({ ...p, email_otp_expiration_seconds: n }));
              }}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Email OTP length (digits)</label>
            <input
              type="number"
              min={4}
              max={10}
              value={auth.email_otp_length}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setAuth((p) => ({ ...p, email_otp_length: n }));
              }}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-3 flex items-start gap-2">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Phone auth (Supabase)</h3>
            <p className="mt-1 text-xs text-gray-600">
              Match <strong>Authentication → Phone</strong> in the Supabase dashboard. The Beautonomi apps read these
              values from the public config bundle to show or hide phone sign-in and to align SMS OTP copy. SMS still
              sends through Supabase; Twilio credentials you configure in Supabase (or in platform secrets below) are
              the live send path.
            </p>
          </div>
        </div>
        <div className="mb-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.phone_provider_enabled}
              onChange={(e) => setAuth((p) => ({ ...p, phone_provider_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Enable phone provider (phone-based login)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={auth.phone_confirmations_enabled}
              onChange={(e) => setAuth((p) => ({ ...p, phone_confirmations_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm text-gray-800">Enable phone confirmations (require verified phone before sign-in)</span>
          </label>
        </div>
        <div className="mb-1 text-xs font-medium text-gray-700">SMS provider</div>
        <p className="mb-3 text-xs text-gray-500">Supabase currently wires SMS through Twilio in most setups.</p>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">SMS OTP expiry (seconds)</label>
            <input
              type="number"
              min={30}
              max={86400}
              value={auth.sms_otp_expiration_seconds}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setAuth((p) => ({ ...p, sms_otp_expiration_seconds: n }));
              }}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-gray-500">Default 120s in Supabase; must match your project.</p>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">SMS OTP length (digits)</label>
            <input
              type="number"
              min={4}
              max={10}
              value={auth.sms_otp_length}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setAuth((p) => ({ ...p, sms_otp_length: n }));
              }}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-xs font-medium text-gray-700">SMS message template</label>
            <textarea
              value={auth.sms_message_template}
              onChange={(e) => setAuth((p) => ({ ...p, sms_message_template: e.target.value }))}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Use <code className="rounded bg-gray-100 px-1">{"{{ .Code }}"}</code> for the OTP placeholder (Supabase
              / Twilio).
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-1 text-sm font-semibold text-gray-900">Twilio (SMS for Supabase Auth)</h3>
        <p className="mb-4 text-xs text-gray-600">
          <strong>Account SID</strong> and <strong>auth token</strong> are stored in{" "}
          <code className="rounded bg-gray-100 px-1">platform_secrets</code> (never in public config). Enter them here
          to keep this admin in sync with what you paste under Supabase → Phone → Twilio. <strong>Message Service SID</strong>{" "}
          and <strong>Content SID</strong> are saved in public <code className="rounded bg-gray-100 px-1">settings.twilio</code>{" "}
          for your records.
        </p>
        <label className="mb-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={twilio.enabled}
            onChange={(e) => setTwilio((p) => ({ ...p, enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Mark Twilio integration as configured (for your team’s checklist only)</span>
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {inp("Twilio Account SID", twilio.account_sid, (v) => setTwilio((p) => ({ ...p, account_sid: v })))}
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Twilio auth token</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Leave blank to keep saved token"
              value={twilio.auth_token}
              onChange={(e) => setTwilio((p) => ({ ...p, auth_token: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {inp(
            "Twilio Message Service SID",
            twilio.message_service_sid,
            (v) => setTwilio((p) => ({ ...p, message_service_sid: v })),
          )}
          {inp("Twilio Content SID (optional, WhatsApp)", twilio.content_sid, (v) => setTwilio((p) => ({ ...p, content_sid: v })))}
          {inp("SMS from (E.164 / sender)", twilio.sms_from, (v) => setTwilio((p) => ({ ...p, sms_from: v })))}
          {inp("WhatsApp from (optional)", twilio.whatsapp_from, (v) => setTwilio((p) => ({ ...p, whatsapp_from: v })))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-1 text-sm font-semibold text-gray-900">OneSignal (push / email / SMS)</h3>
        <p className="mb-4 text-xs text-gray-600">
          Same fields as the legacy Next.js platform settings. REST keys are stored only in{" "}
          <code className="rounded bg-gray-100 px-1">platform_secrets</code> — leave blank to keep the current key. For
          channel toggles and tests, also use{" "}
          <Link to={adminSpaTo("/admin/notifications")} className="font-medium text-indigo-700 underline">
            Notifications
          </Link>
          . Transactional email (queue, guest links) is configured under{" "}
          <Link to={adminSpaTo("/admin/integrations/resend")} className="font-medium text-indigo-700 underline">
            Resend
          </Link>
          .
        </p>
        <label className="mb-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={onesignal.enabled}
            onChange={(e) => setOnesignal((p) => ({ ...p, enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Enable OneSignal for server-side sends</span>
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {inp("Customer app ID", onesignal.app_id, (v) => setOnesignal((p) => ({ ...p, app_id: v })))}
          {inp("Provider app ID", onesignal.app_id_provider, (v) => setOnesignal((p) => ({ ...p, app_id_provider: v })))}
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Customer REST API key</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Leave blank to keep saved key"
              value={onesignal.rest_api_key}
              onChange={(e) => setOnesignal((p) => ({ ...p, rest_api_key: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Provider REST API key</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Leave blank to keep saved key"
              value={onesignal.rest_api_key_provider}
              onChange={(e) => setOnesignal((p) => ({ ...p, rest_api_key_provider: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </AdminPanel>

      {saveError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
      )}
      {saved && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved!</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="rounded bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
