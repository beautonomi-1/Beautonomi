import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/beautonomi";
import {
  type OpsDesk,
  rolesForDesk,
} from "@/lib/provider-ops/ops-desk-roles";

/** Pick the next ops owner for a desk using least-recent assignment on open cases. */
export async function roundRobinOpsOwner(
  supabase: SupabaseClient,
  tenantId: string,
  desk: OpsDesk,
): Promise<string | null> {
  const allowedRoles = rolesForDesk(desk);

  const { data: scopeRows, error: scopeErr } = await supabase.rpc("admin_user_ids_in_tenant_scope", {
    p_tenant_id: tenantId,
  });
  if (scopeErr) throw scopeErr;
  const scopedIds = ((scopeRows ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
  if (scopedIds.length === 0) return null;

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, role, deactivated_at")
    .in("id", scopedIds)
    .is("deactivated_at", null);
  if (usersErr) throw usersErr;

  const eligible = (users ?? []).filter((u) =>
    allowedRoles.includes(u.role as UserRole),
  );
  if (eligible.length === 0) return null;

  const ownerColumn =
    desk === "sales"
      ? "sales_owner_id"
      : desk === "onboarding"
        ? "onboarding_owner_id"
        : "retention_owner_id";

  const { data: cases } = await supabase
    .from("provider_ops_cases")
    .select(ownerColumn)
    .eq("tenant_id", tenantId)
    .eq("current_desk", desk)
    .in("status", ["open", "activated"]);

  const lastAssigned = new Map<string, number>();
  for (const c of cases ?? []) {
    const ownerId = (c as Record<string, string | null>)[ownerColumn];
    if (!ownerId) continue;
    lastAssigned.set(ownerId, (lastAssigned.get(ownerId) ?? 0) + 1);
  }

  eligible.sort((a, b) => {
    const ca = lastAssigned.get(a.id) ?? 0;
    const cb = lastAssigned.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });

  return eligible[0]?.id ?? null;
}
