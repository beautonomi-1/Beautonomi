import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  gateway: z.enum(["paystack", "stripe"]),
  settlement_model: z.enum(["platform_mor_transfer", "connected_mor_destination"]).optional(),
  stripe_secret_key: z.string().optional(),
  stripe_webhook_secret: z.string().optional(),
  paystack_secret_key: z.string().optional(),
  stripe_publishable_key: z.string().optional(),
});

function mask(v: string | undefined | null): string | null {
  if (!v?.trim()) return null;
  const t = v.trim();
  if (t.length <= 8) return "***";
  return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

/**
 * GET /api/admin/regions/[regionId]/online-gateway
 * Superadmin: primary online gateway + masked secret presence for a region.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ regionId: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { regionId } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: region } = await supabase
      .from("regions")
      .select("id, code, name")
      .eq("id", regionId)
      .maybeSingle();
    if (!region?.id) {
      return errorResponse("Region not found", "NOT_FOUND", 404);
    }

    const { data: primary } = await supabase
      .from("region_payment_gateways")
      .select("gateway, config, is_primary_online, is_active")
      .eq("region_id", regionId)
      .eq("is_primary_online", true)
      .eq("is_active", true)
      .maybeSingle();

    const keys = ["stripe_secret_key", "stripe_webhook_secret", "paystack_secret_key", "stripe_publishable_key"];
    const secrets: Record<string, boolean> = {};
    for (const key of keys) {
      const { data: row } = await supabase
        .from("region_secrets")
        .select("id")
        .eq("region_id", regionId)
        .eq("key", key)
        .maybeSingle();
      secrets[key] = Boolean(row?.id);
    }

    return successResponse({
      region,
      primary: primary ?? null,
      secrets_set: secrets,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load region gateway");
  }
}

/**
 * PATCH /api/admin/regions/[regionId]/online-gateway
 * Set one primary online gateway and optional region secrets (single write).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ regionId: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { regionId } = await context.params;
    const body = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: region } = await supabase
      .from("regions")
      .select("id, code")
      .eq("id", regionId)
      .maybeSingle();
    if (!region?.id) {
      return errorResponse("Region not found", "NOT_FOUND", 404);
    }

    const requested = body.settlement_model ?? "platform_mor_transfer";
    const settlement =
      body.gateway === "stripe" && requested === "connected_mor_destination"
        ? "platform_mor_transfer"
        : requested;
    const config = {
      settlement_model: settlement,
      label: body.gateway === "stripe" ? "Stripe" : "Paystack",
    };

    await supabase
      .from("region_payment_gateways")
      .update({ is_primary_online: false, updated_at: new Date().toISOString() })
      .eq("region_id", regionId);

    const { error: upsertGwErr } = await supabase.from("region_payment_gateways").upsert(
      {
        region_id: regionId,
        gateway: body.gateway,
        config,
        is_primary_online: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "region_id,gateway" },
    );
    if (upsertGwErr) throw upsertGwErr;

    async function upsertSecret(key: string, value: string | undefined) {
      if (value === undefined || !value.trim()) return;
      const { error } = await supabase.from("region_secrets").upsert(
        {
          region_id: regionId,
          key,
          value_encrypted: value.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "region_id,key" },
      );
      if (error) throw error;
    }

    await upsertSecret("stripe_secret_key", body.stripe_secret_key);
    await upsertSecret("stripe_webhook_secret", body.stripe_webhook_secret);
    await upsertSecret("paystack_secret_key", body.paystack_secret_key);
    await upsertSecret("stripe_publishable_key", body.stripe_publishable_key);

    await writeAuditLog({
      actor_user_id: user.id,
      action: "region_online_gateway_updated",
      entity_type: "region",
      entity_id: regionId,
      metadata: {
        gateway: body.gateway,
        settlement_model: settlement,
        secrets_updated: {
          stripe_secret_key: Boolean(body.stripe_secret_key?.trim()),
          stripe_webhook_secret: Boolean(body.stripe_webhook_secret?.trim()),
          paystack_secret_key: Boolean(body.paystack_secret_key?.trim()),
          stripe_publishable_key: Boolean(body.stripe_publishable_key?.trim()),
        },
      },
    });

    return successResponse({ ok: true, gateway: body.gateway, settlement_model: settlement });
  } catch (error) {
    return handleApiError(error, "Failed to update region gateway");
  }
}
