import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hashContent(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createBrandApproval(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    versionHash: string;
    requestedBy: string;
    approverId?: string;
    guestEmail?: string;
    dueAt?: Date;
    prevHash?: string | null;
  },
): Promise<{ id: string; guestToken?: string }> {
  let guestToken: string | undefined;
  let guestTokenHash: string | null = null;
  let guestExpires: string | null = null;
  if (input.guestEmail) {
    guestToken = newGuestToken();
    guestTokenHash = hashGuestToken(guestToken);
    guestExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await supabase
    .from("brand_approvals")
    .insert({
      tenant_id: input.tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      version_hash: input.versionHash,
      prev_hash: input.prevHash ?? null,
      requested_by: input.requestedBy,
      approver_id: input.approverId ?? null,
      guest_email: input.guestEmail ?? null,
      due_at: input.dueAt?.toISOString() ?? null,
      guest_token_hash: guestTokenHash,
      guest_token_expires_at: guestExpires,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create approval");
  return { id: data.id, guestToken };
}

export async function decideBrandApproval(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    approvalId: string;
    actorId: string;
    decision: "approved" | "changes_requested" | "rejected";
    comment?: string;
    evidence?: Record<string, unknown>;
    allowGuest?: boolean;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: row } = await supabase
    .from("brand_approvals")
    .select("*")
    .eq("id", input.approvalId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (!row) return { ok: false, message: "Approval not found" };
  if (row.status !== "pending") return { ok: false, message: "Approval already decided" };
  if (
    !input.allowGuest &&
    row.approver_id &&
    row.approver_id !== input.actorId
  ) {
    return { ok: false, message: "You are not the assigned approver" };
  }

  const { error } = await supabase
    .from("brand_approvals")
    .update({
      status: input.decision,
      comment: input.comment ?? null,
      decided_at: new Date().toISOString(),
      evidence: { ...(row.evidence as object), ...(input.evidence ?? {}) },
    })
    .eq("id", input.approvalId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
