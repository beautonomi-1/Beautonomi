import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeUserMessageAttachmentFiles } from "@/lib/account/purge-user-message-files";

export type PurgeUserSuccess = { ok: true; storage_attachments_removed: number };

export type PurgeUserResult = PurgeUserSuccess | { ok: false; message: string; code?: string };

function authDeleteErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.trim()) return code;

  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  if (message.includes("database error deleting user")) {
    return "AUTH_DELETE_DATABASE_ERROR";
  }

  return undefined;
}

type ResidualBlockerRow = {
  table_schema: string | null;
  table_name: string | null;
  column_name: string | null;
  constraint_name: string | null;
  delete_action: string | null;
  blocking_rows: number | null;
};

/**
 * Calls the read-only diagnostic (migration 670) to translate the opaque
 * Supabase "Database error deleting user" into the exact tables/constraints
 * still referencing the user's auth-delete cascade closure.
 */
async function describeResidualDeleteBlockers(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc("compliance_diagnose_user_delete_blockers", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[purge-user] diagnose blockers RPC failed:", error.message);
      return null;
    }
    const rows = (data as ResidualBlockerRow[] | null) ?? [];
    if (rows.length === 0) return null;
    return rows
      .map(
        (r) =>
          `${r.table_schema}.${r.table_name}.${r.column_name} (${r.constraint_name}, ${r.delete_action}, ${r.blocking_rows} row(s))`,
      )
      .join("; ");
  } catch (e) {
    console.error("[purge-user] diagnose blockers threw:", e);
    return null;
  }
}

/**
 * DB-side cleanup for FKs that still use NO ACTION toward users/auth (see migrations 440, 631).
 * Also deletes owned-provider bookings first so provider → offerings CASCADE does not hit
 * booking_services.offering_id RESTRICT. Must run before auth.admin.deleteUser while the
 * user id still exists for lookups.
 */
export async function complianceClearUserReferences(
  admin: SupabaseClient,
  userId: string,
): Promise<PurgeUserResult> {
  const { error } = await admin.rpc("compliance_clear_user_references", {
    p_user_id: userId,
  });
  if (error) {
    // The RPC RAISEs a descriptive message naming the blocking
    // table/column/constraint (e.g. "Could not clear provider purge FK blocker
    // public.sales.provider_id -> providers"). Log it so the exact RESTRICT
    // chain is visible without reproducing the failure.
    console.error("compliance_clear_user_references failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: error.message, code: error.code };
  }
  return { ok: true, storage_attachments_removed: 0 };
}

/**
 * Full erasure: clear blocking FKs, remove chat attachment objects, delete Supabase Auth user
 * (cascades public.users and most dependent rows).
 */
export async function purgePlatformUserAccountFully(
  admin: SupabaseClient,
  userId: string,
): Promise<PurgeUserResult> {
  const cleared = await complianceClearUserReferences(admin, userId);
  if (!cleared.ok) return cleared;

  const { removed: storage_attachments_removed } = await purgeUserMessageAttachmentFiles(admin, userId);

  const { error: delError } = await admin.auth.admin.deleteUser(userId);
  if (delError) {
    const code = authDeleteErrorCode(delError);
    let message = delError.message;
    // The auth error ("Database error deleting user") never names the blocking
    // table. Surface the precise residual FK blockers so the operator/dev can act.
    if (code === "AUTH_DELETE_DATABASE_ERROR") {
      const blockers = await describeResidualDeleteBlockers(admin, userId);
      if (blockers) message = `${delError.message} — residual references: ${blockers}`;
    }
    return { ok: false, message, code };
  }
  return { ok: true, storage_attachments_removed };
}

export type PurgeProviderOrgResult =
  | { ok: true; purged_user_ids: string[]; storage_attachments_removed_total: number }
  | { ok: false; message: string; code?: string; purged_user_ids: string[]; storage_attachments_removed_total: number };

/**
 * Deletes all linked staff auth accounts (best-effort order), then the owner — removing the
 * provider row and cascaded business data from the database.
 */
export async function purgeProviderOrganizationFully(
  admin: SupabaseClient,
  opts: { providerId: string; tenantId: string },
): Promise<PurgeProviderOrgResult> {
  const { data: prov, error: provErr } = await admin
    .from("providers")
    .select("id, user_id")
    .eq("id", opts.providerId)
    .eq("tenant_id", opts.tenantId)
    .maybeSingle();

  if (provErr || !prov?.user_id) {
    return {
      ok: false,
      message: provErr?.message || "Provider not found in this tenant",
      purged_user_ids: [],
      storage_attachments_removed_total: 0,
    };
  }

  const ownerId = prov.user_id as string;

  const { data: staffRows } = await admin
    .from("provider_staff")
    .select("user_id")
    .eq("provider_id", opts.providerId);

  const staffUserIds = [
    ...new Set(
      (staffRows ?? [])
        .map((r: { user_id: string | null }) => r.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ].filter((id) => id !== ownerId);

  const purgedUserIds: string[] = [];
  let storage_attachments_removed_total = 0;

  for (const sid of staffUserIds) {
    const { data: u } = await admin.from("users").select("id, role").eq("id", sid).maybeSingle();
    if (!u || u.role === "superadmin") continue;

    const r = await purgePlatformUserAccountFully(admin, sid);
    if (r.ok === false) {
      return {
        ok: false,
        message: r.message,
        code: r.code,
        purged_user_ids: purgedUserIds,
        storage_attachments_removed_total,
      };
    }
    storage_attachments_removed_total += r.storage_attachments_removed;
    purgedUserIds.push(sid);
  }

  const { data: ownerRow } = await admin.from("users").select("role").eq("id", ownerId).maybeSingle();
  if (ownerRow?.role === "superadmin") {
    return {
      ok: false,
      message: "Refusing to purge a superadmin-owned provider",
      purged_user_ids: purgedUserIds,
      storage_attachments_removed_total,
    };
  }

  const ownerRes = await purgePlatformUserAccountFully(admin, ownerId);
  if (ownerRes.ok === false) {
    return {
      ok: false,
      message: ownerRes.message,
      code: ownerRes.code,
      purged_user_ids: purgedUserIds,
      storage_attachments_removed_total,
    };
  }
  storage_attachments_removed_total += ownerRes.storage_attachments_removed;
  purgedUserIds.push(ownerId);

  return { ok: true, purged_user_ids: purgedUserIds, storage_attachments_removed_total };
}
