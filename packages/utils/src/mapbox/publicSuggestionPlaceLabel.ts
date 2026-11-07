/**
 * One-line public place label for search suggestions (suburb / metro city).
 * Never uses address_line2 (apartment) or province.
 */

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function samePlace(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function publicSuggestionPlaceLabel(
  city: string | null | undefined,
  neighborhood: string | null | undefined,
  metro: string | null | undefined,
): string | undefined {
  const c = norm(city);
  const n = norm(neighborhood);
  const m = norm(metro);

  if (n && m && !samePlace(n, m)) {
    return `${n}, ${m}`;
  }

  if (n && c && !samePlace(n, c)) {
    return c ? `${n}, ${c}` : n;
  }

  if (c && m && !samePlace(c, m)) {
    return `${c}, ${m}`;
  }

  const single = c || m || n;
  return single || undefined;
}
