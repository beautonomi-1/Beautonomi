/** Digits only (no +, spaces, or punctuation). */
export function digitsOnlyPhone(s: string | null | undefined): string {
  if (!s?.trim()) return "";
  return s.replace(/\D+/g, "");
}

/**
 * Search needles for matching a stored phone against what the user typed.
 * Returns [] when fewer than 4 digit characters were typed (no phone search).
 */
export function phoneSearchNeedles(query: string): string[] {
  const digits = digitsOnlyPhone(query.trim());
  if (digits.length < 4) return [];

  const out = new Set<string>();
  out.add(digits);

  if (digits.startsWith("0")) {
    const stripped = digits.replace(/^0+/, "");
    if (stripped.length >= 3) out.add(stripped);
  }

  if (digits.length >= 9) {
    out.add(digits.slice(-9));
  }

  return [...out];
}

/**
 * Needles for tenant-wide or global searches: same rules as phoneSearchNeedles,
 * minus anything shorter than 4 digits (a 3-digit tail matches too many numbers).
 */
export function phoneSearchNeedlesUnscoped(query: string): string[] {
  return phoneSearchNeedles(query).filter((n) => n.length >= 4);
}

/** True when stored phone digits contain any search needle (national 0 vs E.164). */
export function phoneMatchesQuery(
  storedPhone: string | null | undefined,
  query: string
): boolean {
  const needles = phoneSearchNeedles(query);
  if (needles.length === 0) return false;
  const stored = digitsOnlyPhone(storedPhone);
  if (!stored) return false;
  for (const needle of needles) {
    if (needle.length >= 3 && stored.includes(needle)) return true;
  }
  return false;
}

/** Client list filter: name/email substring + phone needle match. */
export function clientContactMatches(
  query: string,
  contact: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): boolean {
  const q = query.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  if (contact.name?.toLowerCase().includes(lower)) return true;
  if (contact.email?.toLowerCase().includes(lower)) return true;
  if (phoneMatchesQuery(contact.phone, q)) return true;
  return false;
}
