import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission, requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@supabase/supabase-js";
import {
  applyPosProductStockDecrementsReversible,
  restorePosProductStock,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";
import {
  createWalkInOrderFromLegacySale,
  isProductOnlyLegacySale,
} from "@/lib/provider-sales/create-walk-in-order-from-legacy-sale";
import {
  mapWalkInOrderToSaleShape,
  mergeSaleHistoryRows,
  type SaleHistoryRow,
} from "@/lib/provider-sales/map-walk-in-order-to-sale";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";
import { isBookingCollectionSale } from "@/lib/reports/provider-sales-history";
import {
  clampSaleDiscount,
  clampSaleTip,
  deriveSalePaymentStatus,
  normalizeSaleItemsServerSide,
} from "@/lib/provider-sales/normalize-sale-input";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  captureSaleGiftCard,
  reserveSaleGiftCard,
  saleGiftTenderMismatch,
  saleCardAmountStillDue,
  sumSaleGiftCardPaidBySaleIds,
  sumSuccessfulSaleCardTakenBySaleIds,
  voidSaleGiftCard,
} from "@/lib/gift-cards/sale-gift-card";
import {
  findCustomerIdsByContactSearchAmongIds,
  loadDistinctSaleCustomerIdsForProvider,
  MAX_INLINE_MATCH_IDS,
} from "@/lib/provider/client-contact-search";
import { subtractMoney, addMoney, computeVat } from "@beautonomi/utils";
import { resolveProviderVat } from "@/lib/tax/resolve-provider-vat";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

async function computeProviderSaleTax(
  supabase: SupabaseClient,
  providerId: string,
  taxableSubtotal: number,
  currency: string,
): Promise<{ taxAmount: number; taxRatePercent: number; inclusive: boolean }> {
  const subtotal = Math.max(0, Number(taxableSubtotal) || 0);
  const { data: providerRow } = await supabase
    .from("providers")
    .select(
      "tenant_id, tax_rate_percent, tax_inclusive, is_vat_registered, vat_number",
    )
    .eq("id", providerId)
    .maybeSingle();
  const vat = await resolveProviderVat(supabase, {
    ...(providerRow ?? {}),
    tax_rate_override_percent: null,
  });
  if (!vat.registered || subtotal <= 0 || vat.ratePercent <= 0) {
    return { taxAmount: 0, taxRatePercent: 0, inclusive: vat.inclusive };
  }
  const split = computeVat({
    baseAmount: subtotal,
    ratePercent: vat.ratePercent,
    inclusive: vat.inclusive,
    currency,
  });
  return { taxAmount: split.taxAmount, taxRatePercent: vat.ratePercent, inclusive: vat.inclusive };
}

/** Values allowed by `sales.payment_method` CHECK (see migration 129). */
const DB_SALE_PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "paystack",
  "yoco",
  "gift_card",
  "other",
]);

/** Align POS / appointment UI labels with DB constraint (e.g. EFT → other). */
function normalizeSalePaymentMethodForDb(raw: string | undefined | null): string {
  const m = String(raw || "cash").toLowerCase().trim();
  if (DB_SALE_PAYMENT_METHODS.has(m)) return m;
  if (
    m === "eft" ||
    m === "bank_transfer" ||
    m === "mobile" ||
    m === "online" ||
    m === "debit"
  ) {
    return "other";
  }
  return "other";
}

/**
 * GET /api/provider/sales
 * 
 * List sales for provider
 */
