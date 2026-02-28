import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkResourceAvailability } from "@/lib/resources/assignment";

/**
 * POST /api/public/providers/[slug]/availability/resources/check
 * Check which resources are available for a time range.
 * Body: { resource_ids: string[], start_at: string (ISO), end_at: string (ISO) }
 *       or { resource_ids: string[], date: string (YYYY-MM-DD), time: string (HH:MM), duration_minutes?: number }
 * Returns: { available: Record<resourceId, boolean> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));

    const resourceIds = Array.isArray(body.resource_ids)
      ? body.resource_ids.filter((id: unknown) => typeof id === "string")
      : [];
    if (resourceIds.length === 0) {
      return NextResponse.json({ available: {}, error: null });
    }

    let startAt: Date;
    let endAt: Date;

    if (body.start_at && body.end_at) {
      startAt = new Date(body.start_at);
      endAt = new Date(body.end_at);
    } else if (body.date && body.time) {
      const durationMinutes = typeof body.duration_minutes === "number" ? body.duration_minutes : 60;
      const dateStr = String(body.date).trim();
      const timeStr = String(body.time).trim();
      startAt = new Date(`${dateStr}T${timeStr}:00`);
      endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
    } else {
      return NextResponse.json(
        { available: {}, error: { message: "Provide start_at/end_at or date/time and optional duration_minutes" } },
        { status: 400 }
      );
    }

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json(
        { available: {}, error: { message: "Invalid date or time" } },
        { status: 400 }
      );
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", decodeURIComponent(slug))
      .eq("status", "active")
      .maybeSingle();

    if (!provider) {
      return NextResponse.json(
        { available: {}, error: { message: "Provider not found" } },
        { status: 404 }
      );
    }

    const result = await checkResourceAvailability(
      supabase,
      resourceIds,
      startAt,
      endAt
    );

    const available: Record<string, boolean> = {};
    for (const id of resourceIds) {
      available[id] = !result.conflicts.some((c) => c.resource_id === id);
    }

    return NextResponse.json({ available, error: null });
  } catch (error) {
    console.error("Error in POST resources/check:", error);
    return NextResponse.json(
      { available: {}, error: { message: "Failed to check availability" } },
      { status: 500 }
    );
  }
}
