import type { i18n as I18nInstance } from "i18next";
import { getLanguageMeta, normalizeLanguageCode } from "./language-registry";
import { CORE_LOCALE_CODES, defaultNS, deepMerge } from "./resources-core";

const coreSet = new Set<string>(CORE_LOCALE_CODES);
const inFlight = new Map<string, Promise<Record<string, unknown>>>();

export type ExtraLocaleLoader = (code: string) => Promise<Record<string, unknown>>;

let extraLoader: ExtraLocaleLoader | null = null;

/** Native apps register a Metro-friendly JSON importer. Web uses `/api/i18n/locales/:code`. */
export function setExtraLocaleLoader(loader: ExtraLocaleLoader | null) {
  extraLoader = loader;
}

function isWebDocument(): boolean {
  return typeof document !== "undefined";
}

async function loadRawLocale(code: string): Promise<Record<string, unknown>> {
  if (isWebDocument()) {
    const res = await fetch(`/api/i18n/locales/${encodeURIComponent(code)}`, {
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(`Failed to load locale ${code} (${res.status})`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
  if (extraLoader) return extraLoader(code);
  return {};
}

export async function loadLocaleMessages(code: string): Promise<Record<string, unknown>> {
  const normalized = normalizeLanguageCode(code);
  const existing = inFlight.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    const meta = getLanguageMeta(normalized);
    const base = meta?.baseCode;
    if (base && base !== normalized && !coreSet.has(normalized)) {
      const [baseMessages, overlay] = await Promise.all([
        coreSet.has(base) ? Promise.resolve({}) : loadRawLocale(base),
        loadRawLocale(normalized),
      ]);
      return Object.keys(baseMessages).length > 0 ? deepMerge(baseMessages, overlay) : overlay;
    }
    if (coreSet.has(normalized)) return {};
    return loadRawLocale(normalized);
  })();

  inFlight.set(normalized, task);
  try {
    return await task;
  } finally {
    inFlight.delete(normalized);
  }
}

/** Load a catalog into `instance` (no-op for bundled English overlays). */
export async function ensureLocaleResources(instance: I18nInstance, code: string): Promise<string> {
  const normalized = normalizeLanguageCode(code);
  if (coreSet.has(normalized)) return normalized;
  if (instance.hasResourceBundle(normalized, defaultNS)) return normalized;

  try {
    const meta = getLanguageMeta(normalized);
    const base = meta?.baseCode;
    if (base && !coreSet.has(base) && !instance.hasResourceBundle(base, defaultNS)) {
      const baseMessages = await loadLocaleMessages(base);
      if (Object.keys(baseMessages).length > 0) {
        instance.addResourceBundle(base, defaultNS, baseMessages, true, true);
      }
    }

    const messages = await loadLocaleMessages(normalized);
    if (Object.keys(messages).length > 0) {
      instance.addResourceBundle(normalized, defaultNS, messages, true, true);
    }
  } catch {
    // Keep English fallback so language switching still works offline / if fetch fails.
  }
  return normalized;
}
