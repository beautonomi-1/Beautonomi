/**
 * Resolves "active market" ISO 3166-1 alpha-2 for public discovery APIs.
 * Until `tenant_domains` + DB tenancy ship (spec §6–7), Host → country uses env map.
 * NN-2: this value is for browse/discovery defaults only — never sole auth scope for mutations.
 */

export type ActiveMarketSource =
  | "query"
  | "host"
  | "header_hint"
  | "geo_header"
  | "default";

export interface ResolvedActiveMarket {
  /** ISO 3166-1 alpha-2, or empty string when the global entry host cannot infer country (see `effectiveBrowseCountryCode`). */
  countryCode: string;
  source: ActiveMarketSource;
  /** Normalized host used for mapping (lowercase, no port), if any */
  host: string | null;
}

const ISO2 = /^[A-Z]{2}$/;

function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const h = raw.split(":")[0]?.trim().toLowerCase();
  return h || null;
}

/** Hostname (lowercase) → ISO 3166-1 alpha-2. Server env only (`TENANT_HOST_COUNTRY_MAP`). */
export function getTenantHostCountryMap(): Record<string, string> {
  return parseHostCountryMap();
}

function parseHostCountryMap(): Record<string, string> {
  const raw = process.env.TENANT_HOST_COUNTRY_MAP?.trim();
  if (!raw) {
    return {
      localhost: "ZA",
      "127.0.0.1": "ZA",
    };
  }
  try {
    const o = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      const host = normalizeHost(k);
      const code = String(v).trim().toUpperCase();
      if (host && ISO2.test(code)) out[host] = code;
    }
    return out;
  } catch {
    return {};
  }
}

function hostCountryMap(): Record<string, string> {
  return parseHostCountryMap();
}

function globalEntryHost(): string | null {
  const host = process.env.NEXT_PUBLIC_GLOBAL_ENTRY_HOST?.trim().toLowerCase();
  return host ? normalizeHost(host) : null;
}

/** Exported for browse/catalog APIs that require a valid ISO2 when resolver returns "". */
export function defaultMarketCountryCode(): string {
  const d = process.env.DEFAULT_MARKET_COUNTRY?.trim().toUpperCase();
  return d && ISO2.test(d) ? d : "ZA";
}

/** Use resolved ISO2 when valid; otherwise fall back to DEFAULT_MARKET_COUNTRY (ZA). */
export function effectiveBrowseCountryCode(resolvedIso2: string): string {
  const c = (resolvedIso2 ?? "").trim().toUpperCase();
  return ISO2.test(c) ? c : defaultMarketCountryCode();
}

function countryFromGeoHeaders(h: Headers): string | null {
  const raw =
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("cloudfront-viewer-country") ||
    h.get("x-appengine-country") ||
    "";
  const iso = raw.trim().toUpperCase();
  if (iso && ISO2.test(iso) && iso !== "XX" && iso !== "T1") return iso;
  return null;
}

function mapHostToCountry(host: string | null): string | null {
  if (!host) return null;
  const global = globalEntryHost();
  if (global && (host === global || host === `www.${global}`)) {
    // Global entry hosts should not be pinned to one market country.
    return null;
  }
  const map = hostCountryMap();
  return map[host] ?? null;
}

/**
 * @param explicitCountryRaw - query param `country` if present (any casing)
 */
export function resolveActiveMarketFromRequest(
  request: Request,
  explicitCountryRaw: string | null
): ResolvedActiveMarket {
  const h = request.headers;
  const explicit = explicitCountryRaw?.trim().toUpperCase() ?? null;
  const explicitOk = explicit && ISO2.test(explicit) ? explicit : null;

  if (explicitOk) {
    return {
      countryCode: explicitOk,
      source: "query",
      host: normalizeHost(h.get("x-forwarded-host") || h.get("host")),
    };
  }

  const headerHint = (h.get("x-active-market-country") || "").trim().toUpperCase();
  if (ISO2.test(headerHint)) {
    return {
      countryCode: headerHint,
      source: "header_hint",
      host: normalizeHost(h.get("x-forwarded-host") || h.get("host")),
    };
  }

  const fwd = normalizeHost(h.get("x-forwarded-host"));
  const host = fwd || normalizeHost(h.get("host"));
  const fromHost = mapHostToCountry(host);
  if (fromHost) {
    return { countryCode: fromHost, source: "host", host };
  }

  const geo = countryFromGeoHeaders(h);
  if (geo) {
    return { countryCode: geo, source: "geo_header", host };
  }

  const globalHost = globalEntryHost();
  if (globalHost && host && (host === globalHost || host === `www.${globalHost}`)) {
    return {
      countryCode: "",
      source: "default",
      host,
    };
  }

  return {
    countryCode: defaultMarketCountryCode(),
    source: "default",
    host,
  };
}
