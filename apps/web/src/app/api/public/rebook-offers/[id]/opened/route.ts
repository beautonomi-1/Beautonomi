import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { markRebookOfferOpened } from "@/lib/bookings/rebook-offer-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return successResponse({ ok: false });
    }
    await markRebookOfferOpened(getSupabaseAdmin(), id.trim());
    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to record rebook offer open");
  }
}