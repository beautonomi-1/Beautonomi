"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation, getLanguageMeta, normalizeLanguageCode, ensureLocaleResources } from "@beautonomi/i18n";
import { currencySelectLabel, normalizeCurrencyCode } from "@beautonomi/utils";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import { persistClientLanguage } from "@/lib/locale/persist-client-language";
import { persistClientDisplayCurrency } from "@/lib/locale/persist-client-display-currency";
import { useAuth } from "@/providers/AuthProvider";
import { useCookieConsent } from "@/providers/CookieConsentProvider";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useAmplitude } from "@/hooks/useAmplitude";
import {
  EVENT_LOCALE_DISPLAY_CURRENCY_CHANGED,
  EVENT_LOCALE_LANGUAGE_CHANGED,
} from "@/lib/analytics/amplitude/types";
import { toast } from "sonner";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { mergeBrowseDisplayCurrencyCodes } from "@/lib/preferences/browse-display-currencies";

export type CurrencyOption = {
  code: string;
  name: string;
  label: string;
  isDefault: boolean;
};

export type PreferenceSurface = "header" | "footer" | "account" | "navbar" | "mobile";

type UseGlobalPreferencesArgs = {
  open: boolean;
  surface: PreferenceSurface;
};

function toCurrencyOptions(codes: string[], tenantCurrency: string): CurrencyOption[] {
  return codes.map((code) => ({
    code,
    name: code,
    label: currencySelectLabel(code),
    isDefault: code === tenantCurrency,
  }));
}

export function useGlobalPreferences({ open, surface }: UseGlobalPreferencesArgs) {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { track, isReady: analyticsReady } = useAmplitude();
  const { allowsFunctional } = useCookieConsent();
  const locale = useLocale();
  const tenantCurrency =
    locale.chargeCurrency?.trim().toUpperCase() || LAST_RESORT_CURRENCY;

  const [currencies, setCurrencies] = useState<CurrencyOption[]>(() =>
    toCurrencyOptions(mergeBrowseDisplayCurrencyCodes([], tenantCurrency), tenantCurrency),
  );
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [currenciesError, setCurrenciesError] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadCurrencies = useCallback(async () => {
    setCurrenciesLoading(true);
    setCurrenciesError(false);
    try {
      const res = await fetcher.get<{
        data?: Array<{ code: string; name: string; metadata?: Record<string, unknown> }>;
      }>("/api/public/preference-options?type=currency", { staleTimeMs: 10 * 60_000 });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const mapped: CurrencyOption[] = rows.map((r) => {
        const code = normalizeCurrencyCode(r.code);
        return {
          code,
          name: r.name,
          label: currencySelectLabel(code),
          isDefault: code === tenantCurrency,
        };
      });
      if (mapped.length === 0) {
        setCurrencies(
          toCurrencyOptions(mergeBrowseDisplayCurrencyCodes([], tenantCurrency), tenantCurrency),
        );
      } else {
        const sorted = [...mapped].sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.code.localeCompare(b.code);
        });
        setCurrencies(sorted);
      }
      setLoaded(true);
    } catch {
      setCurrencies(
        toCurrencyOptions(mergeBrowseDisplayCurrencyCodes([], tenantCurrency), tenantCurrency),
      );
      setCurrenciesError(false);
      setLoaded(true);
    } finally {
      setCurrenciesLoading(false);
    }
  }, [tenantCurrency]);

  useEffect(() => {
    if (open && !loaded) void loadCurrencies();
  }, [open, loaded, loadCurrencies]);

  const trackPreference = useCallback(
    (event: string, from: string, to: string) => {
      if (!analyticsReady) return;
      track(event, {
        from,
        to,
        surface,
        authenticated: Boolean(user),
      });
    },
    [analyticsReady, track, surface, user],
  );

  const saveLanguage = useCallback(
    async (code: string) => {
      const from = normalizeLanguageCode(i18n.language);
      // Trust the picker: do not re-resolve against a stale/placeholder allowlist.
      const resolved = normalizeLanguageCode(code);
      if (resolved === from) return;
      setSavingLanguage(resolved);
      try {
        await ensureLocaleResources(i18n, resolved);
        await i18n.changeLanguage(resolved);
        persistClientLanguage(resolved);
        if (user) {
          void fetcher.post("/api/me/preferences", { language: resolved }).catch(() => {});
        }
        trackPreference(EVENT_LOCALE_LANGUAGE_CHANGED, from, resolved);
        const meta = getLanguageMeta(resolved);
        toast.success(
          t("web.preferences.languageChanged", {
            language: meta?.nativeName ?? resolved,
          }),
        );
        router.refresh();
      } finally {
        setSavingLanguage(null);
      }
    },
    [i18n, user, trackPreference, t, router],
  );

  const saveCurrency = useCallback(
    async (code: string) => {
      const normalized = normalizeCurrencyCode(code);
      const from = locale.displayCurrency;
      if (normalized === from) return;
      setSavingCurrency(normalized);
      try {
        if (allowsFunctional) {
          persistClientDisplayCurrency(normalized);
        } else {
          window.dispatchEvent(
            new CustomEvent("beautonomi:preferred-display-currency-changed", {
              detail: { currency: normalized },
            }),
          );
        }
        if (user) {
          void fetcher.patch("/api/me/profile", { preferred_currency: normalized }).catch(() => {});
        }
        trackPreference(EVENT_LOCALE_DISPLAY_CURRENCY_CHANGED, from, normalized);
        toast.success(t("web.preferences.currencyChanged", { currency: normalized }));
        if (!allowsFunctional && !user) {
          toast.message(t("web.preferences.currencySessionOnly"), {
            description: t("web.preferences.enableFunctionalCookies"),
          });
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("web.preferences.saveFailed"));
      } finally {
        setSavingCurrency(null);
      }
    },
    [locale.displayCurrency, allowsFunctional, user, trackPreference, t, router],
  );

  return {
    currencies,
    currenciesLoading,
    currenciesError,
    reloadCurrencies: loadCurrencies,
    savingLanguage,
    savingCurrency,
    saveLanguage,
    saveCurrency,
    tenantCurrency,
    chargeCurrency: locale.chargeCurrency,
    displayCurrency: locale.displayCurrency,
    currentLanguage: normalizeLanguageCode(i18n.language),
  };
}
