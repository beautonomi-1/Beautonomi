/**
 * Normalize chip combobox `value` from API/JSONB.
 * Non-strings (e.g. numbers) must not reach `.trim()` unchecked — that crashes RN/React renders.
 */

/** Multi-select: array of display strings, trimmed, empty entries dropped. */
export function coerceChipMultiValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)).trim())
    .filter((s) => s.length > 0);
}

/** Single-select chip row: at most one non-empty string. */
export function coerceChipSingleRow(value: unknown): string[] {
  if (value == null || value === "") return [];
  const t = String(value).trim();
  return t ? [t] : [];
}

/**
 * Profile / JSONB string arrays (interests, allergies): strings and number/boolean only.
 * Skips objects so stray JSON does not become `"[object Object]"` chips.
 */
export function coerceProfileStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const x of value) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    } else if (typeof x === "number" || typeof x === "boolean") {
      out.push(String(x));
    }
  }
  return out;
}
