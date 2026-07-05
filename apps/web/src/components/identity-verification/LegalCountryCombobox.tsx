"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterVerificationCountries,
  mergeVerificationCountries,
  resolveDefaultVerificationCountryIso,
  STATIC_VERIFICATION_COUNTRIES,
  type VerificationCountryOption,
} from "@beautonomi/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (isoCode: string) => void;
  error?: string;
  id?: string;
}

export function LegalCountryCombobox({
  value,
  onChange,
  error,
  id = "legal-country",
}: Props) {
  const { bundle } = useConfigBundle();
  const [countries, setCountries] = useState<VerificationCountryOption[]>(STATIC_VERIFICATION_COUNTRIES);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultIso = useMemo(
    () =>
      resolveDefaultVerificationCountryIso({
        tenantRegionCode: bundle?.meta?.tenant_region?.code,
        tenantRegionName: bundle?.meta?.tenant_region?.name,
      }),
    [bundle?.meta?.tenant_region?.code, bundle?.meta?.tenant_region?.name],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/countries");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: unknown[] };
        if (!cancelled) setCountries(mergeVerificationCountries(json.data ?? []));
      } catch {
        // static fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!value && defaultIso && countries.some((c) => c.code === defaultIso)) {
      onChange(defaultIso);
    }
  }, [value, defaultIso, countries, onChange]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = countries.find((c) => c.code === value) ?? null;
  const filtered = useMemo(
    () => filterVerificationCountries(countries, query),
    [countries, query],
  );

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label htmlFor={id}>
        Country that issued your document{" "}
        <span aria-hidden="true" className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <button
          type="button"
          id={id}
          onClick={() => setOpen((v) => !v)}
          disabled={loading}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-required="true"
          aria-describedby={error ? `${id}-err` : undefined}
          className={`flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm text-left ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            error ? "border-destructive" : "border-input"
          }`}
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {loading ? "Loading countries…" : selected?.name ?? "Select country…"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>

        {open && (
          <div
            className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
            role="listbox"
            aria-label="Select country"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country…"
                className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                autoFocus
                aria-label="Search countries"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No countries found</li>
              ) : (
                filtered.map((country) => (
                  <li key={country.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === country.code}
                      className={`flex w-full items-center px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                        value === country.code ? "bg-accent/50 font-medium" : ""
                      }`}
                      onClick={() => {
                        onChange(country.code);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {country.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
