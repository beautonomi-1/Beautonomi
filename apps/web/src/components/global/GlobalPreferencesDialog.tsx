"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useTranslation, getLanguageDirection, getLanguageMeta, preferredLanguageFromDevice } from "@beautonomi/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useLanguageOptions, type LanguageOption } from "@/hooks/useLanguageOptions";
import {
  useGlobalPreferences,
  type PreferenceSurface,
} from "@/hooks/useGlobalPreferences";
import { useDisplayMoney } from "@/hooks/useDisplayMoney";
import { useMediaQueryMatch, TW_MD_MIN_QUERY } from "@/hooks/useMediaQueryMatch";
import { cn } from "@/lib/utils";
import { CookieSettingsFooterLink } from "@/components/cookie-consent/CookieSettingsFooterLink";

type PreferenceTab = "language" | "currency";

export type GlobalPreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface?: PreferenceSurface;
  defaultTab?: PreferenceTab;
};

function CurrencyExample({ chargeCurrency, displayCurrency }: { chargeCurrency: string; displayCurrency: string }) {
  const { t } = useTranslation();
  const { formattedCharge, formattedDisplay, approxLabel, loading } = useDisplayMoney(
    100,
    chargeCurrency,
    displayCurrency,
  );
  if (chargeCurrency === displayCurrency) return null;
  return (
    <p className="text-sm text-[#717171] mt-2">
      {t("web.preferences.currencyExample", {
        charge: formattedCharge,
        approx: loading ? "…" : `${approxLabel ?? "≈"} ${formattedDisplay ?? ""}`,
      })}
    </p>
  );
}

