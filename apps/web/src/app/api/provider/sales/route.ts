import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission, requirePermission } from "@/lib/auth/requirePermission";
import { createClient } from "@supabase/supabase-js";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

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
      const { data: matchingCustomers, error: matchingCustomersError } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(100);

      if (matchingCustomersError) {
        console.warn("Error fetching sales search customers:", matchingCustomersError);
      } else {
        matchingCustomers?.forEach((customer: { id?: string | null }) => {
          if (customer.id) customerIdsMatchingSearch.push(customer.id);
        });
      }
    }

    // Build query (simplified to avoid nested join issues)
    let salesQuery = supabaseAdmin
      .from('sales')
      .select(`
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
      `, { count: 'exact' })
      .eq('provider_id', providerId)
      .order('sale_date', { ascending: false });

    // Apply location filter
    if (locationId) {
      salesQuery = salesQuery.eq('location_id', locationId);
    }
    
    // Apply date filters (YYYY-MM-DD = provider wall calendar day)
    if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
      const d0 = dateFrom.slice(0, 10);
      salesQuery = salesQuery.gte("sale_date", dateRangeBoundsUtc(d0, d0, tz).fromIso);
    }
    if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
      const d1 = dateTo.slice(0, 10);
      salesQuery = salesQuery.lte("sale_date", dateRangeBoundsUtc(d1, d1, tz).toIso);
    }

    // Apply search at DB level so pagination/count/totals match the visible list.
    if (searchTerm) {
      const clauses = [
        `ref_number.ilike.%${searchTerm}%`,
        `sale_number.ilike.%${searchTerm}%`,
      ];
      if (customerIdsMatchingSearch.length > 0) {
        clauses.push(`customer_id.in.(${customerIdsMatchingSearch.join(",")})`);
      }
      salesQuery = salesQuery.or(clauses.join(","));
    }

    // Apply pagination after all filters
    salesQuery = salesQuery.range(offset, offset + limit - 1);

    const { data: sales, error: salesError, count } = await salesQuery;

    if (salesError) {
      console.error("Error fetching sales:", salesError);
      throw salesError;
    }

    // Also compute a period-wide aggregate (sum of total_amount) across the FILTERED rows,
    // not just the current page. The mobile sales-history screen relies on this so the
    // "Revenue" card shows the real total, not just the first page.
    let periodTotalAmount = 0;
    try {
      let totalsQuery = supabaseAdmin
        .from("sales")
        .select("total_amount")
        .eq("provider_id", providerId);
      if (locationId) totalsQuery = totalsQuery.eq("location_id", locationId);
      if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
        const d0 = dateFrom.slice(0, 10);
        totalsQuery = totalsQuery.gte("sale_date", dateRangeBoundsUtc(d0, d0, tz).fromIso);
      }
      if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
        const d1 = dateTo.slice(0, 10);
        totalsQuery = totalsQuery.lte("sale_date", dateRangeBoundsUtc(d1, d1, tz).toIso);
      }
      if (searchTerm) {
        const clauses = [
          `ref_number.ilike.%${searchTerm}%`,
          `sale_number.ilike.%${searchTerm}%`,
        ];
        if (customerIdsMatchingSearch.length > 0) {
          clauses.push(`customer_id.in.(${customerIdsMatchingSearch.join(",")})`);
        }
        totalsQuery = totalsQuery.or(clauses.join(","));
      }
      const { data: totalsRows } = await totalsQuery;
      periodTotalAmount = (totalsRows ?? []).reduce(
        (s: number, r: { total_amount?: number | null }) => s + Number(r.total_amount ?? 0),
        0
      );
    } catch (err) {
      console.warn("Sales total aggregate failed:", err);
    }

    // Get related data separately to avoid nested join issues
    const saleIds = (sales || []).map(s => s.id);
    const customerIds = new Set<string>();
    const staffIds = new Set<string>();
    const locationIds = new Set<string>();

    (sales || []).forEach((sale: any) => {
      if (sale.customer_id) customerIds.add(sale.customer_id);
      if (sale.staff_id) staffIds.add(sale.staff_id);
      if (sale.location_id) locationIds.add(sale.location_id);
    });

    // Fetch customers
    const customerMap = new Map<string, { full_name: string; email: string }>();
    if (customerIds.size > 0) {
      const { data: customers, error: customerError } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email')
        .in('id', Array.from(customerIds));

      if (customerError) {
        console.warn("Error fetching customers:", customerError);
      } else {
        customers?.forEach((customer: any) => {
          customerMap.set(customer.id, {
            full_name: customer.full_name || "Unknown",
            email: customer.email || "",
          });
        });
      }
    }

    // Fetch staff
    const staffMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staffMembers, error: staffError } = await supabaseAdmin
        .from('provider_staff')
        .select('id, name')
        .in('id', Array.from(staffIds));

      if (staffError) {
        console.warn("Error fetching staff:", staffError);
      } else {
        staffMembers?.forEach((staff: any) => {
          staffMap.set(staff.id, staff.name || "Unknown");
        });
      }
    }

    // Fetch locations
    const locationMap = new Map<string, string>();
    if (locationIds.size > 0) {
      const { data: locations, error: locationError } = await supabaseAdmin
        .from('provider_locations')
        .select('id, name')
        .in('id', Array.from(locationIds));

      if (locationError) {
        console.warn("Error fetching locations:", locationError);
      } else {
        locations?.forEach((location: any) => {
          locationMap.set(location.id, location.name || "Unknown");
        });
      }
    }

    // Get sale items for each sale
    const itemsMap = new Map();
    
    if (saleIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);

      // Group items by sale_id
      (items || []).forEach((item: any) => {
        if (!itemsMap.has(item.sale_id)) {
          itemsMap.set(item.sale_id, []);
        }
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

    // Transform to Sale format
    const transformedSales = (sales || []).map((sale: any) => {
      const customerInfo = sale.customer_id ? customerMap.get(sale.customer_id) : null;
      const staffName = sale.staff_id ? staffMap.get(sale.staff_id) : null;
      
      return {
        id: sale.id,
        ref_number: sale.ref_number || sale.sale_number,
        client_name: customerInfo?.full_name || null,
        date: sale.sale_date,
        items: itemsMap.get(sale.id) || [],
        subtotal: Number(sale.subtotal || 0),
        tax: Number(sale.tax_amount || 0),
        total: Number(sale.total_amount || 0),
        payment_method: sale.payment_method || 'cash',
        payment_status: sale.payment_status || 'completed',
        team_member_id: sale.staff_id || null,
        team_member_name: staffName || null,
      };
    });

    const totalPages = count ? Math.ceil(count / limit) : 1;

    return successResponse({
      data: transformedSales,
      total: count || transformedSales.length,
      /** Sum of `total_amount` across ALL rows matching the filters (not just this page). */
      total_amount_sum: periodTotalAmount,
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

    const resolvedPaymentStatus = payment_status || "completed";
    const normalizedPaymentMethod = normalizeSalePaymentMethodForDb(payment_method);

    if (normalizedPaymentMethod === "yoco") {
      const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
      if (yocoGate) return yocoGate;
    }

    const stockError = await validatePosProductStock(supabase, providerId, items);
    if (stockError) {
      return handleApiError(
        new Error(stockError),
        stockError,
        "STOCK_ERROR",
        400,
      );
    }

    // Calculate totals if not provided
    const calculatedSubtotal = subtotal || items.reduce((sum: number, item: any) => 
      sum + (item.unit_price || 0) * (item.quantity || 1), 0
    );
    const calculatedTax = tax_amount || (calculatedSubtotal * (tax_rate || 0));
    const tipNum = Number(tip_amount || 0);
    const calculatedTotal =
      total_amount !== undefined && total_amount !== null
        ? Number(total_amount)
        : calculatedSubtotal + calculatedTax - Number(discount_amount || 0) + tipNum;

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
        tax_rate: tax_rate || 0,
        tax_amount: calculatedTax,
        discount_amount: discount_amount || 0,
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
          if (tip_amount && tip_amount > 0) parts.push(`Tip: ${tip_amount}`);
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
    const saleItems = items.map((item: any) => ({
      sale_id: sale.id,
      item_type: item.type || 'product',
      item_id: item.item_id || null,
      product_variant_id: item.product_variant_id || null,
      item_name: item.name,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      total_price: (item.unit_price || 0) * (item.quantity || 1),
    }));

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsError) {
      // Rollback sale creation
      await supabase.from('sales').delete().eq('id', sale.id);
      throw itemsError;
    }

    if (resolvedPaymentStatus === "completed") {
      try {
        await applyPosProductStockDecrements(supabase, items);
      } catch (stockErr) {
        await supabase.from("sales").delete().eq("id", sale.id);
        return handleApiError(
          stockErr instanceof Error ? stockErr : new Error(String(stockErr)),
          "Sale was not saved: inventory could not be updated. Try again or check product stock.",
          "SALE_STOCK_FAILED",
          500,
        );
      }
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
