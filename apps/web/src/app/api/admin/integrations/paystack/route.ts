import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const patchSchema = z.object({
  paystack_secret_key: z.string().optional(),
  paystack_public_key: z.string().optional(),
  paystack_webhook_secret: z.string().optional(),
});

function maskKey(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 6) + "..." + v.slice(-4);
}

/**
 * GET /api/admin/integrations/paystack
 * Returns masked Paystack keys (secrets never returned in full). Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    void user;

    const supabase = getSupabaseAdmin();
    const { data, error } = await (supabase.from("platform_secrets") as any)
      .select("id, paystack_secret_key, paystack_public_key, paystack_webhook_secret, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const env = {
      has_env_secret_key: !!process.env.PAYSTACK_SECRET_KEY,
      has_env_public_key: !!process.env.PAYSTACK_PUBLIC_KEY,
    };

    if (!data) {
      return successResponse({
        configured: false,
        masked_secret_key: null,
        masked_public_key: null,
        has_webhook_secret: false,
        env,
      });
    }

    return successResponse({
      configured: !!(data.paystack_secret_key || data.paystack_public_key),
      masked_secret_key: maskKey(data.paystack_secret_key),
      masked_public_key: maskKey(data.paystack_public_key),
      has_webhook_secret: !!data.paystack_webhook_secret,
      updated_at: data.updated_at,
      env,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch Paystack configuration");
  }
}

/**
 * PATCH /api/admin/integrations/paystack
 * Update Paystack keys in platform_secrets. Superadmin only.
 * Only fields explicitly provided are updated (empty string = clear the key).
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const updates: Record<string, string | null> = {};
    if ("paystack_secret_key" in parsed.data) {
      updates.paystack_secret_key = parsed.data.paystack_secret_key?.trim() || null;
    }
    if ("paystack_public_key" in parsed.data) {
      updates.paystack_public_key = parsed.data.paystack_public_key?.trim() || null;
    }
    if ("paystack_webhook_secret" in parsed.data) {
      updates.paystack_webhook_secret = parsed.data.paystack_webhook_secret?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No fields to update", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    // Upsert — platform_secrets uses singleton row pattern
    const { data: existing } = await (supabase.from("platform_secrets") as any)
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let opError;
    if (existing?.id) {
      const { error } = await (supabase.from("platform_secrets") as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      opError = error;
    } else {
      const { error } = await (supabase.from("platform_secrets") as any)
        .insert(updates);
      opError = error;
    }

    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.integrations.paystack.keys.updated",
      entity_type: "platform_secrets",
      metadata: {
        fields_updated: Object.keys(updates),
      },
    });

    return successResponse({ message: "Paystack configuration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update Paystack configuration");
  }
}
