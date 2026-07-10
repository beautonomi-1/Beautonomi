import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { z } from "zod";

const updateSchema = z.object({
  display_name: z.string().min(1).optional(),
  location_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.display_name != null) updates.display_name = parsed.data.display_name;
    if (parsed.data.location_id !== undefined) updates.location_id = parsed.data.location_id;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { data, error } = await supabase
      .from("paycloud_terminals")
      .update(updates)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null, error: { message: "Card machine not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    console.error("PUT /api/provider/paycloud/terminals/[id]:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to update card machine", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { error } = await supabase
      .from("paycloud_terminals")
      .update({ status: "decommissioned", is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) throw error;
    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error: any) {
    console.error("DELETE /api/provider/paycloud/terminals/[id]:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to remove card machine", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
