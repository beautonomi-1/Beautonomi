import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import {
  deactivatePaystackVirtualTerminal,
  updatePaystackVirtualTerminal,
} from "@/lib/payments/paystack-virtual-terminal";
import { buildPaystackTerminalName } from "@/lib/payments/paystack-terminal-assets";

const updateTerminalSchema = z.object({
  name: z.string().trim().min(1).optional(),
  location_id: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

async function resolveProvider(request: NextRequest) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  return { supabase, user, providerId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return errorResponse("Terminal not found", "NOT_FOUND", 404);
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack terminal");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = updateTerminalSchema.parse(await request.json());
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    const admin = getSupabaseAdmin();

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: existing, error: existingError } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("*, provider:providers(tenant_id, business_name, user_id), location:provider_locations(id, name)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return errorResponse("Terminal not found", "NOT_FOUND", 404);

    const updatePayload: Record<string, unknown> = {};
    const tenantId = (existing as { provider?: { tenant_id?: string | null } | null }).provider?.tenant_id ?? null;
    if (body.name !== undefined || body.location_id !== undefined) {
      const nextDisplayName = body.name?.trim() || existing.display_name || existing.location?.name || "Front desk";
      let nextLocationName = existing.location?.name ?? null;
      if (body.location_id) {
        const { data: nextLocation } = await admin
          .from("provider_locations")
          .select("id, name")
          .eq("id", body.location_id)
          .eq("provider_id", providerId)
          .maybeSingle();
        nextLocationName = (nextLocation as { name?: string | null } | null)?.name ?? null;
      } else if (body.location_id === null) {
        nextLocationName = null;
      }
      const nextLocationId = body.location_id !== undefined ? body.location_id : existing.location_id;
      const nextPaystackName = buildPaystackTerminalName({
        providerBusinessName: existing.provider?.business_name ?? null,
        locationName: nextLocationName,
        requestedName: nextDisplayName,
        uniqueSuffix: providerId,
        portable: !nextLocationId,
      });
      if (nextPaystackName !== existing.name) {
        await updatePaystackVirtualTerminal(existing.terminal_code, { name: nextPaystackName }, { tenantId });
        updatePayload.name = nextPaystackName;
      }
      updatePayload.display_name = nextDisplayName;
    }
    if (body.active === false && existing.active !== false) {
      await deactivatePaystackVirtualTerminal(existing.terminal_code, { tenantId });
      updatePayload.active = false;
      updatePayload.status = "inactive";
    } else if (body.active === true) {
      updatePayload.active = true;
      updatePayload.status = "active";
    }
    if (body.location_id !== undefined) {
      updatePayload.location_id = body.location_id;
    }

    if (Object.keys(updatePayload).length === 0) return successResponse(existing);

    const { data, error } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .update({ ...updatePayload, last_synced_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();
    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update Paystack terminal");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    const admin = getSupabaseAdmin();

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: existing, error: existingError } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("id, terminal_code, provider:providers(tenant_id)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return errorResponse("Terminal not found", "NOT_FOUND", 404);

    const tenantId = (existing as { provider?: { tenant_id?: string | null } | null }).provider?.tenant_id ?? null;
    await deactivatePaystackVirtualTerminal(existing.terminal_code, { tenantId });
    const { error } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .update({
        active: false,
        status: "inactive",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId);
    if (error) throw error;

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete Paystack terminal");
  }
}
