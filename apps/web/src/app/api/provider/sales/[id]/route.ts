import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";

const patchBodySchema = z.object({
  payment_status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
  payment_provider: z.string().max(64).optional().nullable(),
  payment_provider_id: z.string().max(200).optional().nullable(),
});

/**
 * PATCH /api/provider/sales/[id]
 * Update a sale owned by the current provider (e.g. mark Yoco terminal sale completed after payment).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("create_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id: saleId } = await params;

    const body = await request.json();
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return handleApiError(new Error("Invalid body"), "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const updates: Record<string, unknown> = {};
    if (parsed.data.payment_status !== undefined) {
      updates.payment_status = parsed.data.payment_status;
    }
    if (parsed.data.payment_provider !== undefined) {
      updates.payment_provider = parsed.data.payment_provider;
    }
    if (parsed.data.payment_provider_id !== undefined) {
      updates.payment_provider_id = parsed.data.payment_provider_id;
    }

    if (Object.keys(updates).length === 0) {
      return handleApiError(new Error("No valid fields to update"), "VALIDATION_ERROR", 400);
    }

    const { data: existingSale, error: existingErr } = await supabase
      .from("sales")
      .select("id, payment_status, payment_provider, payment_provider_id")
      .eq("id", saleId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (existingErr || !existingSale) {
      return notFoundResponse("Sale not found");
    }

    const nextPaymentStatus =
      parsed.data.payment_status !== undefined
        ? parsed.data.payment_status
        : (existingSale.payment_status as string);
    const becomingCompleted =
      existingSale.payment_status === "pending" && nextPaymentStatus === "completed";

    let itemsForStock: Array<{
      type?: string;
      item_id?: string | null;
      product_variant_id?: string | null;
      quantity?: number;
    }> = [];

    if (becomingCompleted) {
      const { data: lineRows, error: lineErr } = await supabase
        .from("sale_items")
        .select("item_type, item_id, product_variant_id, quantity")
        .eq("sale_id", saleId);

      if (lineErr) {
        return handleApiError(lineErr, "Failed to load sale lines", "INTERNAL_ERROR", 500);
      }

      itemsForStock = (lineRows || []).map((row: Record<string, unknown>) => ({
        type: row.item_type as string,
        item_id: (row.item_id as string | null) ?? null,
        product_variant_id: (row.product_variant_id as string | null) ?? null,
        quantity: Number(row.quantity ?? 1),
      }));

      const stockError = await validatePosProductStock(supabase, providerId, itemsForStock);
      if (stockError) {
        return handleApiError(new Error(stockError), stockError, "STOCK_ERROR", 400);
      }
    }

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .update(updates)
      .eq("id", saleId)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (saleError || !sale) {
      return notFoundResponse("Sale not found");
    }

    if (becomingCompleted) {
      try {
        await applyPosProductStockDecrements(supabase, itemsForStock);
      } catch (stockErr) {
        await supabase
          .from("sales")
          .update({
            payment_status: existingSale.payment_status,
            payment_provider: existingSale.payment_provider,
            payment_provider_id: existingSale.payment_provider_id,
          })
          .eq("id", saleId)
          .eq("provider_id", providerId);

        return handleApiError(
          stockErr instanceof Error ? stockErr : new Error(String(stockErr)),
          "Sale was left pending: inventory could not be updated. Try again or check product stock.",
          "SALE_STOCK_FAILED",
          500,
        );
      }
    }

    const { data: fetchedSaleItems } = await supabase
      .from("sale_items")
      .select("*")
      .eq("sale_id", sale.id);

    let clientName: string | null = null;
    let staffName: string | null = null;

    if (sale.customer_id) {
      const { data: customer } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", sale.customer_id)
        .single();
      clientName = customer?.full_name ?? null;
    }

    if (sale.staff_id) {
      const { data: staff } = await supabase
        .from("provider_staff")
        .select("name")
        .eq("id", sale.staff_id)
        .single();
      staffName = staff?.name ?? null;
    }

    return successResponse({
      id: sale.id,
      ref_number: sale.ref_number || sale.sale_number,
      client_name: clientName,
      date: sale.sale_date,
      items: (fetchedSaleItems || []).map((item: Record<string, unknown>) => ({
        id: item.id,
        type: item.item_type,
        name: item.item_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total: Number(item.total_price),
        item_id: item.item_id ?? null,
        product_variant_id: item.product_variant_id ?? null,
      })),
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax_amount),
      total: Number(sale.total_amount),
      payment_method: sale.payment_method,
      payment_status: sale.payment_status,
      team_member_id: sale.staff_id || null,
      team_member_name: staffName,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update sale");
  }
}
