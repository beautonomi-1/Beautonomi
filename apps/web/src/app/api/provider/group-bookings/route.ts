import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  groupPackageTotal,
  groupProductLineTotal,
  validateAndPriceGroupPackage,
} from "@/lib/bookings/group-booking-package-pricing";
import { evaluateGroupCapacity, normalizeGroupCapacity } from "@/lib/bookings/group-capacity";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { computeCatalogPackageServiceDiscount } from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import {
  createGroupParticipantChildBooking,
  notifyGroupParticipantBooking,
} from "@/lib/bookings/create-group-participant-booking";
import { computeGroupPaymentRollupFields } from "@/lib/bookings/group-booking-payment-rollup";
import { RECOGNIZED_REVENUE_TYPES, recognizedRevenue } from "@/lib/reports/provider-revenue-semantics";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

async function computeCompletedGroupBookingStats(
  admin: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
): Promise<{
  completed_count: number;
  session_booked_gross: number;
  participant_booked_gross: number;
  recognized_earnings: number;
}> {
  const { data: completedRows, error } = await admin
    .from("group_bookings")
    .select("id, total_price, booking_participants(booking_id)")
    .eq("provider_id", providerId)
    .eq("status", "completed");
  if (error) throw error;

  const rows = completedRows ?? [];
  let sessionBookedGross = 0;
  const bookingIds = new Set<string>();
  for (const row of rows) {
    sessionBookedGross += Number((row as { total_price?: number | null }).total_price ?? 0);
    const participants = (row as { booking_participants?: { booking_id?: string | null }[] })
      .booking_participants;
    for (const p of participants ?? []) {
      if (typeof p.booking_id === "string" && p.booking_id.trim()) {
        bookingIds.add(p.booking_id.trim());
      }
    }
  }

  const uniqueBookingIds = [...bookingIds];
  let participantBookedGross = 0;
  if (uniqueBookingIds.length > 0) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select("id, total_amount")
      .in("id", uniqueBookingIds);
    participantBookedGross = (bookingRows ?? []).reduce(
      (sum, b) => sum + Number((b as { total_amount?: number | null }).total_amount ?? 0),
      0,
    );
  }

  let recognizedEarnings = 0;
  if (uniqueBookingIds.length > 0) {
    const ledgerQuery = admin
      .from("finance_transactions")
      .select("transaction_type, amount, net, booking_id")
      .eq("provider_id", providerId)
      .in("booking_id", uniqueBookingIds)
      .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES])
      .order("created_at", { ascending: true });
    const ledgerRows = await fetchAllLedgerPages(
      ledgerQuery as Parameters<typeof fetchAllLedgerPages>[0],
      MAX_FINANCE_TRANSACTIONS,
    );
    recognizedEarnings = recognizedRevenue(ledgerRows);
  }

  return {
    completed_count: rows.length,
    session_booked_gross: sessionBookedGross,
    participant_booked_gross: participantBookedGross,
    recognized_earnings: recognizedEarnings,
  };
}

async function generateGroupBookingRef(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await admin.rpc("generate_group_booking_ref");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return `GB-${Date.now().toString().slice(-10)}`;
}

/**
 * List/detail queries use the service-role client so provider_staff and
 * embedded `booking_participants` rows are visible consistently (RLS on
 * `group_bookings` is owner-centric; participant inserts often use admin).
 */

