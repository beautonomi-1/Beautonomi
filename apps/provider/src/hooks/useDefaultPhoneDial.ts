import { useMemo } from "react";
import { dialCodeForIso3166Alpha2 } from "@beautonomi/phone";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

const ZA_FALLBACK = "+27";

/**
 * Default E.164 dial code for phone fields: tenant_region.phone_country_code, then active market ISO, then +27.
 */
export function useDefaultPhoneDial(): string {
  const { bundle } = useConfigBundle();
  return useMemo(() => {
    const raw = bundle?.meta?.tenant_region?.phone_country_code?.trim();
    if (raw?.startsWith("+")) return raw;
    if (raw && /^\d+$/.test(raw)) return `+${raw}`;
    const iso = bundle?.meta?.active_market_country?.trim().toUpperCase();
    if (iso && /^[A-Z]{2}$/.test(iso)) {
      const d = dialCodeForIso3166Alpha2(iso);
      if (d) return d;
    }
    return ZA_FALLBACK;
  }, [bundle]);
}
