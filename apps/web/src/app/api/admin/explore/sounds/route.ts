import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  storage_path: z.string().min(1),
  duration_ms: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const owner = new URL(request.url).searchParams.get("owner") ?? "platform";
    let q = supabase
      .from("explore_sounds")
      .select("id, title, owner_type, provider_id, storage_path, duration_ms, is_hidden, created_at")
      .order("created_at", { ascending: false });
    if (owner === "platform") q = q.eq("owner_type", "platform");
    const { data, error } = await q;
    if (error) return handleApiError(error, "Failed to list sounds");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return successResponse({
      data: (data ?? []).map((s) => ({
        ...s,
        public_url: toPublicMediaUrl(s.storage_path, url),
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to list sounds");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Invalid input", "VALIDATION_ERROR", 400);
    const path = parsed.data.storage_path.replace(/^\//, "");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("explore_sounds")
      .insert({
        title: parsed.data.title.trim(),
        owner_type: "platform",
        provider_id: null,
        storage_path: path,
        duration_ms: parsed.data.duration_ms ?? null,
      })
      .select("id, title, storage_path")
      .single();
    if (error) return handleApiError(error, "Failed to create platform sound");
    return successResponse(data, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create platform sound");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json().catch(() => ({}));
    const id = body.id as string | undefined;
    if (!id) return errorResponse("id is required", "VALIDATION_ERROR", 400);
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.is_hidden === "boolean") updates.is_hidden = body.is_hidden;
    if (typeof body.title === "string") updates.title = body.title.trim();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("explore_sounds").update(updates).eq("id", id);
    if (error) return handleApiError(error, "Failed to update sound");
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update sound");
  }
}
