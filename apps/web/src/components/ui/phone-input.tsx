"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  normalizePhoneToE164,
  splitValueForPhoneInput,
  nationalDigitsValidationMessage,
  isCompleteE164,
} from "@/lib/phone";
import {
  STATIC_PHONE_COUNTRIES,
  mergePhoneCountries,
  resolveIsoFromDial,
  defaultIsoFromDial,
  type PhoneCountryRow,
} from "@/lib/phone-input-countries";
import { useDefaultPhoneDialCode } from "@/hooks/use-default-phone-dial";
import { Check, ChevronDown, Phone, Search } from "lucide-react";

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onCountryCodeChange?: (countryCode: string) => void;
  /** Omit or leave unset for "Phone Number". Pass `""` to hide the built-in label when you use an external `<Label>`. */
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountryCode?: string;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  inputId?: string;
  /**
   * When `label` is `""` and you do not use an external `<Label htmlFor={inputId}>`, set this so the
   * number field has an accessible name. Omit when an external label is associated via `id`.
   */
  inputAriaLabel?: string;
}

/** Regional-indicator sequence → flag emoji (fallback when CDN image fails). */
function getCountryFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "🌍";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function filterCountries(rows: PhoneCountryRow[], query: string): PhoneCountryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const qDigits = q.replace(/\D/g, "");
  return rows.filter((c) => {
    const dialDigits = c.phone_country_code.replace(/^\+/, "");
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.phone_country_code.toLowerCase().includes(q) ||
      (qDigits.length > 0 && dialDigits.includes(qDigits)) ||
      (qDigits.length > 0 && c.code.toLowerCase().includes(qDigits))
    );
  });
}

