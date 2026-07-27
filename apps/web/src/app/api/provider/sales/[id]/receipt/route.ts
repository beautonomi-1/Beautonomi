import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { buildSaleReceiptPayload } from "@/lib/receipts/build-sale-receipt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let user: { id: string; role: string };
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "provider_sale_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      const { data: userRow } = await admin
        .from("users")
        .select("id, role")
        .eq("id", parsed.userId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "provider_owner",
      };
    } else {
      const authed = await requireRoleInApi(
        ["provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = { id: authed.user.id, role: authed.user.role as string };
    }

    const { data: saleRaw, error } = await admin
      .from("sales")
      .select("*, sale_items(*)")
      .eq("id", id)
      .maybeSingle();

    if (error || !saleRaw) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    const sale = saleRaw as Record<string, unknown> & {
      provider_id?: string;
      customer_id?: string | null;
      staff_id?: string | null;
      sale_items?: unknown[];
    };

    if (user.role !== "superadmin") {
      const pid = sale.provider_id;
      if (!pid || !(await userHasProviderAccessAdmin(admin, user.id, pid))) {
        return forbiddenResponse("You do not have access to this sale");
      }
    }

    const [{ data: providerRow }, customerRow, staffRow] = await Promise.all([
      admin
        .from("providers")
        .select("id, business_name, receipt_header, receipt_footer, tenant_id")
        .eq("id", sale.provider_id as string)
        .maybeSingle(),
      sale.customer_id
        ? admin
            .from("users")
            .select("id, full_name, email, phone")
            .eq("id", sale.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sale.staff_id
        ? admin
            .from("provider_staff")
            .select("id, name")
            .eq("id", sale.staff_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const tenantRegion = (providerRow as { tenant_id?: string | null } | null)?.tenant_id
      ? await getTenantRegionConfig((providerRow as { tenant_id: string }).tenant_id)
      : null;
    const currency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const receipt = buildSaleReceiptPayload({
      sale,
      items: (sale.sale_items ?? []) as Parameters<typeof buildSaleReceiptPayload>[0]["items"],
      provider: providerRow as Parameters<typeof buildSaleReceiptPayload>[0]["provider"],
      customer: (customerRow.data ?? null) as Parameters<typeof buildSaleReceiptPayload>[0]["customer"],
      staff: (staffRow.data ?? null) as Parameters<typeof buildSaleReceiptPayload>[0]["staff"],
      currency,
    });

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating sale receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate sale receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
