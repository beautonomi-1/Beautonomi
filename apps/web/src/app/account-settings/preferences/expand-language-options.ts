import type { PreferenceOption } from "./preferences-initial-types";

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "st", name: "Southern Sotho", nativeName: "Sesotho" },
  { code: "nso", name: "Northern Sotho (Sepedi)", nativeName: "Sesotho sa Leboa" },
  { code: "tn", name: "Tswana", nativeName: "Setswana" },
  { code: "ts", name: "Tsonga", nativeName: "Xitsonga" },
  { code: "ve", name: "Venda", nativeName: "Tshivenda" },
  { code: "ss", name: "Swati", nativeName: "siSwati" },
] as const;

function mergeLanguagePickerOptions(
  apiRows: { code: string; name: string }[],
): { code: string; name: string }[] {
  const allowed = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));
  const seen = new Set<string>();
  const out: { code: string; name: string }[] = [];

  for (const row of apiRows) {
    const raw = row.code?.trim();
    if (!raw) continue;
    const code = raw.split(/[-_]/)[0].toLowerCase();
    if (!allowed.has(code) || seen.has(code)) continue;
    seen.add(code);
    const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    const label = meta ? `${meta.nativeName} (${meta.name})` : (row.name?.trim() || code);
    out.push({ code, name: label });
  }

  for (const { code, nativeName, name } of SUPPORTED_LANGUAGES) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: `${nativeName} (${name})` });
  }
  return out;
}

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