/**
 * GET /api/provider/group-bookings
 *
 * Get provider's group bookings with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search")?.trim();
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const admin = getSupabaseAdmin();
    const { timezone: tz } = await getProviderReportContext(admin, providerId);
    const ymdParam = /^\d{4}-\d{2}-\d{2}$/;
    const aggregateStats = await computeCompletedGroupBookingStats(admin, providerId);

    let groupBookings: any[] = [];
    let total = 0;

    try {
      let query = admin
        .from("group_bookings")
        .select(
          "*, service_packages:package_id(id, name, price, discount_percentage), booking_participants(id, booking_id, participant_name, participant_email, participant_phone, is_primary_contact, service_id, service_name, price, duration_minutes, addons, checked_in_at, checked_out_at)",
          { count: "exact" }
        )
        .eq("provider_id", providerId)
        .order("scheduled_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
        const d0 = dateFrom.slice(0, 10);
        query = query.gte("scheduled_at", dateRangeBoundsUtc(d0, d0, tz).fromIso);
      }
      if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
        const d1 = dateTo.slice(0, 10);
        query = query.lte("scheduled_at", dateRangeBoundsUtc(d1, d1, tz).toIso);
      }

      if (search) {
        query = query.or(`ref_number.ilike.%${search}%,title.ilike.%${search}%`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        if (
          error.code === "42P01" ||
          error.code === "42703" ||
          error.message?.includes("does not exist")
        ) {
          return successResponse({
            data: [],
            total: 0,
            page,
            limit,
            total_pages: 0,
            stats: aggregateStats,
          });
        }
        throw error;
      }

      const raw = data || [];
      const serviceIds = [...new Set(raw.map((r: any) => r.service_id).filter(Boolean))];
      const staffIds = [...new Set(raw.map((r: any) => r.staff_id).filter(Boolean))];
      const [offeringsRes, staffRes] = await Promise.all([
        serviceIds.length > 0
          ? admin.from("offerings").select("id, title").in("id", serviceIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
        staffIds.length > 0
          ? admin.from("provider_staff").select("id, name").in("id", staffIds)
          : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
      ]);
      const offeringTitle = new Map((offeringsRes.data || []).map((o: any) => [o.id, o.title]));
      const staffName = new Map((staffRes.data || []).map((s: any) => [s.id, s.name]));
      const participantBookingIds = [
        ...new Set(
          raw
            .flatMap((r: any) =>
              Array.isArray(r.booking_participants) ? r.booking_participants : []
            )
            .map((p: any) => p.booking_id)
            .filter(Boolean)
        ),
      ];
      const participantPaymentsRes =
        participantBookingIds.length > 0
          ? await admin
              .from("bookings")
              .select(
                "id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, additional_charges(amount,status)"
              )
              .in("id", participantBookingIds)
          : { data: [] as any[] };
      const participantPaymentByBookingId = new Map(
        (participantPaymentsRes.data ?? []).map((booking: any) => {
          const paidAfterRefunds = Math.max(
            0,
            Number(booking.total_paid ?? 0) - Number(booking.total_refunded ?? 0)
          );
          const walletGiftCoverage =
            Number(booking.wallet_amount ?? 0) + Number(booking.gift_card_amount ?? 0);
          const coverage = Math.max(paidAfterRefunds, walletGiftCoverage);
          const unpaidAdditionalCharges = Array.isArray(booking.additional_charges)
            ? booking.additional_charges
                .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
                .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
            : 0;
          const balanceDue = computeBookingOutstandingDisplay({
            totalAmount: Number(booking.total_amount ?? 0),
            totalPaid: Number(booking.total_paid ?? 0),
            totalRefunded: Number(booking.total_refunded ?? 0),
            walletAmount: Number(booking.wallet_amount ?? 0),
            giftCardAmount: Number(booking.gift_card_amount ?? 0),
            unpaidAdditionalCharges,
            paymentStatus: booking.payment_status ?? null,
          });
          return [
            booking.id,
            {
              total_amount: Number(booking.total_amount ?? 0),
              total_paid: Number(booking.total_paid ?? 0),
              total_refunded: Number(booking.total_refunded ?? 0),
              wallet_gift_coverage: walletGiftCoverage,
              balance_due: balanceDue,
              payment_status:
                booking.payment_status ||
                (balanceDue <= 0 && Number(booking.total_amount ?? 0) > 0
                  ? "paid"
                  : coverage > 0
                    ? "partially_paid"
                    : "pending"),
              paid: Number(booking.total_amount ?? 0) > 0 && balanceDue <= 0,
            },
          ];
        })
      );
      const participantBookingTotalById = new Map(
        (participantPaymentsRes.data ?? []).map((booking: any) => [
          booking.id,
          Number(booking.total_amount ?? 0) || 0,
        ])
      );

      const groupIds = raw.map((r: any) => r.id).filter(Boolean);
      const childBookingsByGroupId = new Map<string, any[]>();
      if (groupIds.length > 0) {
        const { data: childBookingsForRollup } = await admin
          .from("bookings")
          .select(
            "id, group_booking_id, status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, tip_amount, additional_charges(amount,status)",
          )
          .in("group_booking_id", groupIds);
        for (const child of childBookingsForRollup ?? []) {
          const gid = (child as { group_booking_id?: string | null }).group_booking_id;
          if (!gid) continue;
          const bucket = childBookingsByGroupId.get(gid) ?? [];
          bucket.push(child);
          childBookingsByGroupId.set(gid, bucket);
        }
      }

      groupBookings = raw.map((row: any) => {
        const at = row.scheduled_at ? new Date(row.scheduled_at) : null;
        const participants = (row.booking_participants || []).map((p: any) => {
          const payment = p.booking_id ? participantPaymentByBookingId.get(p.booking_id) : null;
          return {
            id: p.id,
            booking_id: p.booking_id,
            group_booking_id: row.id,
            client_name: p.participant_name || "—",
            client_email: p.participant_email,
            client_phone: p.participant_phone,
            service_id: p.service_id || "",
            service_name: p.service_name || "—",
            price: Number(p.price) || 0,
            duration_minutes: p.duration_minutes,
            addons: p.addons || [],
            checked_in: !!p.checked_in_at,
            checked_in_time: p.checked_in_at,
            checked_out: !!p.checked_out_at,
            checked_out_time: p.checked_out_at,
            payment_status: payment?.payment_status ?? "pending",
            paid: payment?.paid ?? false,
            balance_due: payment?.balance_due ?? (Number(p.price) || 0),
            total_paid: payment?.total_paid ?? 0,
            total_refunded: payment?.total_refunded ?? 0,
          };
        });
        const uniqueParticipantBookingIds: string[] = Array.from(
          new Set(
            participants
              .map((participant: { booking_id?: string | null }) => participant.booking_id)
              .filter(
                (bookingId): bookingId is string =>
                  typeof bookingId === "string" && bookingId.length > 0
              )
          )
        );
        const linkedParticipantInvoiceTotal = uniqueParticipantBookingIds.reduce(
          (sum: number, bookingId: string) =>
            sum + (participantBookingTotalById.get(bookingId) ?? 0),
          0
        );
        const participantTotal = participants.reduce(
          (sum: number, p: any) => sum + (Number(p.price) || 0),
          0
        );
        const productTotal = Array.isArray(row.products)
          ? row.products.reduce((sum: number, p: any) => sum + groupProductLineTotal(p), 0)
          : 0;
        const pkg = Array.isArray(row.service_packages)
          ? row.service_packages[0]
          : row.service_packages;
        const packageDiscount = pkg
          ? computeCatalogPackageServiceDiscount(pkg, participantTotal)
          : 0;
        const computedGroupSessionTotal = groupPackageTotal({
          participantTotal,
          productTotal,
          travelFee: Number(row.travel_fee) || 0,
          packageDiscount,
        });
        const totalPrice =
          linkedParticipantInvoiceTotal > 0
            ? Math.max(
                linkedParticipantInvoiceTotal,
                row.total_price != null ? Number(row.total_price) || 0 : computedGroupSessionTotal
              )
            : row.total_price != null
              ? Number(row.total_price) || 0
              : computedGroupSessionTotal;
        const sid = row.service_id as string | null | undefined;
        const tid = row.staff_id as string | null | undefined;
        const groupPayment = computeGroupPaymentRollupFields(
          row.id,
          childBookingsByGroupId.get(row.id) ?? [],
          totalPrice,
        );
        return {
          ...row,
          service_name: row.service_name || (sid ? offeringTitle.get(sid) : null) || null,
          team_member_id: tid ?? null,
          team_member_name: tid ? (staffName.get(tid) ?? null) : null,
          current_participants: participants.length,
          total_price: totalPrice,
          package_name: pkg?.name ?? null,
          package_discount_amount: packageDiscount,
          scheduled_date: at ? at.toISOString().split("T")[0] : "",
          scheduled_time: at ? at.toTimeString().slice(0, 5) : "",
          participants,
          ...groupPayment,
        };
      });
      total = count || 0;
    } catch (error: any) {
      if (
        error.code === "42P01" ||
        error.code === "42703" ||
        error.message?.includes("does not exist")
      ) {
        return successResponse({
          data: [],
          total: 0,
          page,
          limit,
          total_pages: 0,
          stats: aggregateStats,
        });
      }
      throw error;
    }

    return successResponse({
      data: groupBookings,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      stats: aggregateStats,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group bookings");
  }
}

/**
 * POST /api/provider/group-bookings
 *
 * Create a group booking from the provider portal.
 * Accepts: title, scheduled_at, service_id, staff_id, location_id,
 *          max_participants, duration_minutes, notes, participants[]
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const groupBookingCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = await request.json();
    const {
      title,
      scheduled_at,
      service_id,
      staff_id,
      location_id,
      location_type,
      address_line1,
      address_city,
      address_state,
      address_country,
      address_postal_code,
      address_latitude,
      address_longitude,
      address_place_name,
      travel_fee,
      products,
      max_participants,
      duration_minutes,
      notes,
      participants,
      // §Provider-audit 2026-04 (packages round 2): persist the link to the
      // catalog service_package so reporting/discount math can be applied.
      package_id,
    } = body;

    if (!scheduled_at) {
      return errorResponse("scheduled_at is required", "VALIDATION_ERROR", 400);
    }

    // Commit-time availability check (same engine as single-booking create).
    // Only run when we have enough inputs to reason about; if staff/location
    // are missing we fall back to pending-creation (the provider can still
    // assign staff later and the calendar will show the row).
    const allowOverride = body?.allow_override === true;
    const effectiveDuration = Number.isFinite(Number(duration_minutes))
      ? Number(duration_minutes)
      : 60;
    const scheduledAtDate = new Date(scheduled_at);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return errorResponse("Invalid scheduled_at", "VALIDATION_ERROR", 400);
    }
    const normalizedProducts = Array.isArray(products) ? products : [];
    const normalizedParticipants = Array.isArray(participants) ? participants : [];
    const normalizedMaxParticipants = normalizeGroupCapacity(max_participants, 10);
    const capacityCheck = evaluateGroupCapacity({
      maxParticipants: normalizedMaxParticipants,
      currentParticipants: normalizedParticipants.length,
    });
    if (capacityCheck.ok === false) {
      return errorResponse(capacityCheck.message, capacityCheck.code, 400);
    }
    const serverTravelFee = location_type === "at_home" ? Math.max(0, Number(travel_fee || 0)) : 0;
    const participantTotal = normalizedParticipants.reduce(
      (sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)),
      0
    );
    const productTotal = normalizedProducts.reduce(
      (sum: number, p: any) => sum + groupProductLineTotal(p),
      0
    );
    const groupPackagePricing = await validateAndPriceGroupPackage({
      supabaseAdmin: admin,
      providerId,
      packageId: package_id || null,
      locationType: location_type === "at_home" ? "at_home" : "at_salon",
      locationId: location_type === "at_home" ? null : location_id || null,
      participantRows: normalizedParticipants,
      fallbackServiceId: service_id || null,
      productRows: normalizedProducts,
      participantTotal,
      // Provider mobile creates the group row first, then POSTs participants — package lines validate then.
      allowEmptyServices: true,
    });
    if (groupPackagePricing.ok === false) {
      return errorResponse(groupPackagePricing.message, groupPackagePricing.code, 400);
    }
    const serverTotalPrice = groupPackageTotal({
      participantTotal,
      productTotal,
      travelFee: serverTravelFee,
      packageDiscount: groupPackagePricing.packageDiscount,
    });

    if (!allowOverride) {
      const holdEnd = addMinutes(
        scheduledAtDate,
        effectiveDuration + (location_type === "at_home" ? 30 : 0)
      );
      const holdIdRaw = (body as { hold_id?: unknown }).hold_id;
      const excludeHoldId =
        typeof holdIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(holdIdRaw.trim())
          ? holdIdRaw.trim()
          : undefined;
      const holdOverlap = await checkActiveHoldOverlap(
        admin,
        providerId,
        scheduledAtDate,
        holdEnd,
        {
          dbStaffId: staff_id ? String(staff_id) : null,
          ...(excludeHoldId ? { excludeHoldId } : {}),
        }
      );
      if (holdOverlap) {
        return errorResponse(
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }

      const check = await evaluateProviderSlotAgainstGrid(admin, {
        providerId,
        scheduledAt: scheduledAtDate,
        durationMinutes: effectiveDuration,
        staffIdsCsv: staff_id ? String(staff_id) : null,
        locationId: location_type === "at_home" ? null : location_id ? String(location_id) : null,
        excludeBookingId: undefined,
        mode: location_type === "at_home" ? "mobile" : "salon",
        travelBufferRaw: location_type === "at_home" ? "30" : null,
        minNoticeMinutes: 0,
        maxAdvanceDays: 365,
        resourceOfferingIds: service_id ? [String(service_id)] : [],
      });
      if (!check.ok) {
        return errorResponse(
          check.conflicts.join("; ") || "Slot is not available",
          "SLOT_NOT_AVAILABLE",
          409
        );
      }
    }

    const refNumber = await generateGroupBookingRef(admin);

    const { data: groupBooking, error: gbError } = await admin
      .from("group_bookings")
      .insert({
        provider_id: providerId,
        ref_number: refNumber,
        title: title || "Group Session",
        scheduled_at,
        service_id: service_id || null,
        staff_id: staff_id || null,
        location_id: location_type === "at_home" ? null : location_id || null,
        location_type: location_type === "at_home" ? "at_home" : "at_salon",
        address_line1: location_type === "at_home" ? address_line1 || null : null,
        address_city: location_type === "at_home" ? address_city || null : null,
        address_state: location_type === "at_home" ? address_state || null : null,
        address_country: location_type === "at_home" ? address_country || null : null,
        address_postal_code: location_type === "at_home" ? address_postal_code || null : null,
        address_latitude:
          location_type === "at_home" && address_latitude != null ? Number(address_latitude) : null,
        address_longitude:
          location_type === "at_home" && address_longitude != null
            ? Number(address_longitude)
            : null,
        address_place_name: location_type === "at_home" ? address_place_name || null : null,
        travel_fee: serverTravelFee,
        products: normalizedProducts,
        total_price: serverTotalPrice,
        max_participants: normalizedMaxParticipants,
        duration_minutes: duration_minutes || 60,
        notes: notes || null,
        status: "confirmed",
        created_by: user.id,
        ...(package_id ? { package_id } : {}),
      })
      .select()
      .single();

    if (gbError) {
      if (gbError.code === "42P01" || gbError.message?.includes("does not exist")) {
        return errorResponse(
          "Group bookings table is not yet set up. Please run the database migrations.",
          "TABLE_NOT_FOUND",
          503
        );
      }
      throw gbError;
    }

    // Add participants if provided (booking_id is nullable after migration 485).
    //
    // §Group-booking-audit 2026-05: previously a participant insert failure
    // was silently swallowed with `console.warn`, leaving an orphan group with
    // R 0,00 services + travel fee — exactly the "Participants (0) / Total R
    // 100" receipt the user reported. We now roll back the group on participant
    // failure and surface the Postgres error (FK violation on service_id,
    // unique violation on booking_id, etc.) so the operator can fix the
    // underlying input instead of being stranded with a half-created group.
    if (normalizedParticipants.length > 0) {
      // §Group-booking-audit 2026-05 (primary normalize): guarantee exactly
      // one participant is marked primary. The previous `?? idx === 0`
      // fallback failed when every payload explicitly set `is_primary_contact:
      // false`, leaving the group with no primary contact → downstream
      // reschedule/cancel notify routes returned 400 "no primary contact yet".
      const explicitPrimaryIdx = normalizedParticipants.findIndex(
        (p: any) => p?.is_primary_contact === true
      );
      const primaryIdxResolved = explicitPrimaryIdx >= 0 ? explicitPrimaryIdx : 0;

      const sessionContext = {
        providerId,
        groupBookingId: groupBooking.id,
        groupRef: refNumber,
        scheduledAt: scheduled_at,
        staffId: staff_id ? String(staff_id) : null,
        locationId: location_type === "at_home" ? null : location_id ? String(location_id) : null,
        locationType: (location_type === "at_home" ? "at_home" : "at_salon") as
          | "at_home"
          | "at_salon",
        address:
          location_type === "at_home"
            ? {
                line1: address_line1 || null,
                city: address_city || null,
                state: address_state || null,
                country: address_country || null,
                postal_code: address_postal_code || null,
                latitude: address_latitude != null ? Number(address_latitude) : null,
                longitude: address_longitude != null ? Number(address_longitude) : null,
              }
            : undefined,
        travelFee: serverTravelFee,
        currency: groupBookingCurrency,
        tenantId: tenantId ?? null,
      };

      const participantsWithBookings = [...normalizedParticipants] as any[];
      const newlyCreatedBookingIds: string[] = [];
      // The at-home travel fee is charged once, on the primary (key payer's)
      // child booking, so it's collected via mark_paid and refundable. Track
      // whether it landed; if the primary never gets a child booking (e.g. a
      // walk-in with no customer_id) we attach it to the first created booking
      // below so it's never stranded on the group row uncollected.
      const wantsTravelFee = location_type === "at_home" && Number(serverTravelFee) > 0;
      let travelFeeApplied = false;
      for (let idx = 0; idx < participantsWithBookings.length; idx++) {
        const p = participantsWithBookings[idx];
        if (p.booking_id) continue;
        const customerId =
          typeof p.customer_id === "string" && p.customer_id.trim().length > 0
            ? p.customer_id.trim()
            : null;
        if (!customerId) continue;
        const svcId = p.service_id || service_id || null;
        if (!svcId) continue;

        const carriesTravelFee = wantsTravelFee && idx === primaryIdxResolved;
        const created = await createGroupParticipantChildBooking(admin, sessionContext, {
          customerId,
          serviceId: String(svcId),
          serviceName: p.service_name || null,
          price: typeof p.price === "number" ? p.price : 0,
          durationMinutes:
            typeof p.duration_minutes === "number"
              ? p.duration_minutes
              : duration_minutes || 60,
          addons: Array.isArray(p.addons) ? p.addons : [],
          includeSessionTravelFee: carriesTravelFee,
        });
        if ("error" in created) {
          console.error("Failed to create participant booking for group", groupBooking.id, created.error);
          // Roll back any child bookings created before this failure, then the group row.
          if (newlyCreatedBookingIds.length > 0) {
            await admin.from("bookings").delete().in("id", newlyCreatedBookingIds);
          }
          await admin.from("group_bookings").delete().eq("id", groupBooking.id);
          return errorResponse(
            `Could not create booking for participant ${p.name || p.participant_name || idx + 1}: ${created.error}`,
            "PARTICIPANT_BOOKING_FAILED",
            400
          );
        }
        if (carriesTravelFee) travelFeeApplied = true;
        newlyCreatedBookingIds.push(created.bookingId);
        participantsWithBookings[idx] = { ...p, booking_id: created.bookingId };
      }

      // Fallback: the primary participant didn't produce a child booking, so
      // attach the travel fee to the first created booking instead.
      if (wantsTravelFee && !travelFeeApplied && newlyCreatedBookingIds.length > 0) {
        const fallbackId = newlyCreatedBookingIds[0];
        const { data: fb } = await admin
          .from("bookings")
          .select("total_amount")
          .eq("id", fallbackId)
          .maybeSingle();
        const currentTotal = Number((fb as { total_amount?: number } | null)?.total_amount ?? 0);
        await admin
          .from("bookings")
          .update({
            travel_fee: Number(serverTravelFee),
            total_amount: currentTotal + Number(serverTravelFee),
            updated_at: new Date().toISOString(),
          })
          .eq("id", fallbackId);
      }

      const participantRows = participantsWithBookings.map((p: any, idx: number) => ({
        group_booking_id: groupBooking.id,
        booking_id: p.booking_id || null,
        // §Group-booking-audit 2026-05: store customer_id when an existing
        // client was selected via search so receipts and future history
        // lookups can join to the correct user profile.
        customer_id: p.customer_id || null,
        participant_name: p.name || p.participant_name || p.client_name || "—",
        participant_email: p.email || p.participant_email || p.client_email || null,
        participant_phone: p.phone || p.participant_phone || p.client_phone || null,
        is_primary_contact: idx === primaryIdxResolved,
        service_id: p.service_id || service_id || null,
        service_name: p.service_name || null,
        price: typeof p.price === "number" ? p.price : 0,
        duration_minutes:
          typeof p.duration_minutes === "number" ? p.duration_minutes : duration_minutes || null,
        addons: Array.isArray(p.addons) ? p.addons : [],
      }));

      const { error: pError } = await admin.from("booking_participants").insert(participantRows);

      if (pError) {
        console.error("Failed to insert participants for group", groupBooking.id, pError);
        // Roll back child bookings created during this request, then the group row.
        if (newlyCreatedBookingIds.length > 0) {
          await admin.from("bookings").delete().in("id", newlyCreatedBookingIds);
        }
        await admin.from("group_bookings").delete().eq("id", groupBooking.id);

        const dbCode = (pError as { code?: string }).code ?? null;
        const dbMessage = (pError as { message?: string }).message ?? "";
        const dbHint = (pError as { hint?: string }).hint ?? null;
        const dbDetail = (pError as { details?: string }).details ?? null;
        const friendly = dbMessage
          ? `Group created, but participants could not be saved: ${dbMessage}`
          : "Group created, but participants could not be saved. The group has been rolled back. Please retry.";
        return errorResponse(
          friendly,
          dbCode === "23503"
            ? "PARTICIPANT_FK_VIOLATION"
            : dbCode === "23505"
              ? "PARTICIPANT_UNIQUE_VIOLATION"
              : dbCode === "23514"
                ? "PARTICIPANT_CHECK_VIOLATION"
                : "PARTICIPANT_DB_ERROR",
          400,
          { db_code: dbCode, hint: dbHint, detail: dbDetail }
        );
      }

      const linkedBookingIds = participantRows
        .map((p: any) => p.booking_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      if (linkedBookingIds.length > 0) {
        const { error: linkError } = await admin
          .from("bookings")
          .update({
            group_booking_id: groupBooking.id,
            is_group_booking: true,
            updated_at: new Date().toISOString(),
          })
          .eq("provider_id", providerId)
          .in("id", linkedBookingIds);
        if (linkError) {
          console.warn("Failed to link existing bookings to group:", linkError);
        }
      }

      // §Group-booking-audit 2026-05 (primary booking_id link): record the
      // primary contact's booking on `group_bookings.primary_contact_booking_id`
      // so notify-reschedule / notify-cancellation can route through the real
      // bookings row that carries the customer.
      const primaryParticipantInput = participantsWithBookings[primaryIdxResolved];
      const primaryBookingId: string | null = primaryParticipantInput?.booking_id ?? null;
      if (primaryBookingId) {
        const { error: linkPrimaryErr } = await admin
          .from("group_bookings")
          .update({
            primary_contact_booking_id: primaryBookingId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", groupBooking.id);
        if (linkPrimaryErr) {
          console.warn("Failed to set primary_contact_booking_id on group:", linkPrimaryErr);
        }
      }

      const shouldNotifyParticipants = body?.send_notification !== false;
      if (shouldNotifyParticipants) {
        const notifiedCustomerIds = new Set<string>();
        for (const p of participantsWithBookings) {
          const bookingId =
            typeof p.booking_id === "string" && p.booking_id.length > 0 ? p.booking_id : null;
          const customerId =
            typeof p.customer_id === "string" && p.customer_id.trim().length > 0
              ? p.customer_id.trim()
              : null;
          if (!bookingId || !customerId || notifiedCustomerIds.has(customerId)) continue;
          notifiedCustomerIds.add(customerId);
          void notifyGroupParticipantBooking(bookingId, customerId, providerId);
        }
      }
    }

    // Refetch with participants joined (include new service/pricing columns)
    const { data: fullBooking } = await admin
      .from("group_bookings")
      .select(
        "*, service_packages:package_id(id, name), booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact, service_id, service_name, price, duration_minutes, addons, checked_in_at, checked_out_at)"
      )
      .eq("id", groupBooking.id)
      .single();

    const result = fullBooking || groupBooking;
    const at = result.scheduled_at ? new Date(result.scheduled_at) : null;

    return successResponse({
      ...result,
      package_discount_amount: groupPackagePricing.packageDiscount,
      package_name:
        (Array.isArray((result as any).service_packages)
          ? (result as any).service_packages[0]?.name
          : (result as any).service_packages?.name) ?? null,
      scheduled_date: at ? at.toISOString().split("T")[0] : "",
      scheduled_time: at ? at.toTimeString().slice(0, 5) : "",
      participants: (result.booking_participants || []).map((p: any) => ({
        id: p.id,
        group_booking_id: result.id,
        client_name: p.participant_name || "—",
        client_email: p.participant_email,
        client_phone: p.participant_phone,
        service_id: p.service_id || "",
        service_name: p.service_name || "—",
        price: p.price || 0,
        duration_minutes: p.duration_minutes,
        addons: p.addons || [],
        checked_in: !!p.checked_in_at,
        checked_in_time: p.checked_in_at,
        checked_out: !!p.checked_out_at,
        checked_out_time: p.checked_out_at,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to create group booking");
  }
}
