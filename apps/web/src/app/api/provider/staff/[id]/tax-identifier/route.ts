import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStaffPermissions, isProviderOwner } from "@/lib/auth/permissions";
import {
  decryptSensitiveField,
  encryptSensitiveField,
} from "@/lib/security/field-encryption";

const bodySchema = z.object({
  tax_identifier: z.string().min(4).max(32),
});

/**
 * GET /api/provider/staff/[id]/tax-identifier — owner or self (masked).
 * PATCH — manage_payroll only; stores encrypted value.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id: staffId } = await params;
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: staff } = await admin
      .from("provider_staff")
      .select("id, user_id, tax_identifier_encrypted")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!staff) return notFoundResponse("Staff not found");

    const isSelf = staff.user_id === user.id;
    const perms = await getStaffPermissions(user.id, undefined, request);
    if (!isSelf && !perms.manage_payroll && !(await isProviderOwner(user.id, request))) {
      return handleApiError(new Error("Forbidden"), "FORBIDDEN", 403);
    }

    const plain = decryptSensitiveField(
      (staff as { tax_identifier_encrypted?: string | null }).tax_identifier_encrypted,
    );
    const masked = plain ? `${plain.slice(0, 2)}***${plain.slice(-2)}` : null;
    return successResponse({ masked, hasValue: Boolean(plain) });
  } catch (error) {
    return handleApiError(error, "Failed to load tax identifier");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id: staffId } = await params;
    const body = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");

    const perms = await getStaffPermissions(user.id, undefined, request);
    if (!perms.manage_payroll && !(await isProviderOwner(user.id, request))) {
      return handleApiError(new Error("Forbidden"), "FORBIDDEN", 403);
    }

    const encrypted = encryptSensitiveField(body.tax_identifier.trim());
    const { error } = await admin
      .from("provider_staff")
      .update({ tax_identifier_encrypted: encrypted })
      .eq("id", staffId)
      .eq("provider_id", providerId);
    if (error) throw error;
    return successResponse({ saved: true });
  } catch (error) {
    return handleApiError(error, "Failed to save tax identifier");
  }
}
