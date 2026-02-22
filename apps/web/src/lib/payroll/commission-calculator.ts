import type { SupabaseClient } from "@supabase/supabase-js";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

export interface CommissionResult {
  serviceCommission: number;
  productCommission: number;
  totalCommission: number;
  serviceRevenue: number;
  productRevenue: number;
  totalRevenue: number;
  totalBookings: number; // Bookings where staff had services
}

/**
 * Calculate commission for a staff member within a date range.
 * Uses finance_transactions for actual paid amounts (not raw booking price).
 * Respects team_member_commission_enabled on offerings and products.
 */
export async function calculateStaffCommission(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  staffId: string,
  fromDate: Date,
  toDate: Date
): Promise<CommissionResult> {
  const result: CommissionResult = {
    serviceCommission: 0,
    productCommission: 0,
    totalCommission: 0,
    serviceRevenue: 0,
    productRevenue: 0,
    totalRevenue: 0,
    totalBookings: 0,
  };

  // 1. Get staff commission settings
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("provider_staff")
    .select(
      "id, commission_enabled, service_commission_rate, product_commission_rate, commission_rate"
    )
    .eq("id", staffId)
    .eq("provider_id", providerId)
    .single();

  if (staffError || !staff) {
    return result;
  }

  const baseServiceRate = staff.service_commission_rate ?? staff.commission_rate ?? 0;
  const baseProductRate = staff.product_commission_rate ?? staff.commission_rate ?? 0;

  if (!staff.commission_enabled && baseServiceRate === 0 && baseProductRate === 0) {
    return result;
  }

  // 2. Get provider revenue by booking (actual paid amounts)
  const { revenueByBooking } = await getProviderRevenue(
    supabaseAdmin,
    providerId,
    fromDate,
    toDate
  );

  // 3. Get bookings with booking_services
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select(
      `
      id,
      status,
      scheduled_at,
      booking_services (
        id,
        price,
        staff_id,
        offering_id
      )
    `
    )
    .eq("provider_id", providerId)
    .gte("scheduled_at", fromDate.toISOString())
    .lte("scheduled_at", toDate.toISOString())
    .in("status", ["confirmed", "completed"]);

  if (!bookings) return result;

  // Get offering_ids for team_member_commission_enabled check
  const offeringIds = new Set<string>();
  for (const b of bookings) {
    for (const s of (b as any).booking_services || []) {
      if (s.offering_id) offeringIds.add(s.offering_id);
    }
  }
  const offeringMap = new Map<string, { team_member_commission_enabled?: boolean; commission_rate_override?: number }>();
  if (offeringIds.size > 0) {
    const { data: offerings } = await supabaseAdmin
      .from("offerings")
      .select("id, team_member_commission_enabled, commission_rate_override")
      .in("id", Array.from(offeringIds));
    for (const o of offerings || []) {
      offeringMap.set((o as any).id, o);
    }
  }

  // 4. Calculate service revenue and commission
  for (const booking of bookings) {
    const bookingRevenue = revenueByBooking.get(booking.id) || 0;
    const services = (booking as any).booking_services || [];
    if (services.length === 0) continue;

    const totalServicePrice = services.reduce(
      (sum: number, s: any) => sum + Number(s.price || 0),
      0
    );
    if (totalServicePrice === 0) continue;

    const staffServices = services.filter((s: any) => s.staff_id === staffId);
    if (staffServices.length === 0) continue;

    result.totalBookings += 1;

    const staffServicePrice = staffServices.reduce(
      (sum: number, s: any) => sum + Number(s.price || 0),
      0
    );
    const staffProportion = totalServicePrice > 0 ? staffServicePrice / totalServicePrice : 0;
    const staffRevenueShare = bookingRevenue * staffProportion;
    result.serviceRevenue += staffRevenueShare;

    for (const svc of staffServices) {
      const offering = offeringMap.get(svc.offering_id);
      const commissionEnabled = offering?.team_member_commission_enabled !== false;
      if (!commissionEnabled) continue;
      const price = Number(svc.price || 0);
      const revShare = totalServicePrice > 0 ? (price / totalServicePrice) * bookingRevenue : 0;
      const overrideRate = offering?.commission_rate_override;
      const effectiveRate = overrideRate != null ? overrideRate : baseServiceRate;
      result.serviceCommission +=
        (revShare * (staff.commission_enabled ? effectiveRate : 0)) / 100;
    }
  }

  // 5. Get product revenue: booking_products (with staff_id or infer from booking) + sales
  let bookingProducts: any[] = [];
  let saleItems: any[] = [];
  const productMap = new Map<string, { team_member_commission_enabled?: boolean; commission_rate_override?: number }>();
  const bookingIds = (bookings || []).map((b: any) => b.id).filter(Boolean);
  if (bookingIds.length > 0) {
    const { data: bpData } = await supabaseAdmin
      .from("booking_products")
      .select("id, total_price, staff_id, product_id, booking_id")
      .in("booking_id", bookingIds);

    if (bpData) {
      bookingProducts = bpData;
      const productIds = [...new Set(bookingProducts.map((bp: any) => bp.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id, team_member_commission_enabled, commission_rate_override")
          .in("id", productIds);
        for (const p of products || []) {
          productMap.set((p as any).id, p);
        }
      }

      for (const bp of bookingProducts) {
        const product = productMap.get((bp as any).product_id);
        const commissionEnabled = product?.team_member_commission_enabled !== false;
        if (!commissionEnabled) continue;

        let attributableStaffId = (bp as any).staff_id;
        if (!attributableStaffId) {
          const booking = bookings.find((b: any) => b.id === (bp as any).booking_id);
          const firstStaff = (booking as any)?.booking_services?.find(
            (s: any) => s.staff_id != null
          );
          attributableStaffId = firstStaff?.staff_id;
        }
        if (attributableStaffId !== staffId) continue;

        const price = Number((bp as any).total_price || 0);
        result.productRevenue += price;
        const prodRate = product?.commission_rate_override != null ? product.commission_rate_override : baseProductRate;
        result.productCommission +=
          (price * (staff.commission_enabled ? prodRate : 0)) / 100;
      }
    }
  }

  // 6. Sales table (standalone product sales with staff_id)
  const { data: sales } = await supabaseAdmin
    .from("sales")
    .select("id, staff_id, total_amount, sale_date")
    .eq("provider_id", providerId)
    .eq("staff_id", staffId)
    .gte("sale_date", fromDate.toISOString())
    .lte("sale_date", toDate.toISOString())
    .eq("payment_status", "completed");

  if (sales) {
    const { data: saleItemsData } = await supabaseAdmin
      .from("sale_items")
      .select("id, item_type, total_price, item_id")
      .in(
        "sale_id",
        sales.map((s: any) => s.id)
      )
      .eq("item_type", "product");

    if (saleItemsData) {
      saleItems = saleItemsData;
      for (const item of saleItems) {
        const price = Number((item as any).total_price || 0);
        result.productRevenue += price;
        result.productCommission +=
          (price * (staff.commission_enabled ? baseProductRate : 0)) / 100;
      }
    }
  }

  result.totalRevenue = result.serviceRevenue + result.productRevenue;

  // Apply tiered commission: if staff has tiers, the tier rate overrides base rate for items without override
  const { data: tiers } = await supabaseAdmin
    .from("provider_staff_commission_tiers")
    .select("min_revenue, commission_rate")
    .eq("staff_id", staffId)
    .order("min_revenue", { ascending: false });

  let tierRate: number | null = null;
  if (tiers && tiers.length > 0) {
    const sorted = [...tiers].sort((a: any, b: any) => Number(b.min_revenue || 0) - Number(a.min_revenue || 0));
    const qualifying = sorted.find((t: any) => result.totalRevenue >= Number(t.min_revenue || 0));
    if (qualifying) tierRate = Number(qualifying.commission_rate || 0);
  }

  const effectiveServiceRate = tierRate ?? baseServiceRate;
  const effectiveProductRate = tierRate ?? baseProductRate;

  // Recompute commission with tier rate for items that used base rate (no override)
  result.serviceCommission = 0;
  result.productCommission = 0;

  for (const booking of bookings) {
    const bookingRevenue = revenueByBooking.get(booking.id) || 0;
    const services = (booking as any).booking_services || [];
    const totalServicePrice = services.reduce((s: number, x: any) => s + Number(x.price || 0), 0);
    if (totalServicePrice === 0) continue;
    const staffServices = services.filter((s: any) => s.staff_id === staffId);
    for (const svc of staffServices) {
      const offering = offeringMap.get(svc.offering_id);
      if (offering?.team_member_commission_enabled === false) continue;
      const revShare = (Number(svc.price || 0) / totalServicePrice) * bookingRevenue;
      const rate = offering?.commission_rate_override != null ? offering.commission_rate_override : effectiveServiceRate;
      result.serviceCommission += (revShare * (staff.commission_enabled ? rate : 0)) / 100;
    }
  }

  for (const bp of bookingProducts) {
    const product = productMap.get((bp as any).product_id);
    if (product?.team_member_commission_enabled === false) continue;
    let sid = (bp as any).staff_id;
    if (!sid) {
      const b = bookings.find((x: any) => x.id === (bp as any).booking_id);
      sid = (b as any)?.booking_services?.find((s: any) => s.staff_id)?.staff_id;
    }
    if (sid !== staffId) continue;
    const price = Number((bp as any).total_price || 0);
    const rate = product?.commission_rate_override != null ? product.commission_rate_override : effectiveProductRate;
    result.productCommission += (price * (staff.commission_enabled ? rate : 0)) / 100;
  }

  for (const item of saleItems || []) {
    const price = Number((item as any).total_price || 0);
    result.productCommission += (price * (staff.commission_enabled ? effectiveProductRate : 0)) / 100;
  }

  result.totalCommission = result.serviceCommission + result.productCommission;

  return result;
}

/**
 * Calculate commission for all staff of a provider in a date range.
 */
export async function calculateAllStaffCommissions(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  staffIdFilter?: string
): Promise<Map<string, CommissionResult>> {
  const results = new Map<string, CommissionResult>();

  let staffQuery = supabaseAdmin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  if (staffIdFilter) {
    staffQuery = staffQuery.eq("id", staffIdFilter);
  }

  const { data: staffMembers } = await staffQuery;

  if (!staffMembers) return results;

  for (const staff of staffMembers) {
    const commission = await calculateStaffCommission(
      supabaseAdmin,
      providerId,
      staff.id,
      fromDate,
      toDate
    );
    results.set(staff.id, commission);
  }

  return results;
}
