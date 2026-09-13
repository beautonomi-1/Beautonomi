import {
  mergeLanguagePickerOptions,
  normalizeLanguageCode,
} from "@beautonomi/i18n/language-registry";
import type { PreferenceOption } from "./preferences-initial-types";

/**
 * CMS `preference_options` may only list a subset (e.g. English). Merge with every
 * bundled locale so tourists can pick Wave B (German, Dutch, …) on .co.za.
 */
export function expandLanguagePreferenceOptions(
  apiRows: PreferenceOption[],
  _marketSupportedLanguages: readonly string[] = [],
): PreferenceOption[] {
  const skinny = apiRows
    .filter((r): r is PreferenceOption & { code: string } => Boolean(r.code?.trim()))
    .map((r) => ({
      code: normalizeLanguageCode(r.code),
      name: (r.name?.trim() || r.code) as string,
    }));

  const merged = mergeLanguagePickerOptions(skinny);

  return merged
    .map((m, i) => {
      const orig = apiRows.find(
        (r) => normalizeLanguageCode(r.code || "").toLowerCase() === m.code.toLowerCase(),
      );
      return {
        id: orig?.id ?? `__i18n_bundled__${m.code}`,
        type: "language" as const,
        code: m.code,
        name: m.name,
        display_order: orig?.display_order ?? 1000 + i,
      };
    })
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}
