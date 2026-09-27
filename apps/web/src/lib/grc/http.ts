import { NextRequest } from "next/server";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import type { GrcPermissionKey } from "@beautonomi/admin-access";
import { grcBadRequest } from "./errors";

export type GrcContext = Awaited<ReturnType<typeof requireGrcPermission>>;

export function grcGetHandler(viewPermission: GrcPermissionKey, load: (ctx: GrcContext, request: NextRequest) => Promise<unknown>) {
  return async function GET(request: NextRequest) {
    try {
      const ctx = await requireGrcPermission(viewPermission, request);
      return successResponse(await load(ctx, request));
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw grcBadRequest("Expected a JSON object body");
  return body as Record<string, unknown>;
}
