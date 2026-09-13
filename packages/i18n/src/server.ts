import { createInstance, type TFunction } from "i18next";
import { FALLBACK_LNG_MAP, normalizeLanguageCode } from "./language-registry";
import { defaultNS, resources } from "./resources";

export { defaultNS, resources };

// Cache i18next instances per language to avoid recreating on every RSC/metadata call.
const tCache = new Map<string, TFunction>();

/** Server-side / RSC translation helper (no react-i18next). Cached per language. */
export async function getServerT(language: string): Promise<TFunction> {
  const lng = normalizeLanguageCode(language);
  const cached = tCache.get(lng);
  if (cached) return cached;

  const instance = createInstance();
  await instance.init({
    resources,
    lng,
    fallbackLng: FALLBACK_LNG_MAP,
    defaultNS,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });
  const t = instance.getFixedT(lng, defaultNS);
  tCache.set(lng, t);
  return t;
}
