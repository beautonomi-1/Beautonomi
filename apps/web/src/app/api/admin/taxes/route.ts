import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/taxes
 * 
 * Get tax configuration and rates
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    // Get tax rates from reference_data
    const { data: taxRates, error: taxError } = await supabase
      .from("reference_data")
      .select("*")
      .eq("type", "tax_rate")
      .order("display_order", { ascending: true });

    if (taxError) throw taxError;

    // Get provider-specific tax rates if provider_id is provided
    let providerTaxRate = null;
    if (providerId) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id, business_name, tax_rate_percent")
        .eq("id", providerId)
        .single();

      if (provider) {
        providerTaxRate = {
          provider_id: provider.id,
          provider_name: provider.business_name,
          tax_rate_percent: provider.tax_rate_percent || 0,
        };
      }
    }

    // Get platform-wide tax statistics
    const { data: bookings } = await supabase
      .from("bookings")
      .select("tax_amount, total_amount, status")
      .eq("status", "completed");

    const totalTaxCollected = bookings?.reduce((sum, b) => sum + (Number(b.tax_amount) || 0), 0) || 0;
    const totalRevenue = bookings?.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0) || 0;

    return successResponse({
      tax_rates: taxRates || [],
      provider_tax_rate: providerTaxRate,
      statistics: {
        total_tax_collected: totalTaxCollected,
        total_revenue: totalRevenue,
        tax_percentage: totalRevenue > 0 ? (totalTaxCollected / totalRevenue) * 100 : 0,
        total_bookings: bookings?.length || 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch tax data");
  }
}

/**
 * POST /api/admin/taxes
 * 
 * Create or update tax rate
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { provider_id, tax_rate_percent } = body;

    if (provider_id) {
      // Update provider-specific tax rate
      const { error } = await supabase
        .from("providers")
        .update({ tax_rate_percent: tax_rate_percent || 0 })
        .eq("id", provider_id);

      if (error) throw error;

      await writeAuditLog({
        actor_user_id: auth.user.id,
        actor_role: (auth.user as any).role || "superadmin",
        action: "admin.taxes.update_provider",
        entity_type: "provider",
        entity_id: provider_id,
        metadata: { tax_rate_percent },
      });

      return successResponse({ success: true });
    } else {
      // Create new tax rate in reference_data
      const { error } = await supabase
        .from("reference_data")
        .insert({
          type: "tax_rate",
          code: body.code,
          name: body.name,
          description: body.description,
          display_order: body.display_order || 999,
          metadata: { rate: body.rate, included: body.included || false },
        });

      if (error) throw error;

      await writeAuditLog({
        actor_user_id: auth.user.id,
        actor_role: (auth.user as any).role || "superadmin",
        action: "admin.taxes.create_rate",
        entity_type: "reference_data",
        entity_id: null,
        metadata: body,
      });

      return successResponse({ success: true });
    }
  } catch (error) {
    return handleApiError(error, "Failed to update tax configuration");
  }
}
