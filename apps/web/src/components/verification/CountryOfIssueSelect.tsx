"use client";

import { useEffect, useMemo, useState } from "react";
import {
  mergeVerificationCountries,
  resolveDefaultVerificationCountryIso,
  STATIC_VERIFICATION_COUNTRIES,
  type VerificationCountryOption,
} from "@beautonomi/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

type CountryOfIssueSelectProps = {
  value: string;
  onChange: (isoCode: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

export function CountryOfIssueSelect({
  value,
  onChange,
  id = "country-of-issue",
  className,
  disabled = false,
  required = true,
}: CountryOfIssueSelectProps) {
  const { bundle } = useConfigBundle();
  const [countries, setCountries] = useState<VerificationCountryOption[]>(
    STATIC_VERIFICATION_COUNTRIES,
  );
  const [loading, setLoading] = useState(true);

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
        if (!cancelled) {
          setCountries(mergeVerificationCountries(json.data ?? []));
        }
      } catch {
        // Keep static fallback.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!value && defaultIso && countries.some((c) => c.code === defaultIso)) {
      onChange(defaultIso);
    }
  }, [value, defaultIso, countries, onChange]);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
      }
      disabled={disabled || loading}
      required={required}
    >
      <option value="" disabled>
        {loading ? "Loading countries…" : "Select country"}
      </option>
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );
}
