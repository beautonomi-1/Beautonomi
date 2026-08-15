import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { PermissionRequestContext } from "@/lib/auth/permissions";
import { isProviderOwner, hasPermission } from "@/lib/auth/permissions";
import {
  getTeamRosterDetailLevel,
  getProviderStaffIdForUser,
  redactStaffRowForViewer,
} from "@/lib/auth/provider-team-roster-access";
import { z } from "zod";
import { syncPortalRoleAfterWorkplaceChange } from "@/lib/auth/effective-provider-role";

const updateStaffSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  role: z.string().optional(),
  is_active: z.boolean().optional(),
  mobileReady: z.boolean().optional(),
  commission_rate: z.number().min(0).max(100).optional().nullable(),
  location_ids: z.array(z.string().uuid()).optional(),
  service_ids: z.array(z.string().uuid()).optional(),
});

/** Staff may update their own row without manage_team (name/phone/avatar/mobile only). */
const selfEditStaffSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  mobileReady: z.boolean().optional(),
});

async function respondWithStaffDetail(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  viewerUserId: string,
  staffId: string,
  providerId: string,
  request?: PermissionRequestContext,
) {
  const detail = await fetchStaffDetailForApi(supabase, staffId, providerId);
  if (!detail) {
    return notFoundResponse("Staff member not found");
  }
  const rosterDetailLevel = await getTeamRosterDetailLevel(viewerUserId, request);
  const redacted = redactStaffRowForViewer(
    {
      ...detail,
      user_id: (detail.user_id as string | null) ?? null,
      email: detail.email as string,
      phone: detail.phone as string | null,
    },
    viewerUserId,
    rosterDetailLevel,
  );
  const { user_id: _omitUserId, ...safe } = redacted;
  return successResponse(safe);
}

async function canManageOwnerSensitiveOps(
  user: { id: string; role?: string },
  request?: PermissionRequestContext,
): Promise<boolean> {
  if (user.role === "superadmin") return true;
  return isProviderOwner(user.id, request);
}

async function countOwners(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("provider_staff")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("role", "owner");
  if (error) {
    console.warn("countOwners:", error);
    return 1;
  }
  return count ?? 0;
}

function mapDbRoleToApi(dbRole: string | null | undefined): string {
  if (dbRole === "owner") return "provider_owner";
  if (dbRole === "manager") return "provider_manager";
  return "provider_staff";
}

async function fetchStaffDetailForApi(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  staffId: string,
  providerId: string,
): Promise<Record<string, unknown> | null> {
  const { data: row, error } = await supabase
    .from("provider_staff")
    .select(
      `
        id,
        user_id,
        provider_id,
        name,
        email,
        phone,
        avatar_url,
        role,
        is_active,
        mobile_ready,
        commission_rate,
        commission_enabled,
        users:user_id(id, full_name, email, phone, avatar_url)
      `,
    )
    .eq("id", staffId)
    .eq("provider_id", providerId)
    .single();

  if (error || !row) return null;

  const r = row as {
    id: string;
    user_id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    role?: string;
    is_active?: boolean | null;
    mobile_ready?: boolean | null;
    commission_rate?: number | null;
    users?: { full_name?: string; email?: string; phone?: string; avatar_url?: string } | null;
  };

  const locations: Array<{
    location_id: string;
    location_name: string | null;
    location_city: string | null;
    is_primary: boolean;
  }> = [];

  try {
    const { data: assignments } = await supabase
      .from("provider_staff_locations")
      .select("location_id, is_primary")
      .eq("staff_id", staffId);
    const assignmentRows = assignments ?? [];
    if (assignmentRows.length > 0) {
      const locationIds = assignmentRows.map((a: { location_id: string }) => a.location_id);
      const { data: locationDetails } = await supabase
        .from("provider_locations")
        .select("id, name, city")
        .in("id", locationIds);
      const locMap = new Map((locationDetails ?? []).map((loc: { id: string; name?: string; city?: string }) => [loc.id, loc]));
      for (const sl of assignmentRows as { location_id: string; is_primary?: boolean }[]) {
        const loc = locMap.get(sl.location_id);
        locations.push({
          location_id: sl.location_id,
          location_name: loc?.name ?? null,
          location_city: loc?.city ?? null,
          is_primary: sl.is_primary ?? false,
        });
      }
    }
  } catch (e) {
    console.warn("fetchStaffDetail locations:", e);
  }

  const { data: svcRows } = await supabase
    .from("staff_service_assignments")
    .select("service_id")
    .eq("staff_id", staffId);
  const service_ids = (svcRows ?? []).map((x: { service_id: string }) => x.service_id);

  const apiRole = mapDbRoleToApi(r.role);

  return {
    id: r.id,
    user_id: r.user_id ?? null,
    name: r.name || r.users?.full_name || "Staff Member",
    email: r.email || r.users?.email || "",
    phone: r.phone || r.users?.phone || null,
    avatar_url: r.avatar_url || r.users?.avatar_url || null,
    role: apiRole,
    is_active: r.is_active ?? true,
    mobileReady: r.mobile_ready ?? false,
    commission_rate: r.commission_rate ?? null,
    locations,
    primary_location_id: locations.find((l) => l.is_primary)?.location_id ?? null,
    service_ids,
  };
}

