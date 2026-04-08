import {
  CONSENT_COOKIE_MAX_AGE_SEC,
  CONSENT_COOKIE_NAME,
  CONSENT_SCHEMA_VERSION,
  POLICY_VERSION,
  STORAGE_KEY,
} from "./constants";
import type { CookieCategorySelection, StoredCookieConsent } from "./types";

const MAX_STORED_BYTES = 4096;

function isValidIso8601(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function defaultRejectNonEssential(): CookieCategorySelection {
  return {
    necessary: true,
    analytics: false,
    functional: false,
    marketing: false,
  };
}

function defaultAcceptAll(): CookieCategorySelection {
  return {
    necessary: true,
    analytics: true,
    functional: true,
    marketing: true,
  };
}

function isCategorySelection(v: unknown): v is CookieCategorySelection {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.necessary === true &&
    typeof o.analytics === "boolean" &&
    typeof o.functional === "boolean" &&
    typeof o.marketing === "boolean"
  );
}

function parseStored(raw: string | null): StoredCookieConsent | null {
  if (!raw) return null;
  if (raw.length > MAX_STORED_BYTES) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.schemaVersion !== CONSENT_SCHEMA_VERSION) return null;
    if (typeof o.policyVersion !== "string" || typeof o.updatedAt !== "string") return null;
    if (!isValidIso8601(o.updatedAt)) return null;
    if (!isCategorySelection(o.categories)) return null;
    return {
      schemaVersion: CONSENT_SCHEMA_VERSION,
      policyVersion: o.policyVersion,
      updatedAt: o.updatedAt,
      categories: o.categories,
    };
  } catch {
    return null;
  }
}

function writeConsentCookie(payload: StoredCookieConsent): void {
  if (typeof document === "undefined") return;
  try {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    /** ~4KB browser limit per cookie; localStorage remains canonical if we skip. */
    if (encoded.length > 3800) return;
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

export function clearConsentCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function clearStoredConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  clearConsentCookie();
}

export function readStoredConsent(): StoredCookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = parseStored(raw);
    if (raw && !parsed) {
      clearStoredConsent();
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistConsent(categories: CookieCategorySelection): StoredCookieConsent {
  const record: StoredCookieConsent = {
    schemaVersion: CONSENT_SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    updatedAt: new Date().toISOString(),
    categories,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* ignore quota */
    }
    writeConsentCookie(record);
    try {
      window.dispatchEvent(new CustomEvent<StoredCookieConsent>("beautonomi:cookie-consent-changed", { detail: record }));
    } catch {
      /* ignore */
    }
  }
  return record;
}

export function buildAcceptAll(): StoredCookieConsent {
  return persistConsent(defaultAcceptAll());
}

export function buildRejectNonEssential(): StoredCookieConsent {
  return persistConsent(defaultRejectNonEssential());
}

export function buildCustom(categories: Omit<CookieCategorySelection, "necessary">): StoredCookieConsent {
  return persistConsent({
    necessary: true,
    analytics: categories.analytics,
    functional: categories.functional,
    marketing: categories.marketing,
  });
}

export function needsReprompt(stored: StoredCookieConsent | null): boolean {
  if (!stored) return true;
  if (stored.policyVersion !== POLICY_VERSION) return true;
  return false;
}
