import { mergeLanguagePickerOptions } from "@beautonomi/i18n";
import type { PreferenceOption } from "./preferences-initial-types";

/**
 * CMS `preference_options` may only list a subset (e.g. English). Merge with every
 * `@beautonomi/i18n` bundled locale so Language & region matches the customer app.
 */
export function expandLanguagePreferenceOptions(apiRows: PreferenceOption[]): PreferenceOption[] {
  const skinny = apiRows
    .filter((r): r is PreferenceOption & { code: string } => Boolean(r.code?.trim()))
    .map((r) => ({
      code: r.code.split(/[-_]/)[0].toLowerCase(),
      name: (r.name?.trim() || r.code) as string,
    }));
  const merged = mergeLanguagePickerOptions(skinny);
  return merged
    .map((m, i) => {
      const orig = apiRows.find((r) => (r.code || "").split(/[-_]/)[0].toLowerCase() === m.code);
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