/**
 * GET /api/provider/staff/[id]
 *
 * Get a specific staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    return respondWithStaffDetail(supabase, user.id, id, providerId, request);
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff member");
  }
}

/**
 * PATCH /api/provider/staff/[id]
 *
 * Update a staff member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const ownStaffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
    const editingSelf = ownStaffId === id;

    const canManageTeam =
      user.role === "superadmin" ||
      (await isProviderOwner(user.id, request)) ||
      (await hasPermission(user.id, "manage_team", undefined, request));

    if (!canManageTeam && !editingSelf) {
      return errorResponse(
        "You do not have permission to update team members.",
        "FORBIDDEN",
        403,
      );
    }

    if (!canManageTeam && editingSelf) {
      const selfParsed = selfEditStaffSchema.safeParse(body);
      if (!selfParsed.success) {
        return errorResponse("Validation failed", "VALIDATION_ERROR", 400, selfParsed.error.issues);
      }
      const d = selfParsed.data;
      const updateData: Record<string, unknown> = {};
      if (d.name !== undefined) updateData.name = d.name;
      if (d.phone !== undefined) updateData.phone = d.phone;
      if (d.avatar_url !== undefined) updateData.avatar_url = d.avatar_url;
      if (d.mobileReady !== undefined) updateData.mobile_ready = d.mobileReady;
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase.from("provider_staff").update(updateData).eq("id", id);
        if (updateError) {
          throw updateError;
        }
      }
      return respondWithStaffDetail(supabase, user.id, id, providerId, request);
    }

    const validationResult = updateStaffSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues,
      );
    }

    const replaceLocations = Object.prototype.hasOwnProperty.call(body, "location_ids");
    const replaceServices = Object.prototype.hasOwnProperty.call(body, "service_ids");

    const { data: existingRow, error: existingErr } = await supabase
      .from("provider_staff")
      .select("id, role, user_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (existingErr || !existingRow) {
      return notFoundResponse("Staff member not found");
    }

    const existing = existingRow as { id: string; role: string; user_id?: string | null };
    const ownerOps = await canManageOwnerSensitiveOps(user, request);

    if (existing.role === "owner" && !ownerOps) {
      return errorResponse(
        "Only the business owner can change this team member.",
        "FORBIDDEN",
        403,
      );
    }

    const newRoleApi = validationResult.data.role;
    if (newRoleApi === "provider_owner" && existing.role !== "owner") {
      if (!ownerOps) {
        return errorResponse(
          "Only the business owner can assign the owner role.",
          "FORBIDDEN",
          403,
        );
      }
    }

    if (existing.role === "owner" && newRoleApi !== undefined && newRoleApi !== "provider_owner") {
      const n = await countOwners(supabase, providerId);
      if (n <= 1) {
        return errorResponse(
          "Cannot demote the only business owner. Add another owner first.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    const d = validationResult.data;
    if (d.name !== undefined) updateData.name = d.name;
    if (d.email !== undefined) updateData.email = d.email;
    if (d.phone !== undefined) updateData.phone = d.phone;
    if (d.avatar_url !== undefined) updateData.avatar_url = d.avatar_url;
    if (d.role !== undefined) {
      const dbRole =
        d.role === "provider_owner" ? "owner" : d.role === "provider_manager" ? "manager" : "employee";
      updateData.role = dbRole;
    }
    if (d.is_active !== undefined) updateData.is_active = d.is_active;
    if (d.mobileReady !== undefined) updateData.mobile_ready = d.mobileReady;
    if (d.commission_rate !== undefined) {
      if (d.commission_rate === null) {
        updateData.commission_rate = null;
        updateData.commission_enabled = false;
      } else {
        updateData.commission_rate = d.commission_rate;
        updateData.commission_enabled = true;
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase.from("provider_staff").update(updateData).eq("id", id);
      if (updateError) {
        throw updateError;
      }
    }

    if (d.is_active === false && existing.user_id) {
      await syncPortalRoleAfterWorkplaceChange(existing.user_id);
    }

    if (replaceLocations) {
      const locIds = d.location_ids ?? [];
      await supabase.from("provider_staff_locations").delete().eq("staff_id", id);
      if (locIds.length > 0) {
        const { data: locs } = await supabase
          .from("provider_locations")
          .select("id")
          .eq("provider_id", providerId)
          .in("id", locIds);
        const valid = new Set((locs ?? []).map((l: { id: string }) => l.id));
        const assignments = locIds
          .filter((lid) => valid.has(lid))
          .map((locId, i) => ({
            staff_id: id,
            location_id: locId,
            is_primary: i === 0,
          }));
        if (assignments.length > 0) {
          await supabase.from("provider_staff_locations").insert(assignments);
        }
      }
    }

    if (replaceServices) {
      const sids = d.service_ids ?? [];
      await supabase.from("staff_service_assignments").delete().eq("staff_id", id);
      if (sids.length > 0) {
        await supabase.from("staff_service_assignments").insert(
          sids.map((sid: string) => ({ staff_id: id, service_id: sid })),
        );
        await supabase.from("provider_staff").update({ assigned_service_ids: sids }).eq("id", id);
      } else {
        await supabase.from("provider_staff").update({ assigned_service_ids: [] }).eq("id", id);
      }
    }

    return respondWithStaffDetail(supabase, user.id, id, providerId, request);
  } catch (error) {
    return handleApiError(error, "Failed to update staff member");
  }
}

/**
 * DELETE /api/provider/staff/[id]
 *
 * Remove a staff member
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: existingRow, error: existingErr } = await supabase
      .from("provider_staff")
      .select("id, role, user_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (existingErr || !existingRow) {
      return notFoundResponse("Staff member not found");
    }

    const existing = existingRow as { id: string; role: string; user_id?: string | null };
    const ownerOps = await canManageOwnerSensitiveOps(user, request);

    if (existing.role === "owner") {
      if (!ownerOps) {
        return errorResponse(
          "Only the business owner can remove this account.",
          "FORBIDDEN",
          403,
        );
      }
      const n = await countOwners(supabase, providerId);
      if (n <= 1) {
        return errorResponse("Cannot remove the only business owner.", "VALIDATION_ERROR", 400);
      }
    }

    const { error: deleteError } = await supabase.from("provider_staff").delete().eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    if (existing.user_id) {
      await syncPortalRoleAfterWorkplaceChange(existing.user_id);
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete staff member");
  }
}