function PreferenceCard({
  active,
  disabled,
  onSelect,
  onFocus,
  tabIndex,
  children,
  role,
}: {
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onFocus?: () => void;
  tabIndex?: number;
  children: React.ReactNode;
  role?: "option";
}) {
  return (
    <button
      type="button"
      {...(role ? { role, "aria-selected": active } : { "aria-pressed": active })}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onSelect}
      onFocus={onFocus}
      className={cn(
        "w-full text-start rounded-xl px-4 py-3.5 min-h-[72px] transition-colors motion-reduce:transition-none",
        active
          ? "border-2 border-[#222222] bg-white"
          : "border-2 border-[#EBEBEB] hover:bg-[#F7F7F7] hover:border-[#DDDDDD]",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function LanguageCard({
  lang,
  active,
  saving,
  onSelect,
  onFocus,
  tabIndex,
  listed = true,
}: {
  lang: LanguageOption;
  active: boolean;
  saving: boolean;
  onSelect: () => void;
  onFocus: () => void;
  tabIndex: number;
  listed?: boolean;
}) {
  const { t } = useTranslation();
  const meta = getLanguageMeta(lang.code);
  const isRtl = getLanguageDirection(lang.code) === "rtl";
  const primary = meta?.nativeName ?? lang.name.split(" (")[0];
  const secondary = meta?.name ?? lang.name.match(/\(([^)]+)\)/)?.[1] ?? lang.code;

  return (
    <PreferenceCard
      active={active}
      disabled={Boolean(saving)}
      onSelect={onSelect}
      onFocus={onFocus}
      tabIndex={tabIndex}
      role={listed ? "option" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[16px] leading-5 font-medium text-[#222222] truncate">{primary}</div>
          <div className="text-[14px] leading-5 text-[#717171] truncate mt-0.5">{secondary}</div>
        </div>
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-[#717171] shrink-0 mt-1" /> : null}
        {isRtl && !saving ? (
          <span className="text-[10px] uppercase tracking-wide text-[#717171] shrink-0 mt-1">
            {t("web.preferences.rtlBadge")}
          </span>
        ) : null}
      </div>
    </PreferenceCard>
  );
}

function PreferencesPanel({
  surface,
  defaultTab,
}: {
  surface: PreferenceSurface;
  defaultTab: PreferenceTab;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PreferenceTab>(defaultTab);
  const [search, setSearch] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [focusedLangIndex, setFocusedLangIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { waveA, waveB, loading: langsLoading, error: langsError, retry: retryLangs } =
    useLanguageOptions(true);
  const prefs = useGlobalPreferences({ open: true, surface });

  const filterLang = useCallback(
    (lang: LanguageOption) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const meta = getLanguageMeta(lang.code);
      return (
        lang.code.toLowerCase().includes(q) ||
        lang.name.toLowerCase().includes(q) ||
        (meta?.nativeName?.toLowerCase().includes(q) ?? false) ||
        (meta?.name?.toLowerCase().includes(q) ?? false)
      );
    },
    [search],
  );

  const filteredWaveA = useMemo(() => waveA.filter(filterLang), [waveA, filterLang]);
  const filteredWaveB = useMemo(() => waveB.filter(filterLang), [waveB, filterLang]);
  const flatLanguages = useMemo(
    () => [...filteredWaveA, ...filteredWaveB],
    [filteredWaveA, filteredWaveB],
  );

  const suggestedLanguages = useMemo(() => {
    if (search.trim()) return [];
    const seen = new Set<string>();
    const out: LanguageOption[] = [];
    const browser =
      typeof navigator !== "undefined" ? preferredLanguageFromDevice(navigator.language) : "en";
    const prefer = [prefs.currentLanguage, browser, "en"];
    for (const code of prefer) {
      const match = [...waveA, ...waveB].find((lang) => lang.code === code);
      if (match && !seen.has(match.code)) {
        seen.add(match.code);
        out.push(match);
      }
    }
    for (const lang of waveA) {
      if (out.length >= 4) break;
      if (!seen.has(lang.code)) {
        seen.add(lang.code);
        out.push(lang);
      }
    }
    return out;
  }, [prefs.currentLanguage, search, waveA, waveB]);

  const filteredCurrencies = useMemo(() => {
    if (!search.trim() || tab !== "currency") return prefs.currencies;
    const q = search.trim().toLowerCase();
    return prefs.currencies.filter(
      (cur) =>
        cur.code.toLowerCase().includes(q) ||
        cur.label.toLowerCase().includes(q) ||
        cur.name.toLowerCase().includes(q),
    );
  }, [prefs.currencies, search, tab]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const handleLanguageSelect = async (code: string) => {
    await prefs.saveLanguage(code);
    const meta = getLanguageMeta(code);
    setLiveMessage(
      t("web.preferences.languageChangedLive", {
        language: meta?.nativeName ?? code,
      }),
    );
  };

  const handleCurrencySelect = async (code: string) => {
    await prefs.saveCurrency(code);
    setLiveMessage(t("web.preferences.currencyChangedLive", { currency: code }));
  };

  const onLanguageKeyDown = (e: React.KeyboardEvent) => {
    if (flatLanguages.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedLangIndex((i) => Math.min(i + 1, flatLanguages.length - 1));
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedLangIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const lang = flatLanguages[focusedLangIndex];
      if (lang) void handleLanguageSelect(lang.code);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-lang-index="${focusedLangIndex}"]`);
    el?.focus();
  }, [focusedLangIndex]);

  const tabs: { id: PreferenceTab; label: string }[] = [
    { id: "language", label: t("web.preferences.languageTab") },
    { id: "currency", label: t("web.preferences.currencyTab") },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      <div className="flex gap-6 border-b border-[#EBEBEB] mb-6 shrink-0 overflow-x-auto" role="tablist">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(item.id);
                setSearch("");
              }}
              className={cn(
                "relative pb-3 text-[15px] whitespace-nowrap transition-colors",
                active ? "font-semibold text-[#222222]" : "font-medium text-[#717171] hover:text-[#222222]",
              )}
            >
              {item.label}
              {active ? <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[#222222]" /> : null}
            </button>
          );
        })}
      </div>

      {tab === "language" ? (
        <div className="flex flex-col min-h-0 flex-1">
          <div className="relative mb-5 shrink-0">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#717171]" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusedLangIndex(0);
              }}
              placeholder={t("web.preferences.searchLanguages")}
              aria-label={t("web.preferences.searchLanguages")}
              className="w-full h-12 rounded-xl bg-[#F7F7F7] border-0 ps-11 pe-4 text-[15px] text-[#222222] placeholder:text-[#717171] focus:outline-none focus:ring-2 focus:ring-[#222222]"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label={t("web.preferences.languageTab")}
            className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 pb-2"
            onKeyDown={onLanguageKeyDown}
          >
            {langsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-[#F7F7F7] animate-pulse" />
                ))}
              </div>
            ) : langsError ? (
              <div className="p-6 text-center text-sm text-[#717171]">
                <p className="mb-3">{t("web.preferences.loadFailed")}</p>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={retryLangs}>
                  {t("web.preferences.retry")}
                </Button>
              </div>
            ) : (
              <>
                {suggestedLanguages.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-[16px] font-semibold text-[#222222] mb-2">
                      {t("web.preferences.suggested")}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {suggestedLanguages.map((lang) => (
                        <LanguageCard
                          key={`suggested-${lang.code}`}
                          lang={lang}
                          active={prefs.currentLanguage === lang.code}
                          saving={prefs.savingLanguage === lang.code}
                          onSelect={() => void handleLanguageSelect(lang.code)}
                          onFocus={() => {}}
                          tabIndex={-1}
                          listed={false}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <h3 className="text-[16px] font-semibold text-[#222222] mb-2">
                  {t("web.preferences.chooseLanguage")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {filteredWaveA.map((lang, index) => (
                    <div key={lang.code} data-lang-index={index}>
                      <LanguageCard
                        lang={lang}
                        active={prefs.currentLanguage === lang.code}
                        saving={prefs.savingLanguage === lang.code}
                        onSelect={() => void handleLanguageSelect(lang.code)}
                        onFocus={() => setFocusedLangIndex(index)}
                        tabIndex={focusedLangIndex === index ? 0 : -1}
                      />
                    </div>
                  ))}
                </div>
                {filteredWaveB.length > 0 ? (
                  <div className="mt-6">
                    <p className="text-[16px] font-semibold text-[#222222] mb-1">
                      {t("web.preferences.internationalLanguages")}
                    </p>
                    <p className="text-[13px] text-[#717171] mb-2">
                      {t("web.preferences.touristNote")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {filteredWaveB.map((lang, bi) => {
                        const index = filteredWaveA.length + bi;
                        return (
                          <div key={lang.code} data-lang-index={index}>
                            <LanguageCard
                              lang={lang}
                              active={prefs.currentLanguage === lang.code}
                              saving={prefs.savingLanguage === lang.code}
                              onSelect={() => void handleLanguageSelect(lang.code)}
                              onFocus={() => setFocusedLangIndex(index)}
                              tabIndex={focusedLangIndex === index ? 0 : -1}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {flatLanguages.length === 0 ? (
                  <p className="text-sm text-[#717171] text-center py-10">{t("web.preferences.noLanguages")}</p>
                ) : null}
                <p className="text-xs text-[#717171] mt-6">{t("web.preferences.translationNote")}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "currency" ? (
        <div className="flex flex-col min-h-0 flex-1">
          <p className="text-sm text-[#717171] mb-2 shrink-0">
            {t("web.preferences.currencyScope", {
              display: prefs.displayCurrency,
              charge: prefs.chargeCurrency,
            })}
          </p>
          <CurrencyExample chargeCurrency={prefs.chargeCurrency} displayCurrency={prefs.displayCurrency} />
          <div className="relative my-5 shrink-0">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#717171]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("web.preferences.searchCurrencies")}
              aria-label={t("web.preferences.searchCurrencies")}
              className="w-full h-12 rounded-xl bg-[#F7F7F7] border-0 ps-11 pe-4 text-[15px] text-[#222222] placeholder:text-[#717171] focus:outline-none focus:ring-2 focus:ring-[#222222]"
            />
          </div>
          <div
            role="listbox"
            aria-label={t("web.preferences.currencyTab")}
            className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 pb-2"
          >
            {prefs.currenciesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-[#F7F7F7] animate-pulse" />
                ))}
              </div>
            ) : prefs.currenciesError ? (
              <div className="p-6 text-center text-sm text-[#717171]">
                <p className="mb-3">{t("web.preferences.loadFailed")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => void prefs.reloadCurrencies()}
                >
                  {t("web.preferences.retry")}
                </Button>
              </div>
            ) : (
              <>
                <h3 className="text-[16px] font-semibold text-[#222222] mb-2">
                  {t("web.preferences.chooseCurrency")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {filteredCurrencies.map((cur) => {
                    const active = prefs.displayCurrency === cur.code;
                    return (
                      <PreferenceCard
                        key={cur.code}
                        role="option"
                        active={active}
                        disabled={Boolean(prefs.savingCurrency)}
                        onSelect={() => void handleCurrencySelect(cur.code)}
                      >
                        <div className="text-[16px] leading-5 font-medium text-[#222222]">{cur.label}</div>
                        <div className="text-[14px] leading-5 text-[#717171] mt-0.5">
                          {cur.name}
                          {cur.isDefault ? ` · ${t("web.preferences.marketDefault")}` : ""}
                        </div>
                        {prefs.savingCurrency === cur.code ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#717171] mt-1" />
                        ) : null}
                      </PreferenceCard>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-[#EBEBEB] shrink-0">
            <CookieSettingsFooterLink variant="inline" className="text-xs" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreferencesChrome({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative px-6 pt-6 pb-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="absolute end-5 top-5 h-8 w-8 rounded-full hover:bg-[#F7F7F7] flex items-center justify-center text-[#222222]"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-[22px] leading-7 font-semibold text-[#222222] pe-10">{title}</h2>
      </div>
      <div className="px-6 pb-6 pt-2 overflow-hidden flex flex-col min-h-0 flex-1">{children}</div>
    </>
  );
}

export function GlobalPreferencesDialog({
  open,
  onOpenChange,
  surface = "header",
  defaultTab = "language",
}: GlobalPreferencesDialogProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQueryMatch(TW_MD_MIN_QUERY);
  const title = t("web.preferences.title");

  if (isDesktop === false) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] rounded-t-[24px] p-0 gap-0 overflow-hidden flex flex-col motion-reduce:transition-none [&>button]:hidden"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#DDDDDD] shrink-0" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <PreferencesChrome title={title} onClose={() => onOpenChange(false)}>
            <PreferencesPanel surface={surface} defaultTab={defaultTab} />
          </PreferencesChrome>
        </SheetContent>
      </Sheet>
    );
  }

  if (isDesktop === null) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        suppressFallbackTitle
        className="max-w-[780px] sm:max-w-[780px] sm:rounded-[32px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden motion-reduce:transition-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <PreferencesChrome title={title} onClose={() => onOpenChange(false)}>
          <PreferencesPanel surface={surface} defaultTab={defaultTab} />
        </PreferencesChrome>
      </DialogContent>
    </Dialog>
  );
}

/** Provider wrapper so header/footer can share one dialog instance */
export function GlobalPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<PreferenceSurface>("header");
  const [defaultTab, setDefaultTab] = useState<PreferenceTab>("language");

  const openPreferences = useCallback(
    (opts?: { surface?: PreferenceSurface; tab?: PreferenceTab }) => {
      if (opts?.surface) setSurface(opts.surface);
      if (opts?.tab) setDefaultTab(opts.tab);
      setOpen(true);
    },
    [],
  );

  return (
    <GlobalPreferencesContext.Provider value={{ openPreferences }}>
      {children}
      <GlobalPreferencesDialog
        open={open}
        onOpenChange={setOpen}
        surface={surface}
        defaultTab={defaultTab}
      />
    </GlobalPreferencesContext.Provider>
  );
}

type GlobalPreferencesContextValue = {
  openPreferences: (opts?: {
    surface?: PreferenceSurface;
    tab?: PreferenceTab;
  }) => void;
};

const GlobalPreferencesContext = React.createContext<GlobalPreferencesContextValue | null>(null);

export function useOpenGlobalPreferences() {
  const ctx = React.useContext(GlobalPreferencesContext);
  return ctx?.openPreferences ?? (() => {});
}
