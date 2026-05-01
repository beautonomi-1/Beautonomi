import { NextRequest } from "next/server";
import { forwardSameOrigin } from "@/app/api/provider/calendar/_forward-internal";

/**
 * Legacy alias: `/calendar/syncs/[id]` → `/calendar/sync/[id]`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forwardSameOrigin(request, `/api/provider/calendar/sync/${id}`, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forwardSameOrigin(request, `/api/provider/calendar/sync/${id}`, "DELETE");
}
