import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { writeAuditLog } from "@/lib/audit/audit";

const updateSchema = z.object({
  block_type: z.enum(["unavailable", "break", "maintenance"]).optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  reason: z.string().optional().nullable(),
});

function toIso(dateLike: string) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    // For superadmin (getProviderIdForUser returns null), allow editing any block; for providers, only their own
    let providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      // Superadmin or no provider - get provider_id from the block itself
      const { data: block } = await supabase
        .from("availability_blocks")
        .select("provider_id")
        .eq("id", id)
        .single();
      providerId = block?.provider_id ?? null;
      if (!providerId) return notFoundResponse("Provider not found");
    }

    const update: any = { ...body, updated_at: new Date().toISOString() };
    if (body.start_at) update.start_at = toIso(body.start_at);
    if (body.end_at) update.end_at = toIso(body.end_at);

    if (update.start_at && update.end_at) {
      if (new Date(update.end_at).getTime() <= new Date(update.start_at).getTime()) {
        return handleApiError(new Error("end_at must be after start_at"), "Validation failed", "VALIDATION_ERROR", 400);
      }
    }

    let query = supabase
      .from("availability_blocks")
      .update(update)
      .eq("id", id);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    if (!data) return notFoundResponse("Availability block not found");

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "provider_staff",
      action: "provider.availability_block.update",
      entity_type: "availability_block",
      entity_id: id,
      metadata: { provider_id: providerId, updates: body },
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update availability block");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin (getProviderIdForUser returns null), allow deleting any block; for providers, only their own
    let providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      const { data: block } = await supabase
        .from("availability_blocks")
        .select("provider_id")
        .eq("id", id)
        .single();
      providerId = block?.provider_id ?? null;
      if (!providerId) return notFoundResponse("Provider not found");
    }

    let query = supabase
      .from("availability_blocks")
      .delete()
      .eq("id", id);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { error } = await query;
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "provider_staff",
      action: "provider.availability_block.delete",
      entity_type: "availability_block",
      entity_id: id,
      metadata: { provider_id: providerId },
    });

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete availability block");
  }
}

