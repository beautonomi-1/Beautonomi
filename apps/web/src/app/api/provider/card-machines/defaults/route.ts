import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

const bodySchema = z.object({
  machine_provider: z.enum(["yoco", "paycloud"]),
  machine_id: z.string().uuid(),
  location_id: z.string().uuid().nullable().optional(),
  staff_user_id: z.string().uuid().nullable().optional(),
});

/**
 * PUT /api/provider/card-machines/defaults
 * Owner-only: set default machine for global, location, or staff scope.
 */
export async function PUT(request: Request) {
  const auth = await requireRole(["provider_owner"], request);
  if (!auth) return unauthorizedResponse("Authentication required");

  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
  if (!providerId) {
    return NextResponse.json(
      { data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } },
      { status: 404 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { message: "Invalid JSON", code: "INVALID_JSON" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.message, code: "VALIDATION_ERROR" } },
      { status: 400 },
    );
  }

  const { machine_provider, machine_id, location_id, staff_user_id } = parsed.data;
  const loc = location_id ?? null;
  const staff = staff_user_id ?? null;

  const { data: existing } = await supabase
    .from("provider_card_machine_defaults")
    .select("id")
    .eq("provider_id", providerId)
    .is("location_id", loc)
    .is("staff_user_id", staff)
    .maybeSingle();

  const row = {
    provider_id: providerId,
    location_id: loc,
    staff_user_id: staff,
    machine_provider,
    machine_id,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("provider_card_machine_defaults")
      .update(row)
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: "UPDATE_FAILED" } },
        { status: 500 },
      );
    }
  } else {
    const { error } = await supabase.from("provider_card_machine_defaults").insert(row);
    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: "INSERT_FAILED" } },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
