import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: invoices } = await supabaseAdmin
      .from("subscription_invoices")
      .select("id, amount, currency, status, description, created_at, invoice_url")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!invoices || invoices.length === 0) {
      const { data: txns } = await supabaseAdmin
        .from("finance_transactions")
        .select("id, amount, created_at, metadata")
        .eq("provider_id", providerId)
        .eq("transaction_type", "subscription_payment")
        .order("created_at", { ascending: false })
        .limit(20);

      const items = (txns || []).map((t: any) => ({
        id: t.id,
        amount: Number(t.amount || 0),
        currency: "ZAR",
        status: "paid",
        description: "Subscription payment",
        created_at: t.created_at,
        invoice_url: null,
      }));

      return successResponse(items);
    }

    return successResponse(invoices);
  } catch (error) {
    console.error("Error fetching billing history:", error);
    return handleApiError(error, "Failed to load billing history");
  }
}
