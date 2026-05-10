import type { NextRequest } from "next/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { postCustomOfferAccept } from "../../_helpers/post-custom-offer-accept";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleInApi(["customer", "superadmin"], request);
  return postCustomOfferAccept(request, ctx, auth);
}
