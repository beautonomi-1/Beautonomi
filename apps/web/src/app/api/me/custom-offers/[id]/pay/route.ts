import type { NextRequest } from "next/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { postCustomOfferAccept } from "../../_helpers/post-custom-offer-accept";

/** Canonical checkout endpoint (alias of `/accept` today; extended for wallet/gift/loyalty when flag is on). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleInApi(["customer", "superadmin"], request);
  return postCustomOfferAccept(request, ctx, auth);
}
