import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { z } from "zod";

const configKey = "default";

const patchSchema = z.object({
  tracking_enabled_global: z.boolean().optional(),
  tracking_ping_interval_seconds: z.number().int().min(5).max(120).optional(),
  tracking_arrival_radius_meters: z.number().min(20).max(500).optional(),
  retention_days_raw_pings: z.number().int().min(1).max(365).optional(),
  privacy_fuzz_meters_default: z.number().min(0).max(1000).optional(),
  map_default_zoom: z.number().min(1).max(20).optional(),
  map_default_center: z.object({ lng: z.number(), lat: z.number() }).optional(),
});

export type GodsEyeConfig = {
  tracking_enabled_global: boolean;
  tracking_ping_interval_seconds: number;
  tracking_arrival_radius_meters: number;
  retention_days_raw_pings: number;
  privacy_fuzz_meters_default: number;
  map_default_zoom: number;
  map_default_center: { lng: number; lat: number };
};

/**
 * GET /api/admin/gods-eye/config
 * Superadmin only. Returns tracking config (default key).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const { data, error } = await supabase
      .from("gods_eye_tracking_config")
      .select("value")
      .eq("key", configKey)
      .single();

    if (error) throw error;
    const value = (data?.value ?? {}) as Record<string, unknown>;
    const config: GodsEyeConfig = {
      tracking_enabled_global: value.tracking_enabled_global as boolean ?? true,
      tracking_ping_interval_seconds: (value.tracking_ping_interval_seconds as number) ?? 15,
      tracking_arrival_radius_meters: (value.tracking_arrival_radius_meters as number) ?? 100,
      retention_days_raw_pings: (value.retention_days_raw_pings as number) ?? 30,
      privacy_fuzz_meters_default: (value.privacy_fuzz_meters_default as number) ?? 200,
      map_default_zoom: (value.map_default_zoom as number) ?? 10,
      map_default_center: (value.map_default_center as { lng: number; lat: number }) ?? { lng: 28.0473, lat: -26.2041 },
    };
    return successResponse(config);
  } catch (error) {
    return handleApiError(error, "Failed to load config");
  }
}

/**
 * PATCH /api/admin/gods-eye/config
 * Superadmin only. Update tracking config (merge into default key).
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parse = patchSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("gods_eye_tracking_config")
      .select("value")
      .eq("key", configKey)
      .single();

    if (fetchErr) throw fetchErr;
    const current = (existing?.value ?? {}) as Record<string, unknown>;
    const nextValue = { ...current, ...parse.data };

    const { data: updated, error: updateErr } = await supabase
      .from("gods_eye_tracking_config")
      .update({ value: nextValue, updated_at: new Date().toISOString() })
      .eq("key", configKey)
      .select("value")
      .single();

    if (updateErr) throw updateErr;
    return successResponse(updated?.value ?? nextValue);
  } catch (error) {
    return handleApiError(error, "Failed to update config");
  }
}
