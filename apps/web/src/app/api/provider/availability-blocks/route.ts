import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { writeAuditLog } from "@/lib/audit/audit";

const createSchema = z.object({
  block_type: z.enum(["unavailable", "break", "maintenance"]),
  start_at: z.string(),
  end_at: z.string(),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  reason: z.string().optional().nullable(),
});

function toIso(dateLike: string) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

/**
 * GET /api/provider/availability-blocks
 * Query params:
 * - from (ISO) optional
 * - to (ISO) optional
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's blocks
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    let query = supabase
      .from("availability_blocks")
      .select("*")
      .order("start_at", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (from) query = query.gte("start_at", from);
    if (to) query = query.lte("end_at", to);

    const { data, error } = await query;
    if (error) throw error;
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch availability blocks");
  }
}

/**
 * POST /api/provider/availability-blocks
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = createSchema.parse(await request.json());

    const startIso = toIso(body.start_at);
    const endIso = toIso(body.end_at);
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      return handleApiError(new Error("end_at must be after start_at"), "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await (supabase.from("availability_blocks") as any)
      .insert({
        provider_id: providerId,
        block_type: body.block_type,
        start_at: startIso,
        end_at: endIso,
        staff_id: body.staff_id ?? null,
        location_id: body.location_id ?? null,
        reason: body.reason ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "provider_staff",
      action: "provider.availability_block.create",
      entity_type: "availability_block",
      entity_id: data?.id,
      metadata: { provider_id: providerId, block_type: body.block_type, start_at: startIso, end_at: endIso },
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create availability block");
  }
}