export async function GET(request: NextRequest) {
  try {
    // Align with finance/transactions: staff with reports or payment permissions can view POS sales.
    const permissionCheck = await requireAnyPermission(
      ["view_sales", "view_reports", "process_payments"],
      request,
    );
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { timezone: tz } = await getProviderReportContext(supabaseAdmin, providerId);
    const ymdParam = /^\d{4}-\d{2}-\d{2}$/;

    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const locationId = searchParams.get('location_id');
    const searchTerm = (search?.trim() || "").replace(/[(),]/g, "");
    const customerIdsMatchingSearch: string[] = [];

    if (searchTerm) {
      const saleCustomerIds = await loadDistinctSaleCustomerIdsForProvider(
        supabaseAdmin,
        providerId,
      );
      const matched = await findCustomerIdsByContactSearchAmongIds(
        supabaseAdmin,
        saleCustomerIds,
        searchTerm,
        [],
        { nameOnly: !canViewClients },
      );
      customerIdsMatchingSearch.push(...matched);
    }

    const applySalesListFilters = (query: any) => {
      let salesQuery = query
        .eq("provider_id", providerId)
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false });
      if (locationId) salesQuery = salesQuery.eq("location_id", locationId);
      if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
        const d0 = dateFrom.slice(0, 10);
        salesQuery = salesQuery.gte("sale_date", dateRangeBoundsUtc(d0, d0, tz).fromIso);
      }
      if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
        const d1 = dateTo.slice(0, 10);
        salesQuery = salesQuery.lte("sale_date", dateRangeBoundsUtc(d1, d1, tz).toIso);
      }
      if (searchTerm) {
        const clauses = [
          `ref_number.ilike.%${searchTerm}%`,
          `sale_number.ilike.%${searchTerm}%`,
        ];
        if (customerIdsMatchingSearch.length > 0) {
          clauses.push(
            `customer_id.in.(${customerIdsMatchingSearch.slice(0, MAX_INLINE_MATCH_IDS).join(",")})`,
          );
        }
        salesQuery = salesQuery.or(clauses.join(","));
      }
      return salesQuery;
    };

    let sales: any[] = [];
    try {
      sales = await fetchAllPaged(async (from, to) => {
        const { data, error } = await applySalesListFilters(
          supabaseAdmin.from("sales").select(`
        id,
        sale_number,
        ref_number,
        sale_date,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        notes,
        created_at,
        customer_id,
        staff_id,
        location_id
      `),
        ).range(from, to);
        return { data, error };
      }, 5_000);
    } catch (salesError) {
      console.error("Error fetching sales:", salesError);
      throw salesError;
    }

    const applyWalkInFilters = (query: any) => {
      let walkInQuery = query
        .eq("provider_id", providerId)
        .eq("order_source", "walk_in")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (locationId) walkInQuery = walkInQuery.eq("collection_location_id", locationId);
      if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
        const d0 = dateFrom.slice(0, 10);
        walkInQuery = walkInQuery.gte("created_at", dateRangeBoundsUtc(d0, d0, tz).fromIso);
      }
      if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
        const d1 = dateTo.slice(0, 10);
        walkInQuery = walkInQuery.lte("created_at", dateRangeBoundsUtc(d1, d1, tz).toIso);
      }
      if (searchTerm) {
        const walkClauses = [`order_number.ilike.%${searchTerm}%`, `customer_name.ilike.%${searchTerm}%`];
        if (customerIdsMatchingSearch.length > 0) {
          walkClauses.push(`customer_id.in.(${customerIdsMatchingSearch.join(",")})`);
        }
        walkInQuery = walkInQuery.or(walkClauses.join(","));
      }
      return walkInQuery;
    };

    let walkInOrders: any[] = [];
    try {
      walkInOrders = await fetchAllPaged(async (from, to) => {
        const { data, error } = await applyWalkInFilters(
          supabaseAdmin
            .from("product_orders")
            .select(
              "id, order_number, created_at, paid_at, subtotal, tax_amount, total_amount, payment_method, payment_status, customer_id, customer_name, staff_id, collection_location_id, legacy_sale_id",
            ),
        ).range(from, to);
        return { data, error };
      }, 5_000);
    } catch (walkInError) {
      console.warn("Error fetching walk-in product orders:", walkInError);
      walkInOrders = [];
    }

    const standaloneSales = (sales || []).filter(
      (sale: { notes?: string | null }) => !isBookingCollectionSale(sale.notes),
    );
    const salesById = new Map(standaloneSales.map((sale: any) => [String(sale.id), sale]));
    const walkInsById = new Map((walkInOrders || []).map((order: any) => [String(order.id), order]));

    const transformedSales: SaleHistoryRow[] = standaloneSales.map((sale: any) => ({
      id: sale.id,
      ref_number: sale.ref_number || sale.sale_number,
      client_name: null,
      date: sale.sale_date,
      items: [],
      subtotal: Number(sale.subtotal || 0),
      tax: Number(sale.tax_amount || 0),
      total: Number(sale.total_amount || 0),
      payment_method: sale.payment_method || "cash",
      payment_status: sale.payment_status || "completed",
      team_member_id: sale.staff_id || null,
      team_member_name: null,
    }));

    const walkInSales = (walkInOrders || []).map((order: any) =>
      mapWalkInOrderToSaleShape({
        order,
        items: [],
        clientName: order.customer_name || null,
        teamMemberId: order.staff_id || null,
        teamMemberName: null,
      }),
    );

    const migratedSaleIds = new Set(
      (walkInOrders || [])
        .map((order: { legacy_sale_id?: string | null }) => order.legacy_sale_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    );
    const mergedSales = mergeSaleHistoryRows(transformedSales, walkInSales, migratedSaleIds);
    const pagedSales = mergedSales.slice(offset, offset + limit);
    const pageSaleIds = pagedSales
      .map((row) => row.id)
      .filter((id) => salesById.has(String(id)));
    const giftPaidBySale = await sumSaleGiftCardPaidBySaleIds(supabaseAdmin, pageSaleIds);
    const cardTakenBySale = await sumSuccessfulSaleCardTakenBySaleIds(supabaseAdmin, pageSaleIds);
    for (const row of pagedSales) {
      const sale = salesById.get(String(row.id));
      if (!sale) continue;
      const giftPaid = giftPaidBySale.get(String(row.id)) ?? 0;
      const cardTaken = cardTakenBySale.get(String(row.id)) ?? 0;
      row.amount_due = saleCardAmountStillDue(Number(sale.total_amount ?? 0), giftPaid, cardTaken);
      if (giftPaid > 0.009) row.gift_card_amount = giftPaid;
    }
    const mergedCount = mergedSales.length;
    const periodTotalMerged = mergedSales.reduce((sum, row) => addMoney(sum, Number(row.total || 0)), 0);
    const totalPartial = (sales || []).length >= 5_000 || (walkInOrders || []).length >= 5_000;
    const totalPages = mergedCount ? Math.ceil(mergedCount / limit) : 1;

    const pagedSaleIds = pagedSales.filter((row) => salesById.has(row.id)).map((row) => row.id);
    const pagedWalkInIds = pagedSales.filter((row) => walkInsById.has(row.id)).map((row) => row.id);

    const customerIds = new Set<string>();
    const staffIds = new Set<string>();
    const staffUserIds = new Set<string>();
    for (const id of pagedSaleIds) {
      const sale = salesById.get(id);
      if (sale?.customer_id) customerIds.add(sale.customer_id);
      if (sale?.staff_id) staffIds.add(sale.staff_id);
    }
    for (const id of pagedWalkInIds) {
      const order = walkInsById.get(id);
      if (order?.customer_id) customerIds.add(order.customer_id);
      if (order?.staff_id) {
        staffIds.add(order.staff_id);
        staffUserIds.add(order.staff_id);
      }
    }

    const customerMap = new Map<string, { full_name: string; email: string }>();
    if (customerIds.size > 0) {
      const customers = await fetchInIdChunks<{ id: string; full_name?: string | null; email?: string | null }>(
        Array.from(customerIds),
        (slice) => supabaseAdmin.from("users").select("id, full_name, email").in("id", slice),
      );
      customers.forEach((customer) => {
        customerMap.set(customer.id, {
          full_name: customer.full_name || "Unknown",
          email: customer.email || "",
        });
      });
    }

    const staffMap = new Map<string, string>();
    const staffIdByUserId = new Map<string, string>();
    if (staffIds.size > 0 || staffUserIds.size > 0) {
      const staffRows = await fetchInIdChunks<{ id: string; name?: string | null; user_id?: string | null }>(
        [...new Set([...staffIds, ...staffUserIds])],
        (slice) =>
          supabaseAdmin
            .from("provider_staff")
            .select("id, name, user_id")
            .eq("provider_id", providerId)
            .in("id", slice),
      );
      const missingUserIds = [...staffUserIds].filter((id) => !staffRows.some((row) => row.id === id || row.user_id === id));
      const staffByUser = missingUserIds.length
        ? await fetchInIdChunks<{ id: string; name?: string | null; user_id?: string | null }>(
            missingUserIds,
            (slice) =>
              supabaseAdmin
                .from("provider_staff")
                .select("id, name, user_id")
                .eq("provider_id", providerId)
                .in("user_id", slice),
          )
        : [];
      for (const staff of [...staffRows, ...staffByUser]) {
        staffMap.set(staff.id, staff.name || "Unknown");
        if (staff.user_id) {
          staffMap.set(staff.user_id, staff.name || "Unknown");
          staffIdByUserId.set(staff.user_id, staff.id);
        }
      }
    }

    const itemsMap = new Map();
    if (pagedSaleIds.length > 0) {
      const items = await fetchInIdChunks<any>(pagedSaleIds, (slice) =>
        supabaseAdmin.from("sale_items").select("*").in("sale_id", slice),
      );
      items.forEach((item: any) => {
        if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
        itemsMap.get(item.sale_id).push({
          id: item.id,
          type: item.item_type,
          name: item.item_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          total: Number(item.total_price),
          item_id: item.item_id ?? null,
          product_variant_id: item.product_variant_id ?? null,
        });
      });
    }

    const walkInItemsMap = new Map<string, Array<{
      id: string;
      product_id?: string | null;
      product_variant_id?: string | null;
      product_name?: string | null;
      quantity?: number | null;
      unit_price?: number | string | null;
      total_price?: number | string | null;
    }>>();
    if (pagedWalkInIds.length > 0) {
      const walkInItems = await fetchInIdChunks<{
        id: string;
        order_id: string;
        product_id?: string | null;
        product_variant_id?: string | null;
        product_name?: string | null;
        quantity?: number | null;
        unit_price?: number | string | null;
        total_price?: number | string | null;
      }>(pagedWalkInIds, (slice) =>
        supabaseAdmin
          .from("product_order_items")
          .select("id, order_id, product_id, product_variant_id, product_name, quantity, unit_price, total_price")
          .in("order_id", slice),
      );
      walkInItems.forEach((item) => {
        const list = walkInItemsMap.get(item.order_id) ?? [];
        list.push(item);
        walkInItemsMap.set(item.order_id, list);
      });
    }

    const enrichedPage = pagedSales.map((row) => {
      const sale = salesById.get(row.id);
      if (sale) {
        const customerInfo = sale.customer_id ? customerMap.get(sale.customer_id) : null;
        return {
          ...row,
          client_name: customerInfo?.full_name || null,
          items: itemsMap.get(row.id) || [],
          team_member_name: sale.staff_id ? staffMap.get(sale.staff_id) || null : null,
        };
      }
      const order = walkInsById.get(row.id);
      if (!order) return row;
      const customerInfo = order.customer_id ? customerMap.get(order.customer_id) : null;
      const resolvedStaffId = order.staff_id
        ? (staffIdByUserId.get(order.staff_id) ?? (staffMap.has(order.staff_id) ? order.staff_id : null))
        : null;
      return mapWalkInOrderToSaleShape({
        order,
        items: walkInItemsMap.get(order.id) || [],
        clientName: customerInfo?.full_name || order.customer_name || null,
        teamMemberId: resolvedStaffId,
        teamMemberName: order.staff_id ? staffMap.get(order.staff_id) ?? null : null,
      });
    });

    return successResponse({
      data: enrichedPage,
      total: mergedCount,
      /** Sum of `total_amount` across ALL rows matching the filters (not just this page). */
      total_amount_sum: periodTotalMerged,
      total_partial: totalPartial,
      page,
      limit,
      total_pages: totalPages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch sales");
  }
}

/**
 * POST /api/provider/sales
 * 
 * Create a new sale
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to create sales
    const permissionCheck = await requirePermission('create_sales', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }

    const posOk = await checkNewGateFeatureAccess(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.posWalkIn,
      supabase,
    );
    if (!posOk) {
      return handleApiError(
        new Error("POS and walk-in sales are not included in your current subscription plan."),
        "SUBSCRIPTION_FEATURE_DISABLED",
        403,
      );
    }

    const body = await request.json();
    const {
      location_id,
      customer_id,
      staff_id,
      sale_date,
      items,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      tip_amount,
      total_amount,
      payment_method,
      payment_status,
      payment_reference,
      service_location_type,
      house_call_address,
      is_walk_in,
      notes,
      payments: paymentLegsInput,
      gift_card_code: giftCardCodeInput,
      gift_card_amount: giftCardAmountInput,
    } = body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return handleApiError(
        new Error('At least one item is required'),
        'VALIDATION_ERROR',
        400
      );
    }

    if (total_amount === undefined || total_amount === null) {
      return handleApiError(
        new Error('Total amount is required'),
        'VALIDATION_ERROR',
        400
      );
    }

    const normalizedPaymentMethod = normalizeSalePaymentMethodForDb(payment_method);

    if (normalizedPaymentMethod === "yoco") {
      const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
      if (yocoGate) return yocoGate;
    }

    const bookingCollection = isBookingCollectionSale(notes);

    // F3-06: never trust client money fields. Resolve unit prices from the
    // catalogue (booking-collection sales carry booking-time line prices, so
    // those keep the booking's prices), recompute the subtotal, clamp the
    // discount/tip and derive the payment status server-side.
    const normalizedSale = await normalizeSaleItemsServerSide(supabase, providerId, items, {
      resolveCatalogPrices: !bookingCollection,
    });
    if (normalizedSale.ok === false) {
      return handleApiError(new Error(normalizedSale.message), normalizedSale.code, 400);
    }
    const saleItemsInput = normalizedSale.items;
    const serverSubtotal = normalizedSale.subtotal;
    if (Number.isFinite(Number(subtotal)) && Math.abs(Number(subtotal) - serverSubtotal) > 0.009) {
      console.warn(
        `[provider/sales] client subtotal ${subtotal} differs from server subtotal ${serverSubtotal}; using server value`,
      );
    }
    const serverDiscount = clampSaleDiscount(discount_amount, serverSubtotal);
    const serverTip = clampSaleTip(tip_amount);
    const hasSplitPayments =
      Array.isArray(paymentLegsInput) && paymentLegsInput.length > 0;
    const resolvedPaymentStatus = deriveSalePaymentStatus(payment_status, {
      hasPaymentLegs: hasSplitPayments,
    });

    const stockError = bookingCollection
      ? null
      : await validatePosProductStock(supabase, providerId, saleItemsInput);
    if (stockError) {
      return handleApiError(
        new Error(stockError),
        stockError,
        "STOCK_ERROR",
        400,
      );
    }

    const hasGiftCard =
      Boolean(giftCardCodeInput?.trim()) || Number(giftCardAmountInput || 0) > 0;
    const hasTip = serverTip > 0;

    // Product-only POS sales → walk_in product_orders (Part I migration path).
    if (
      isProductOnlyLegacySale(saleItemsInput) &&
      !bookingCollection &&
      !hasSplitPayments &&
      !hasGiftCard &&
      !hasTip
    ) {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("id", providerId)
        .maybeSingle();
      let tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
      if (!tenantId) {
        tenantId = await resolveTenantIdWithZaFallback(request);
      }
      if (!tenantId) {
        return handleApiError(
          new Error("Tenant could not be resolved for this sale. Check provider tenant settings."),
          "TENANT_ERROR",
          500,
        );
      }

      const calculatedSubtotal = serverSubtotal;
      const discountNum = serverDiscount;
      const taxableSubtotal = Math.max(0, subtractMoney(calculatedSubtotal, discountNum));
      const { taxAmount: calculatedTax, taxRatePercent: serverTaxRate, inclusive } =
        await computeProviderSaleTax(supabase, providerId, taxableSubtotal, "ZAR");
      const tipNum = serverTip;
      const calculatedTotal = addMoney(addMoney(taxableSubtotal, inclusive ? 0 : calculatedTax), tipNum);

      const { orderId, orderNumber } = await createWalkInOrderFromLegacySale({
        supabase,
        providerId,
        userId: user.id,
        staffId: staff_id || null,
        tenantId,
        locationId: location_id || null,
        customerId: customer_id || null,
        items: saleItemsInput,
        subtotal: calculatedSubtotal,
        taxRate: serverTaxRate,
        taxAmount: calculatedTax,
        discountAmount: discountNum,
        totalAmount: calculatedTotal,
        paymentMethod: normalizedPaymentMethod,
        paymentStatus: resolvedPaymentStatus,
        paymentReference: payment_reference || null,
      });

      let clientName = null;
      let staffName = null;
      if (customer_id) {
        const { data: customer } = await supabase.from("users").select("full_name").eq("id", customer_id).maybeSingle();
        clientName = customer?.full_name || null;
      }
      if (staff_id) {
        const { data: staff } = await supabase.from("provider_staff").select("name").eq("id", staff_id).maybeSingle();
        staffName = staff?.name || null;
      }

      return successResponse({
        id: orderId,
        ref_number: orderNumber,
        client_name: clientName,
        date: sale_date || new Date().toISOString(),
        items: saleItemsInput.map((item: any, idx: number) => ({
          id: `${orderId}-${idx}`,
          type: item.type || "product",
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: Number(item.unit_price || 0),
          total: Number(item.total_price || 0),
          item_id: item.item_id ?? null,
          product_variant_id: item.product_variant_id ?? null,
        })),
        subtotal: calculatedSubtotal,
        tax: calculatedTax,
        total: calculatedTotal,
        payment_method: normalizedPaymentMethod,
        payment_status: resolvedPaymentStatus,
        team_member_id: staff_id || null,
        team_member_name: staffName,
        product_order_id: orderId,
        migrated_to_product_order: true,
      });
    }

    // Totals are always server-computed (F3-06).
    const calculatedSubtotal = serverSubtotal;
    const discountNum = serverDiscount;
    const taxableForVat = Math.max(0, subtractMoney(calculatedSubtotal, discountNum));
    const { taxAmount: calculatedTax, taxRatePercent: serverTaxRate, inclusive } =
      await computeProviderSaleTax(supabase, providerId, taxableForVat, "ZAR");
    const tipNum = serverTip;
    const serverGross = addMoney(addMoney(taxableForVat, inclusive ? 0 : calculatedTax), tipNum);
    // Gift-card legs are payments against this gross. A client total that adds
    // inclusive VAT, or subtracts the gift card, is not the amount owed.
    const calculatedTotal = serverGross;

    // Create sale
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        provider_id: providerId,
        location_id: location_id || null,
        customer_id: customer_id || null,
        staff_id: staff_id || null,
        sale_date: sale_date || new Date().toISOString(),
        subtotal: calculatedSubtotal,
        tax_rate: serverTaxRate,
        tax_amount: calculatedTax,
        discount_amount: discountNum,
        total_amount: calculatedTotal,
        payment_method: normalizedPaymentMethod,
        payment_status: resolvedPaymentStatus,
        notes: (() => {
          const parts: string[] = [];
          if (notes) parts.push(notes);
          if (payment_reference) parts.push(`Payment Reference: ${payment_reference}`);
          if (service_location_type === 'house-call' && house_call_address) {
            parts.push(`House Call Address: ${house_call_address.address_line1}, ${house_call_address.city}${house_call_address.postal_code ? `, ${house_call_address.postal_code}` : ''}`);
          }
          if (tipNum > 0) parts.push(`Tip: ${tipNum}`);
          if (is_walk_in) parts.push('Walk-in');
          return parts.length > 0 ? parts.join('\n') : null;
        })(),
        created_by: user.id,
      })
      .select()
      .single();

    if (saleError) {
      throw saleError;
    }

    // Create sale items
    const saleItems = saleItemsInput.map((item: any) => ({
      sale_id: sale.id,
      item_type: item.type || 'product',
      item_id: item.item_id || null,
      product_variant_id: item.product_variant_id || null,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsError) {
      // Rollback sale creation
      await supabase.from('sales').delete().eq('id', sale.id);
      throw itemsError;
    }

    const rollbackSaleWithGift = async (giftWasReserved: boolean) => {
      if (giftWasReserved) {
        await voidSaleGiftCard(getSupabaseAdmin(), sale.id);
      }
      await supabase.from("sale_payments").delete().eq("sale_id", sale.id);
      await supabase.from("sale_items").delete().eq("sale_id", sale.id);
      await supabase.from("sales").delete().eq("id", sale.id);
    };

    const { data: providerCurrencyRow } = await supabase
      .from("providers")
      .select("currency")
      .eq("id", providerId)
      .maybeSingle();
    const saleCurrency =
      (providerCurrencyRow as { currency?: string | null } | null)?.currency?.trim() || "ZAR";

    const paymentLegs = Array.isArray(paymentLegsInput) ? paymentLegsInput : null;
    const giftCode =
      typeof giftCardCodeInput === "string" ? giftCardCodeInput.trim().toUpperCase() : "";
    const giftAmount = Number(giftCardAmountInput ?? 0);
    let giftReserved = false;
    let stockTaken: Awaited<ReturnType<typeof applyPosProductStockDecrementsReversible>> = [];

    try {
      const giftTenderMismatch = saleGiftTenderMismatch({
        giftCode,
        giftAmount,
        saleTotal: calculatedTotal,
        legs: paymentLegs,
      });
      if (giftTenderMismatch) {
        await rollbackSaleWithGift(false);
        return handleApiError(new Error(giftTenderMismatch), "GIFT_CARD_ERROR", 400);
      }

      if (giftCode && giftAmount > 0) {
        const reserved = await reserveSaleGiftCard(getSupabaseAdmin(), {
          code: giftCode,
          amount: giftAmount,
          saleId: sale.id,
          currency: saleCurrency,
          userId: user.id,
        });
        if (reserved.ok === false) {
          await rollbackSaleWithGift(false);
          return handleApiError(
            new Error(reserved.message),
            "GIFT_CARD_ERROR",
            400,
          );
        }
        giftReserved = true;
      }

      if (paymentLegs && paymentLegs.length > 0) {
        const legSum = paymentLegs.reduce(
          (sum: number, leg: { amount?: unknown }) => addMoney(sum, Number(leg.amount ?? 0)),
          0,
        );
        if (Math.abs(legSum - calculatedTotal) > 0.02) {
          await rollbackSaleWithGift(giftReserved);
          return handleApiError(
            new Error("Payment legs must sum to the sale total"),
            "VALIDATION_ERROR",
            400,
          );
        }
        for (const leg of paymentLegs) {
          const { error: legErr } = await (supabase.from("sale_payments") as any).insert({
            sale_id: sale.id,
            method: normalizeSalePaymentMethodForDb(String(leg.method ?? "other")),
            provider: leg.provider ?? null,
            amount: Number(leg.amount ?? 0),
            currency: saleCurrency,
            reference: leg.reference ?? null,
            status: "completed",
          });
          if (legErr) {
            await rollbackSaleWithGift(giftReserved);
            throw legErr;
          }
        }
        if (paymentLegs.length > 1) {
          await supabase.from("sales").update({ payment_method: "split" }).eq("id", sale.id);
        }
      } else if (giftReserved) {
        await (supabase.from("sale_payments") as any).insert({
          sale_id: sale.id,
          method: "gift_card",
          amount: giftAmount,
          currency: saleCurrency,
          status: "completed",
        });
      }

      if (resolvedPaymentStatus === "completed" && !isBookingCollectionSale(notes)) {
        // Stock before capture. A captured gift card cannot be voided by the
        // sale void, so a later stock failure would keep the card money after
        // the sale row is deleted.
        try {
          stockTaken = await applyPosProductStockDecrementsReversible(supabase, saleItemsInput);
        } catch (stockErr) {
          await rollbackSaleWithGift(giftReserved);
          return handleApiError(
            stockErr instanceof Error ? stockErr : new Error(String(stockErr)),
            "Sale was not saved: inventory could not be updated. Try again or check product stock.",
            "SALE_STOCK_FAILED",
            500,
          );
        }
      }

      if (giftReserved && resolvedPaymentStatus === "completed") {
        const captured = await captureSaleGiftCard(getSupabaseAdmin(), sale.id);
        if (captured.ok === false) {
          await restorePosProductStock(supabase, stockTaken);
          await rollbackSaleWithGift(true);
          return handleApiError(
            new Error(captured.message),
            "GIFT_CARD_ERROR",
            500,
          );
        }
      }
    } catch (legBlockErr) {
      await restorePosProductStock(supabase, stockTaken);
      await rollbackSaleWithGift(giftReserved);
      throw legBlockErr;
    }

    // Fetch complete sale with items (simplified query)
    const { data: fetchedSaleItems } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id);

    // Get customer and staff info separately
    let clientName = null;
    let staffName = null;

    if (sale.customer_id) {
      const { data: customer } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', sale.customer_id)
        .single();
      clientName = customer?.full_name || null;
    }

    if (sale.staff_id) {
      const { data: staff } = await supabase
        .from('provider_staff')
        .select('name')
        .eq('id', sale.staff_id)
        .single();
      staffName = staff?.name || null;
    }

    return successResponse({
      id: sale.id,
      ref_number: sale.ref_number || sale.sale_number,
      client_name: clientName,
      date: sale.sale_date,
      items: (fetchedSaleItems || []).map((item: any) => ({
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
    return handleApiError(error, "Failed to create sale");
  }
}
