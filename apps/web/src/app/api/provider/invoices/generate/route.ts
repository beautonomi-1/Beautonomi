import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/invoices/generate
 * Generate invoice for platform fees (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Only superadmin can generate invoices
    const { requireRoleInApi, unauthorizedResponse } = await import("@/lib/supabase/api-helpers");
    const { user } = await requireRoleInApi(["superadmin"], request);
    
    if (!user) {
      return unauthorizedResponse("Superadmin access required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { providerId, periodStart, periodEnd, invoiceType = "platform_fee" } = body;

    if (!providerId || !periodStart || !periodEnd) {
      return handleApiError(
        new Error("Missing required fields"),
        "Provider ID, period start, and period end are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify provider exists
    const { data: providerData, error: providerError } = await supabase
      .from("providers")
      .select("id, business_name, billing_email, billing_address")
      .eq("id", providerId)
      .single();

    if (providerError || !providerData) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Calculate fees based on invoice type
    const lineItems: any[] = [];
    let subtotal = 0;

    if (invoiceType === "platform_fee" || invoiceType === "commission") {
      // Get all completed bookings in the period
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("id, total_amount, service_fee_amount, service_fee_percentage, completed_at, ref_number")
        .eq("provider_id", providerId)
        .eq("status", "completed")
        .gte("completed_at", periodStart)
        .lte("completed_at", periodEnd)
        .order("completed_at", { ascending: true });

      if (bookingsError) {
        throw bookingsError;
      }

      // Get provider fee config to determine commission rate
      const { data: providerFee } = await supabase
        .from("providers")
        .select("provider_fee_config_id")
        .eq("id", providerId)
        .single();

      // Default commission rate (15% of booking total)
      let commissionRate = 0.15;
      if (providerFee?.provider_fee_config_id) {
        const { data: feeConfig } = await supabase
          .from("platform_fee_config")
          .select("fee_percentage, fee_type")
          .eq("id", providerFee.provider_fee_config_id)
          .single();
        
        if (feeConfig?.fee_type === "percentage" && feeConfig.fee_percentage) {
          commissionRate = feeConfig.fee_percentage / 100;
        }
      }
      
      for (const booking of bookings || []) {
        // Calculate commission based on booking total
        const commissionAmount = booking.total_amount * commissionRate;
        subtotal += commissionAmount;

        lineItems.push({
          line_item_type: invoiceType === "commission" ? "commission" : "platform_fee",
          description: `${invoiceType === "commission" ? "Commission" : "Platform fee"} for booking ${booking.ref_number || booking.id.substring(0, 8)}`,
          quantity: 1,
          unit_price: commissionAmount,
          total_price: commissionAmount,
          reference_type: "booking",
          reference_id: booking.id,
          metadata: {
            booking_total: booking.total_amount,
            commission_rate: commissionRate,
            completed_at: booking.completed_at,
            booking_ref: booking.ref_number,
          },
        });
      }
    }

    if (invoiceType === "subscription") {
      // Subscription revenue from finance_transactions in the period
      const { data: subscriptionRows, error: subError } = await supabase
        .from("finance_transactions")
        .select("id, amount, net, created_at, description")
        .eq("provider_id", providerId)
        .eq("transaction_type", "provider_subscription_payment")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .order("created_at", { ascending: true });

      if (!subError && subscriptionRows?.length) {
        const totalSub = subscriptionRows.reduce((sum, r) => sum + Number(r.net ?? r.amount ?? 0), 0);
        subtotal += totalSub;
        lineItems.push({
          line_item_type: "subscription",
          description: `Provider subscription (${subscriptionRows.length} payment(s) in period)`,
          quantity: 1,
          unit_price: totalSub,
          total_price: totalSub,
          reference_type: "subscription",
          reference_id: null,
          metadata: {
            payment_count: subscriptionRows.length,
            period_start: periodStart,
            period_end: periodEnd,
          },
        });
      }
    }

    // Get tax rate from platform_settings.settings.taxes.default_tax_rate (JSONB)
    const { data: settingsRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const taxes = (settingsRow?.settings as Record<string, unknown>)?.taxes as Record<string, unknown> | undefined;
    const taxRate = (taxes?.default_tax_rate as number) ?? 15;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const year = new Date().getFullYear();
    const { data: lastInvoice } = await supabase
      .from("provider_invoices")
      .select("invoice_number")
      .like("invoice_number", `INV-${year}-%`)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .single();

    let sequenceNum = 1;
    if (lastInvoice?.invoice_number) {
      const match = lastInvoice.invoice_number.match(/INV-\d{4}-(\d+)/);
      if (match) {
        sequenceNum = parseInt(match[1], 10) + 1;
      }
    }

    const invoiceNumber = `INV-${year}-${sequenceNum.toString().padStart(6, "0")}`;

    // Calculate due date (30 days from issue date)
    const issueDate = new Date().toISOString().split("T")[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("provider_invoices")
      .insert({
        provider_id: providerId,
        invoice_number: invoiceNumber,
        invoice_type: invoiceType,
        period_start: periodStart,
        period_end: periodEnd,
        issue_date: issueDate,
        due_date: dueDate.toISOString().split("T")[0],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: "draft",
        description: `Invoice for ${invoiceType} from ${periodStart} to ${periodEnd}`,
        line_items: lineItems,
        created_by: user.id,
      })
      .select()
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    // Create line items
    if (lineItems.length > 0) {
      const lineItemsToInsert = lineItems.map((item) => ({
        invoice_id: invoice.id,
        ...item,
      }));

      const { error: lineItemsError } = await supabase
        .from("provider_invoice_line_items")
        .insert(lineItemsToInsert);

      if (lineItemsError) {
        console.error("Error creating line items:", lineItemsError);
        // Don't fail the request, invoice is already created
      }
    }

    // Fetch complete invoice with relations
    const { data: completeInvoice, error: fetchError } = await supabase
      .from("provider_invoices")
      .select(
        `
        *,
        line_items:provider_invoice_line_items(*)
      `
      )
      .eq("id", invoice.id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    return successResponse(completeInvoice);
  } catch (error) {
    return handleApiError(error, "Failed to generate invoice");
  }
}
