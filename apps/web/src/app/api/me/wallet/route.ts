import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    // Ensure wallet exists (created on signup, but be defensive)
    const { data: walletExisting } = await supabase
      .from("user_wallets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!walletExisting) {
      await (supabase.from("user_wallets") as any).insert({ user_id: user.id, currency: "ZAR" });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("user_wallets")
      .select("id, user_id, balance, currency, updated_at, created_at")
      .eq("user_id", user.id)
      .single();
    if (walletError) throw walletError;

    const { data: txs, error: txError } = await supabase
      .from("wallet_transactions")
      .select("id, wallet_id, type, amount, description, reference_id, reference_type, created_at")
      .eq("wallet_id", (wallet as any).id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (txError) throw txError;

    return successResponse({
      wallet,
      transactions: txs || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch wallet");
  }
}

