import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const admin = getServiceClient();
    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");

    let user: { id: string; role: string };
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "provider_terminal_order_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
      }
      const { data: userRow } = await admin.from("users").select("id, role").eq("id", parsed.userId).maybeSingle();
      if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 401 });
      user = userRow as { id: string; role: string };
    } else {
      const auth = await requireRoleInApi(["provider_owner", "provider_staff"], request);
      user = auth.user;
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return forbiddenResponse("Provider not found");

    const { data: order, error } = await admin
      .from("terminal_orders")
      .select(
        `id, order_status, invoice_status, commercial_model, quantity, unit_price, tax_amount, total_amount, currency, created_at, paystack_reference,
         providers(id, business_name, receipt_header, receipt_footer),
         terminal_products(id, name, vendor, model)`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderProviderId = String((order as { provider_id?: string }).provider_id ?? "");
    if (
      orderProviderId !== providerId &&
      !(await userHasProviderAccessAdmin(admin, user.id, orderProviderId))
    ) {
      return forbiddenResponse("You do not have access to this order");
    }

    const row = order as {
      id: string;
      order_status: string;
      invoice_status: string;
      commercial_model: string;
      quantity: number;
      unit_price: number;
      tax_amount: number;
      total_amount: number;
      currency: string;
      created_at: string;
      paystack_reference: string | null;
      providers?: {
        business_name?: string | null;
        receipt_header?: string | null;
        receipt_footer?: string | null;
      } | null;
      terminal_products?: { name?: string | null; vendor?: string | null; model?: string | null } | null;
    };

    return NextResponse.json({
      receipt: {
        order_id: row.id,
        order_date: row.created_at,
        order_status: row.order_status,
        invoice_status: row.invoice_status,
        commercial_model: row.commercial_model,
        reference: row.paystack_reference ?? row.id,
        product_name: row.terminal_products?.name ?? "Terminal device",
        vendor: row.terminal_products?.vendor ?? null,
        model: row.terminal_products?.model ?? null,
        quantity: row.quantity,
        unit_price: row.unit_price,
        tax: row.tax_amount,
        total: row.total_amount,
        currency: row.currency,
        provider: {
          business_name: row.providers?.business_name ?? null,
        },
        receipt_header: row.providers?.receipt_header ?? null,
        receipt_footer: row.providers?.receipt_footer ?? null,
      },
    });
  } catch (err) {
    console.error("[terminal-order-receipt]", err);
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}
