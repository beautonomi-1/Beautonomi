/**
 * Normalize hostname for tenant_domains (must match resolve-tenant-from-db lowercase, no port).
 */
export type NormalizeTenantHostnameResult =
  | { ok: true; hostname: string }
  | { ok: false; error: string };

export function normalizeTenantHostname(raw: string): NormalizeTenantHostnameResult {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (!trimmed) {
    return { ok: false as const, error: "Hostname is required" };
  }
  if (trimmed.includes("/") || trimmed.includes(" ") || trimmed.includes(":")) {
    return { ok: false as const, error: "Use hostname only (no scheme, port, or path)" };
  }
  if (trimmed.length > 253) {
    return { ok: false as const, error: "Hostname is too long" };
  }
  const labels = trimmed.split(".");
  if (labels.some((l) => !l || l.length > 63)) {
    return { ok: false as const, error: "Invalid hostname labels" };
  }
  if (!/^[a-z0-9.-]+$/.test(trimmed)) {
    return { ok: false as const, error: "Hostname may only contain letters, digits, dots, and hyphens" };
  }
  return { ok: true as const, hostname: trimmed };
}
