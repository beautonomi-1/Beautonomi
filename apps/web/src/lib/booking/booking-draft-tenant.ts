/**
 * §12.7 — discard cross-tenant draft checkout when active tenant changes (sessionStorage bridge).
 */
export const BOOKING_DRAFT_TENANT_STORAGE_KEY = "beautonomi_booking_draft_tenant_id";

const DRAFT_KEYS = [
  "beautonomi_booking_client",
  "beautonomi_booking_addons",
  "beautonomi_booking_special_requests",
  "beautonomi_booking_provider_form_responses",
  "beautonomi_booking_custom_field_values",
  "beautonomi_booking_group",
] as const;

export function clearBookingDraftSessionStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  for (const k of DRAFT_KEYS) {
    sessionStorage.removeItem(k);
  }
}

/** Fetch tenant-context and clear draft keys if stored tenant id differs (browser only). */
export async function syncBookingDraftTenantFromServer(): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  try {
    const r = await fetch("/api/public/tenant-context", { credentials: "same-origin", cache: "no-store" });
    const j = (await r.json()) as { data?: { tenant?: { id?: string } | null } };
    const tid = j?.data?.tenant?.id;
    if (!tid) return;
    const prev = sessionStorage.getItem(BOOKING_DRAFT_TENANT_STORAGE_KEY);
    if (prev && prev !== tid) {
      clearBookingDraftSessionStorage();
    }
    sessionStorage.setItem(BOOKING_DRAFT_TENANT_STORAGE_KEY, tid);
  } catch {
    /* ignore */
  }
}

export function rememberBookingDraftTenant(tenantId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(BOOKING_DRAFT_TENANT_STORAGE_KEY, tenantId);
}
