export function slugifyTrackingPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function suggestTrackingCode(name: string, tenantSlug: string): string {
  const base = slugifyTrackingPart(name) || "campaign";
  const slug = slugifyTrackingPart(tenantSlug) || "market";
  return `${base}-${slug}`.slice(0, 80);
}

export function isSubCode(parent: string, code: string): boolean {
  if (code === parent) return true;
  return code.startsWith(`${parent}__`);
}

export function codesForRollup(parent: string, subCodes: string[]): string[] {
  const set = new Set<string>([parent]);
  for (const c of subCodes) {
    if (isSubCode(parent, c)) set.add(c);
  }
  return [...set];
}