function CountryFlagImage({
  code,
  size = "md",
  className,
}: {
  code: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const iso = code.toLowerCase();
  const h = size === "sm" ? 14 : 18;
  const w = Math.round(h * 1.35);

  if (failed || !/^[a-z]{2}$/.test(iso)) {
    return (
      <span
        className={cn("emoji-flag flex shrink-0 items-center justify-center text-base leading-none", className)}
        aria-hidden
      >
        {getCountryFlagEmoji(code)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN flags; avoids next.config remotePatterns churn
    <img
      alt=""
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      className={cn(
        "shrink-0 rounded-[2px] border border-black/[0.06] object-cover bg-gray-50 shadow-sm dark:border-white/10 dark:bg-neutral-800",
        className
      )}
      onError={() => setFailed(true)}
    />
  );
}

/** Muted helper: what to type (no country code), tuned per region. */
function nationalFormatHint(iso: string | undefined, dial: string): string {
  const u = iso?.toUpperCase() ?? "";
  if (u === "ZA") {
    return `South Africa first: national digits only (omit +27). Example: 82 123 4567 or 082 123 4567.`;
  }
  if (u === "US" || u === "CA") {
    return `Format: 10 digits, area code first — omit ${dial}.`;
  }
  if (u === "GB") {
    return `Format: UK number without ${dial}. Example: 7700 900123.`;
  }
  if (u === "AU" || u === "NZ") {
    return `Format: national number only — omit ${dial}. Spaces optional.`;
  }
  if (u === "IN") {
    return `Format: 10-digit mobile without ${dial}.`;
  }
  if (u === "NG" || u === "KE" || u === "GH") {
    return `Format: national mobile digits only — omit ${dial}.`;
  }
  if (u === "DE" || u === "FR" || u === "NL" || u === "ES" || u === "IT" || u === "PT") {
    return `Format: national number without ${dial}. Drop any leading 0 if your country uses one.`;
  }
  return `Format: enter your number without the country code (${dial}). Digits and spaces only.`;
}

export function PhoneInput({
  value = "",
  onChange,
  onCountryCodeChange,
  label,
  required = false,
  placeholder = "Phone number",
  className,
  disabled = false,
  defaultCountryCode,
  onValidationChange,
  inputId = "phone-input",
  inputAriaLabel,
}: PhoneInputProps) {
  const visibleLabel = label === "" ? null : (label ?? "Phone Number");
  const overrideDial =
    defaultCountryCode != null && String(defaultCountryCode).trim().startsWith("+")
      ? String(defaultCountryCode).trim()
      : undefined;
  const resolvedDial = useDefaultPhoneDialCode(overrideDial);

  const [countries, setCountries] = useState<PhoneCountryRow[]>(STATIC_PHONE_COUNTRIES);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [selectedIsoCode, setSelectedIsoCode] = useState(() =>
    defaultIsoFromDial(resolvedDial, STATIC_PHONE_COUNTRIES)
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastEmittedValueRef = useRef<string>(value);
  const isInitialMount = useRef(true);
  const userPickedIso = useRef(false);

  const selectedDial = useMemo(() => {
    const row = countries.find((c) => c.code === selectedIsoCode);
    return row?.phone_country_code ?? resolvedDial;
  }, [countries, selectedIsoCode, resolvedDial]);

  const selectedCountry = useMemo(() => {
    return countries.find((c) => c.code === selectedIsoCode);
  }, [countries, selectedIsoCode]);

  const filteredCountries = useMemo(
    () => filterCountries(countries, countrySearch),
    [countries, countrySearch]
  );

  useEffect(() => {
    const list = countries.length ? countries : STATIC_PHONE_COUNTRIES;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (value) {
        userPickedIso.current = false;
        const parsed = splitValueForPhoneInput(value, resolvedDial);
        const iso =
          resolveIsoFromDial(parsed.countryCode, list) ??
          defaultIsoFromDial(parsed.countryCode, STATIC_PHONE_COUNTRIES);
        setSelectedIsoCode(iso);
        setPhoneNumber(parsed.national);
      } else {
        userPickedIso.current = false;
        setSelectedIsoCode(defaultIsoFromDial(resolvedDial, list));
        setPhoneNumber("");
      }
      lastEmittedValueRef.current = value;
      return;
    }

    if (value === lastEmittedValueRef.current) {
      return;
    }

    if (value) {
      userPickedIso.current = false;
      const parsed = splitValueForPhoneInput(value, resolvedDial);
      const iso =
        resolveIsoFromDial(parsed.countryCode, list) ??
        defaultIsoFromDial(parsed.countryCode, STATIC_PHONE_COUNTRIES);
      setSelectedIsoCode(iso);
      setPhoneNumber(parsed.national);
    } else {
      userPickedIso.current = false;
      setSelectedIsoCode(defaultIsoFromDial(resolvedDial, list));
      setPhoneNumber("");
    }
    lastEmittedValueRef.current = value;
  }, [value, resolvedDial, countries]);

  useEffect(() => {
    if (value?.trim() || phoneNumber.trim() || userPickedIso.current) return;
    const list = countries.length ? countries : STATIC_PHONE_COUNTRIES;
    setSelectedIsoCode(defaultIsoFromDial(resolvedDial, list));
  }, [resolvedDial, countries, value, phoneNumber]);

  useEffect(() => {
    let cancelled = false;
    async function fetchCountries() {
      try {
        setCountriesLoading(true);
        const response = await fetch("/api/public/countries");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = await response.json();
        const rows = Array.isArray(result.data) ? result.data : [];
        const merged = mergePhoneCountries(rows, STATIC_PHONE_COUNTRIES);
        if (!cancelled) {
          setCountries(merged);
        }
      } catch (e) {
        console.error("Failed to fetch countries:", e);
        if (!cancelled) {
          setCountries(mergePhoneCountries([], STATIC_PHONE_COUNTRIES));
        }
      } finally {
        if (!cancelled) {
          setCountriesLoading(false);
        }
      }
    }

    fetchCountries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (countryOpen) {
      const id = window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
      return () => window.cancelAnimationFrame(id);
    }
    setCountrySearch("");
  }, [countryOpen]);

  const composedE164Preview = useMemo(() => {
    if (!phoneNumber.trim()) return "";
    const dialDigits = selectedDial.replace(/^\+/, "");
    return normalizePhoneToE164(phoneNumber.trim(), dialDigits) ?? "";
  }, [phoneNumber, selectedDial]);

  const formatHelperText = useMemo(
    () => nationalFormatHint(selectedIsoCode, selectedDial),
    [selectedIsoCode, selectedDial]
  );

  const applyCountry = useCallback(
    (iso: string) => {
      userPickedIso.current = true;
      setSelectedIsoCode(iso);
      const dial = countries.find((c) => c.code === iso)?.phone_country_code ?? resolvedDial;
      onCountryCodeChange?.(dial);

      const error = phoneNumber.trim()
        ? nationalDigitsValidationMessage(dial, phoneNumber.trim())
        : "";
      setValidationError(error);
      onValidationChange?.(!error, error || undefined);

      const dialDigits = dial.replace(/^\+/, "");
      const e164 = phoneNumber.trim()
        ? normalizePhoneToE164(phoneNumber.trim(), dialDigits)
        : undefined;
      const out = e164 ?? "";
      lastEmittedValueRef.current = out;
      onChange?.(out);
      setCountryOpen(false);
    },
    [countries, resolvedDial, phoneNumber, onChange, onCountryCodeChange, onValidationChange]
  );

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value;
    setPhoneNumber(newNumber);

    const error = newNumber.trim()
      ? nationalDigitsValidationMessage(selectedDial, newNumber.trim())
      : "";
    setValidationError(error);
    onValidationChange?.(!error, error || undefined);

    const dialDigits = selectedDial.replace(/^\+/, "");
    const e164 = newNumber.trim()
      ? normalizePhoneToE164(newNumber.trim(), dialDigits)
      : undefined;
    const out = e164 ?? "";
    lastEmittedValueRef.current = out;
    onChange?.(out);
  };

  const nationalPlaceholder =
    selectedDial === "+27" ? "82 123 4567" : placeholder;

  return (
    <div className={cn("space-y-2", className)}>
      {visibleLabel ? (
        <Label htmlFor={inputId} className="text-sm sm:text-base font-semibold text-gray-900">
          {visibleLabel} {required && <span className="text-primary">*</span>}
        </Label>
      ) : null}

      {/* Airbnb-style: one rounded shell, country row + divider + phone row */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-background transition-[box-shadow,border-color]",
          validationError
            ? "border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.2)]"
            : "border-gray-200 shadow-sm dark:border-neutral-700",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
        )}
      >
        <Popover modal={false} open={countryOpen} onOpenChange={setCountryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || countriesLoading}
              className={cn(
                "flex w-full min-w-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 text-left transition-colors",
                "hover:bg-gray-50/80 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-900/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25",
                (disabled || countriesLoading) && "cursor-not-allowed opacity-60"
              )}
              aria-expanded={countryOpen}
              aria-haspopup="listbox"
              aria-label="Country or region"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                  Country code
                </span>
                <span className="flex min-w-0 items-center gap-2.5 text-[15px] font-medium text-gray-900 dark:text-neutral-100">
                  {selectedCountry ? (
                    <>
                      <CountryFlagImage code={selectedCountry.code} size="md" />
                      <span className="min-w-0 truncate">
                        {selectedCountry.name}{" "}
                        <span className="tabular-nums text-gray-600 dark:text-neutral-400">
                          ({selectedCountry.phone_country_code})
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-500">Choose country…</span>
                  )}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-gray-500 transition-transform dark:text-neutral-400",
                  countryOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              "z-[10050] flex max-h-[min(90dvh,28rem)] w-[min(calc(100vw-1.5rem),22rem)] flex-col overflow-hidden p-0 shadow-lg",
              "rounded-xl border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-950"
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-gray-100 p-2 dark:border-neutral-800">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden
                  />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Search countries or codes…"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className={cn(
                      "h-10 rounded-lg border-gray-200 bg-gray-50/80 pl-9 text-sm dark:border-neutral-700 dark:bg-neutral-900",
                      "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    )}
                    aria-label="Search countries"
                  />
                </div>
              </div>

              <ScrollArea
                type="always"
                className="min-h-[140px] h-[min(288px,calc(100dvh-12rem))] w-full shrink-0 touch-pan-y overscroll-y-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                <div
                  role="listbox"
                  aria-label="Countries"
                  className="p-1"
                  onWheel={(e) => e.stopPropagation()}
                >
                  {filteredCountries.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-neutral-400">
                      No countries match “{countrySearch.trim()}”.
                    </p>
                  ) : (
                    filteredCountries.map((country) => {
                      const selected = country.code === selectedIsoCode;
                      return (
                        <button
                          key={country.code}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => applyCountry(country.code)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                            "hover:bg-gray-100 dark:hover:bg-neutral-800/90",
                            selected && "bg-primary/5 dark:bg-primary/10"
                          )}
                        >
                          <CountryFlagImage code={country.code} size="md" />
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-neutral-100">
                            {country.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-gray-500 dark:text-neutral-400">
                            {country.phone_country_code}
                          </span>
                          {selected ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                          ) : (
                            <span className="w-4 shrink-0" aria-hidden />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

        <Input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-label={visibleLabel ? undefined : inputAriaLabel}
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
          placeholder={nationalPlaceholder}
          required={required}
          disabled={disabled}
          className={cn(
            "h-12 min-h-[48px] w-full rounded-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none",
            "placeholder:text-gray-400 dark:placeholder:text-neutral-500",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            validationError && "text-red-950 dark:text-red-100"
          )}
        />
      </div>

      <div className="mt-1.5 space-y-1">
        {validationError ? (
          <p className="text-xs font-medium leading-relaxed text-red-600/95 dark:text-red-400/95">{validationError}</p>
        ) : null}

        {!validationError && isCompleteE164(composedE164Preview) ? (
          <p className="text-xs font-medium text-emerald-600/85 dark:text-emerald-400/90">Number looks valid.</p>
        ) : null}

        {(validationError || !isCompleteE164(composedE164Preview)) && (
          <p className="flex items-start gap-2 text-[11px] leading-snug text-gray-500/80 dark:text-neutral-500/85">
            <Phone
              className={cn(
                "mt-0.5 h-3 w-3 shrink-0",
                validationError ? "text-gray-400/60 dark:text-neutral-500/70" : "text-gray-400/65 dark:text-neutral-500/75"
              )}
              strokeWidth={1.75}
            />
            <span className="min-w-0">{formatHelperText}</span>
          </p>
        )}
      </div>
    </div>
  );
}
