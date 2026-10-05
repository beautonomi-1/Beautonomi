"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";

export type OnlineBookingSettings = {
  max_advance_days?: number;
  staff_selection_mode?: string;
  require_auth_step?: "checkout" | "before_time_selection";
  allow_online_waitlist?: boolean;
  tips_enabled?: boolean;
};

export type BookingProviderContext = {
  provider: {
    id: string;
    slug: string;
    business_name?: string;
    timezone?: string | null;
    online_booking_enabled?: boolean;
  } | null;
  onlineBookingSettings: OnlineBookingSettings | null;
  hasProviderForms: boolean | null;
  hasBookingCustomFields: boolean | null;
  loading: boolean;
};

export function useBookingProviderContext(
  providerSlug: string | null,
  providerId: string | undefined,
): BookingProviderContext {
  const [provider, setProvider] = useState<BookingProviderContext["provider"]>(null);
  const [onlineBookingSettings, setOnlineBookingSettings] =
    useState<OnlineBookingSettings | null>(null);
  const [hasProviderForms, setHasProviderForms] = useState<boolean | null>(null);
  const [hasBookingCustomFields, setHasBookingCustomFields] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providerSlug?.trim()) {
      setProvider(null);
      setOnlineBookingSettings(null);
      setHasProviderForms(null);
      setHasBookingCustomFields(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [provRes, settingsRes] = await Promise.all([
          fetcher.get<{ data: BookingProviderContext["provider"] }>(
            `/api/public/providers/${encodeURIComponent(providerSlug)}`,
          ),
          fetcher
            .get<{ data: OnlineBookingSettings }>(
              `/api/public/providers/${encodeURIComponent(providerSlug)}/online-booking-settings`,
            )
            .catch(() => ({ data: null as OnlineBookingSettings | null })),
        ]);
        if (cancelled) return;
        setProvider(provRes.data ?? null);
        setOnlineBookingSettings(settingsRes.data ?? null);

        const pid = providerId ?? provRes.data?.id;
        if (!pid) {
          setHasProviderForms(false);
          setHasBookingCustomFields(false);
          return;
        }
        const [formsRes, defsRes] = await Promise.all([
          fetch(
            `/api/public/provider-forms?provider_id=${encodeURIComponent(pid)}`,
          )
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})),
          fetch("/api/custom-fields/definitions?entity_type=booking")
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})),
        ]);
        if (cancelled) return;
        const forms = Array.isArray((formsRes as { data?: { forms?: unknown[] } })?.data?.forms)
          ? (formsRes as { data: { forms: unknown[] } }).data.forms
          : Array.isArray((formsRes as { forms?: unknown[] }).forms)
            ? (formsRes as { forms: unknown[] }).forms
            : [];
        const defs = Array.isArray(
          (defsRes as { data?: { definitions?: unknown[] } })?.data?.definitions,
        )
          ? (defsRes as { data: { definitions: unknown[] } }).data.definitions
          : [];
        setHasProviderForms(forms.length > 0);
        setHasBookingCustomFields(defs.length > 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerSlug, providerId]);

  return {
    provider,
    onlineBookingSettings,
    hasProviderForms,
    hasBookingCustomFields,
    loading,
  };
}
