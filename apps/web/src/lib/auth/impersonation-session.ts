import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decodeJwtPayload } from "@/lib/supabase/api-helpers";

const IMPERSONATION_TTL_MS = 60 * 60 * 1000;

function hashToken(tokenHash: string): string {
  return createHash("sha256").update(tokenHash, "utf8").digest("hex");
}

/** Records an impersonation link before it is used so the resulting session can be flagged. */
export async function recordImpersonationLink(input: {
  tokenHash: string;
  adminUserId: string;
  targetUserId: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("auth_impersonation_sessions")
    .insert({
      token_hash_sha256: hashToken(input.tokenHash),
      admin_user_id: input.adminUserId,
      target_user_id: input.targetUserId,
      expires_at: new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString(),
    });
  if (error) throw error;
}

/**
 * After the callback exchanges the link for a session, binds that session id to the
 * impersonation row so provider-security treats it as impersonation. No-op for normal links.
 */
export async function bindImpersonationSession(tokenHash: string, accessToken: string | null | undefined): Promise<void> {
  if (!accessToken) return;
  const sessionId = decodeJwtPayload(accessToken)?.session_id;
  if (typeof sessionId !== "string") return;
  try {
    await getSupabaseAdmin()
      .from("auth_impersonation_sessions")
      .update({ session_id: sessionId })
      .eq("token_hash_sha256", hashToken(tokenHash))
      .is("session_id", null)
      .gt("expires_at", new Date().toISOString());
  } catch (err) {
    console.warn("[impersonation] bind session failed", err);
  }
}
