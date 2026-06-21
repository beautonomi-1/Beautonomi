import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const patchSchema = z.object({
  items: z.array(
    z.object({
      channel: z.string(),
      category: z.string().default("default"),
      unit_cost_zar: z.coerce.number().min(0),
      description: z.string().optional(),
    }),
  ),
});

/**
 * GET /api/admin/marketing/pricebook
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("marketing_channel_pricebook")
      .select("*")
      .order("channel")
      .order("category");

    if (error) throw error;
    return successResponse({ items: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch marketing pricebook");
  }
}

/**
 * PATCH /api/admin/marketing/pricebook
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const body = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    for (const item of body.items) {
      const { error } = await supabase.from("marketing_channel_pricebook").upsert(
        {
          channel: item.channel,
          category: item.category,
          unit_cost_zar: item.unit_cost_zar,
          description: item.description ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel,category" },
      );
      if (error) throw error;
    }

    const { data } = await supabase.from("marketing_channel_pricebook").select("*").order("channel");
    return successResponse({ items: data ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update marketing pricebook");
  }
}
