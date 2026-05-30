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
import { rescheduleBookingServicesSequential } from "@/lib/bookings/reschedule-booking-services";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { bookingTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import {
  groupPackageTotal,
  groupProductLineTotal,
  validateAndPriceGroupPackage,
} from "@/lib/bookings/group-booking-package-pricing";
import { evaluateGroupCapacity, normalizeGroupCapacity } from "@/lib/bookings/group-capacity";
import { computeWalletGiftCoverageOutstanding } from "@/lib/bookings/provider-booking-finance";
import {
  PROVIDER_GROUP_DETAIL_SELECT,
  PROVIDER_GROUP_DETAIL_SELECT_FALLBACK,
  PROVIDER_CHILD_BOOKINGS_SELECT,
} from "@/lib/bookings/group-booking-postgrest";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

/**
 * GET /api/provider/group-bookings/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // §Group-booking-audit 2026-05: differentiate a truly missing group
    // booking from an embed/select failure (which previously returned a
    // misleading 404 "Group booking not found"). We first check the row
    // exists with a minimal projection, then attempt the rich select.
    const { data: existence, error: existenceError } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (existenceError) {
      console.error("[provider group GET] existence check failed:", existenceError);
      return errorResponse(
        "Failed to load group booking",
        "GROUP_BOOKING_FETCH_FAILED",
        500,
        { db: existenceError.message ?? null }
      );
    }
    if (!existence) {
      return notFoundResponse("Group booking not found");
    }

    let { data: groupBooking, error } = await admin
      .from("group_bookings")
      .select(PROVIDER_GROUP_DETAIL_SELECT)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !groupBooking) {
      // §Group-booking-resilience 2026-05: the row exists (existence check
      // passed) so the rich select failed — most likely a PostgREST FK-hint
      // mismatch caused by ambiguity between the two FK paths to `bookings`
      // (primary_contact_booking_id vs group_booking_id). Attempt the fallback
      // select that omits the child-bookings embed and fetches them separately.
      console.error(
        "[provider group GET] rich select failed, trying fallback",
        { code: error?.code, message: error?.message, hint: (error as any)?.hint }
      );

      const { data: fallbackGroup, error: fallbackError } = await admin
        .from("group_bookings")
        .select(PROVIDER_GROUP_DETAIL_SELECT_FALLBACK)
        .eq("id", id)
        .eq("provider_id", providerId)
        .single();

      if (fallbackError || !fallbackGroup) {
        console.error("[provider group GET] fallback select also failed:", fallbackError);
        return errorResponse(
          "Group booking exists but its detail view could not be assembled. Please refresh and try again.",
          "GROUP_BOOKING_DETAIL_FAILED",
          500,
          { db: error?.message ?? null, fallback: fallbackError?.message ?? null }
        );
      }

      // Fetch child bookings separately to avoid the FK-hint ambiguity.
      const { data: childBookings } = await admin
        .from("bookings")
        .select(PROVIDER_CHILD_BOOKINGS_SELECT)
        .eq("group_booking_id", id);

      groupBooking = { ...(fallbackGroup as any), bookings: childBookings ?? [] };
    }

    const pkg = Array.isArray((groupBooking as any).service_packages)
      ? (groupBooking as any).service_packages[0]
      : (groupBooking as any).service_packages;
    const bookingPaymentById = new Map(
      (((groupBooking as any).bookings ?? []) as any[]).map((booking: any) => {
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
        const balanceDue = computeWalletGiftCoverageOutstanding({
          totalAmount: Number(booking.total_amount ?? 0),
          totalPaid: Number(booking.total_paid ?? 0),
          totalRefunded: Number(booking.total_refunded ?? 0),
          walletAmount: Number(booking.wallet_amount ?? 0),
          giftCardAmount: Number(booking.gift_card_amount ?? 0),
          unpaidAdditionalCharges,
        });
        return [
          booking.id,
          {
            payment_status:
              booking.payment_status ||
              (balanceDue <= 0 && Number(booking.total_amount ?? 0) > 0
                ? "paid"
                : coverage > 0
                  ? "partially_paid"
                  : "pending"),
            paid: Number(booking.total_amount ?? 0) > 0 && balanceDue <= 0,
            balance_due: balanceDue,
            total_paid: Number(booking.total_paid ?? 0),
            total_refunded: Number(booking.total_refunded ?? 0),
            wallet_gift_coverage: walletGiftCoverage,
            tip_amount: Number(booking.tip_amount ?? 0),
          },
        ];
      })
    );
    const participants = (((groupBooking as any).booking_participants ?? []) as any[]).map(
      (participant) => {
        const payment = participant.booking_id
          ? bookingPaymentById.get(participant.booking_id)
          : null;
        return {
          id: participant.id,
          booking_id: participant.booking_id ?? null,
          group_booking_id: id,
          client_name: participant.participant_name || "Guest",
          client_email: participant.participant_email || null,
          client_phone: participant.participant_phone || null,
          is_primary_contact: Boolean(participant.is_primary_contact),
          service_id: participant.service_id || "",
          service_name: participant.service_name || "—",
          price: Number(participant.price) || 0,
          duration_minutes: participant.duration_minutes ?? null,
          addons: Array.isArray(participant.addons) ? participant.addons : [],
          checked_in: Boolean(participant.checked_in_at),
          checked_in_time: participant.checked_in_at ?? null,
          checked_out: Boolean(participant.checked_out_at),
          checked_out_time: participant.checked_out_at ?? null,
          payment_status: payment?.payment_status ?? "pending",
          paid: payment?.paid ?? false,
          balance_due: payment?.balance_due ?? Math.max(0, Number(participant.price) || 0),
          total_paid: payment?.total_paid ?? 0,
          total_refunded: payment?.total_refunded ?? 0,
          wallet_gift_coverage: payment?.wallet_gift_coverage ?? 0,
          tip_amount: payment?.tip_amount ?? 0,
        };
      }
    );
    const linkedParticipantInvoiceTotal = (((groupBooking as any).bookings ?? []) as any[])
      .filter((booking: any) => booking?.status !== "cancelled" && booking?.status !== "no_show")
      .reduce((sum: number, booking: any) => sum + (Number(booking?.total_amount ?? 0) || 0), 0);
    const participantServiceTotal = participants.reduce(
      (sum: number, participant: any) => sum + (Number(participant?.price ?? 0) || 0),
      0
    );
    const productTotal = Array.isArray((groupBooking as any).products)
      ? ((groupBooking as any).products as any[]).reduce(
          (sum: number, product: any) => sum + groupProductLineTotal(product),
          0
        )
      : 0;
    const travelFee =
      (groupBooking as any).location_type === "at_home"
        ? Math.max(0, Number((groupBooking as any).travel_fee ?? 0))
        : 0;
    const sessionEstimateTotal = groupPackageTotal({
      participantTotal: participantServiceTotal,
      productTotal,
      travelFee,
      packageDiscount: 0,
    });

    const groupPayload = groupBooking as unknown as Record<string, unknown>;
    return successResponse({
      ...groupPayload,
      total_price:
        linkedParticipantInvoiceTotal > 0
          ? Math.max(
              linkedParticipantInvoiceTotal,
              Number((groupBooking as any).total_price ?? 0) || sessionEstimateTotal
            )
          : Number((groupBooking as any).total_price ?? 0) || sessionEstimateTotal,
      booking_participants: participants,
      participants,
      package_name: pkg?.name ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group booking");
  }
}

/**
 * PATCH /api/provider/group-bookings/[id]
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const body = await request.json();
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const allowedFields = [
      "title",
      "scheduled_at",
      "service_id",
      "staff_id",
      "location_id",
      "max_participants",
      "duration_minutes",
      "notes",
      "status",
      "location_type",
      "address_line1",
      "address_city",
      "address_state",
      "address_country",
      "address_postal_code",
      "address_latitude",
      "address_longitude",
      "address_place_name",
      "travel_fee",
      "products",
      "total_price",
      // §Provider-audit 2026-04 (packages round 2): allow updating the
      // service_package link so providers can attach/detach a package after
      // the group booking was created.
      "package_id",
    ];
    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) sanitized[key] = body[key];
    }
    if ("max_participants" in sanitized) {
      sanitized.max_participants = normalizeGroupCapacity(sanitized.max_participants);
    }
    if (sanitized.location_type === "at_home") {
      sanitized.location_id = null;
      sanitized.travel_fee = Math.max(0, Number(sanitized.travel_fee || 0));
    } else if (sanitized.location_type === "at_salon") {
      sanitized.address_line1 = null;
      sanitized.address_city = null;
      sanitized.address_state = null;
      sanitized.address_country = null;
      sanitized.address_postal_code = null;
      sanitized.address_latitude = null;
      sanitized.address_longitude = null;
      sanitized.address_place_name = null;
      sanitized.travel_fee = 0;
    }

    // Mobile / portal sometimes send split date+time instead of ISO `scheduled_at`.
    const scheduledDate = typeof body.scheduled_date === "string" ? body.scheduled_date.trim() : "";
    const scheduledTime = typeof body.scheduled_time === "string" ? body.scheduled_time.trim() : "";
    if (scheduledDate && scheduledTime && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      const hm = scheduledTime.match(/^(\d{1,2}):(\d{2})/);
      if (hm) {
        const isoLocal = `${scheduledDate}T${String(hm[1]).padStart(2, "0")}:${hm[2]}:00`;
        const parsed = new Date(isoLocal);
        if (!Number.isNaN(parsed.getTime())) {
          sanitized.scheduled_at = parsed.toISOString();
        }
      }
    }
    delete (sanitized as Record<string, unknown>).scheduled_date;
    delete (sanitized as Record<string, unknown>).scheduled_time;

    // Commit-time availability check when the slot / staff / location / duration
    // changes. Mirrors the single-booking PATCH behaviour so a provider cannot
    // silently shift a group onto a conflict.
    const movingSlot =
      "scheduled_at" in sanitized ||
      "staff_id" in sanitized ||
      "location_id" in sanitized ||
      "duration_minutes" in sanitized ||
      "service_id" in sanitized;
    const allowOverride = body?.allow_override === true;
    if (movingSlot && !allowOverride) {
      const { data: existing } = await admin
        .from("group_bookings")
        .select("scheduled_at, duration_minutes, staff_id, location_id, service_id, location_type")
        .eq("id", id)
        .eq("provider_id", providerId)
        .maybeSingle();
      const nextScheduledAt =
        (sanitized.scheduled_at as string | undefined) ?? existing?.scheduled_at ?? null;
      const nextDuration = Number(
        (sanitized.duration_minutes as number | undefined) ?? existing?.duration_minutes ?? 60
      );
      const nextStaff =
        (sanitized.staff_id as string | null | undefined) ??
        (existing?.staff_id as string | null | undefined) ??
        null;
      const nextLocation =
        (sanitized.location_id as string | null | undefined) ??
        (existing?.location_id as string | null | undefined) ??
        null;
      const nextService =
        (sanitized.service_id as string | null | undefined) ??
        (existing?.service_id as string | null | undefined) ??
        null;
      const nextLocationType =
        (sanitized.location_type as string | null | undefined) ??
        (existing?.location_type as string | null | undefined) ??
        "at_salon";
      if (nextScheduledAt) {
        const d = new Date(nextScheduledAt);
        if (!Number.isNaN(d.getTime())) {
          const holdEnd = addMinutes(
            d,
            (Number.isFinite(nextDuration) ? nextDuration : 60) +
              (nextLocationType === "at_home" ? 30 : 0)
          );
          const holdOverlap = await checkActiveHoldOverlap(admin, providerId, d, holdEnd, {
            dbStaffId: nextStaff ? String(nextStaff) : null,
          });
          if (holdOverlap) {
            return errorResponse(
              "This time slot is no longer available. Please select another time.",
              "CONFLICT",
              409
            );
          }

          const check = await evaluateProviderSlotAgainstGrid(admin, {
            providerId,
            scheduledAt: d,
            durationMinutes: Number.isFinite(nextDuration) ? nextDuration : 60,
            staffIdsCsv: nextStaff ? String(nextStaff) : null,
            locationId:
              nextLocationType === "at_home" ? null : nextLocation ? String(nextLocation) : null,
            excludeBookingId: undefined,
            excludeGroupBookingId: id,
            mode: nextLocationType === "at_home" ? "mobile" : "salon",
            travelBufferRaw: nextLocationType === "at_home" ? "30" : null,
            minNoticeMinutes: 0,
            maxAdvanceDays: 365,
            resourceOfferingIds: nextService ? [String(nextService)] : [],
          });
          if (!check.ok) {
            return errorResponse(
              check.conflicts.join("; ") || "Slot is not available",
              "SLOT_NOT_AVAILABLE",
              409
            );
          }
        }
      }
    }

    if (
      "products" in sanitized ||
      "travel_fee" in sanitized ||
      "location_type" in sanitized ||
      "total_price" in sanitized ||
      "package_id" in sanitized ||
      "service_id" in sanitized
    ) {
      const [{ data: existingTotals }, { data: participantRows }] = await Promise.all([
        admin
          .from("group_bookings")
          .select("products, travel_fee, location_type, package_id, location_id, service_id")
          .eq("id", id)
          .eq("provider_id", providerId)
          .maybeSingle(),
        admin.from("booking_participants").select("price, service_id").eq("group_booking_id", id),
      ]);
      const nextProducts = Array.isArray(sanitized.products)
        ? sanitized.products
        : Array.isArray(existingTotals?.products)
          ? existingTotals.products
          : [];
      const nextLocationType = String(
        sanitized.location_type ?? existingTotals?.location_type ?? "at_salon"
      );
      const nextTravelFee =
        nextLocationType === "at_home"
          ? Math.max(0, Number(sanitized.travel_fee ?? existingTotals?.travel_fee ?? 0))
          : 0;
      const participantTotal = (participantRows ?? []).reduce(
        (sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)),
        0
      );
      const productTotal = nextProducts.reduce(
        (sum: number, p: any) => sum + groupProductLineTotal(p),
        0
      );
      const nextPackageId =
        "package_id" in sanitized
          ? ((sanitized.package_id as string | null | undefined) ?? null)
          : ((existingTotals?.package_id as string | null | undefined) ?? null);
      const nextServiceId =
        (sanitized.service_id as string | null | undefined) ??
        (existingTotals?.service_id as string | null | undefined) ??
        null;
      const pkgPricing = await validateAndPriceGroupPackage({
        supabaseAdmin: admin,
        providerId,
        packageId: nextPackageId,
        locationType: nextLocationType,
        locationId:
          nextLocationType === "at_home"
            ? null
            : ((sanitized.location_id as string | null | undefined) ??
              existingTotals?.location_id ??
              null),
        participantRows: (participantRows ?? []) as Array<Record<string, unknown>>,
        fallbackServiceId: nextServiceId,
        productRows: nextProducts,
        participantTotal,
      });
      if (pkgPricing.ok === false) {
        return errorResponse(pkgPricing.message, pkgPricing.code, 400);
      }
      sanitized.products = nextProducts;
      sanitized.travel_fee = nextTravelFee;
      sanitized.total_price = groupPackageTotal({
        participantTotal,
        productTotal,
        travelFee: nextTravelFee,
        packageDiscount: pkgPricing.packageDiscount,
      });
    }

    if ("max_participants" in sanitized) {
      const { count, error: participantCountError } = await admin
        .from("booking_participants")
        .select("id", { count: "exact", head: true })
        .eq("group_booking_id", id);
      if (participantCountError) throw participantCountError;
      const capacity = evaluateGroupCapacity({
        maxParticipants: sanitized.max_participants,
        currentParticipants: count ?? 0,
      });
      if (capacity.ok === false) {
        return errorResponse(
          `Capacity cannot be lower than the current participant count (${capacity.current}).`,
          capacity.code,
          400
        );
      }
    }

    const shouldSyncChildBookings =
      "scheduled_at" in sanitized ||
      "staff_id" in sanitized ||
      "location_id" in sanitized ||
      "location_type" in sanitized ||
      "address_line1" in sanitized ||
      "address_city" in sanitized ||
      "address_state" in sanitized ||
      "address_country" in sanitized ||
      "address_postal_code" in sanitized ||
      "address_latitude" in sanitized ||
      "address_longitude" in sanitized ||
      "travel_fee" in sanitized;

    // Capture the current scheduled_at before the update so we can include it
    // in reschedule notifications after the child bookings are synced.
    let originalScheduledAt: string | null = null;
    if ("scheduled_at" in sanitized) {
      const { data: pre } = await admin
        .from("group_bookings")
        .select("scheduled_at")
        .eq("id", id)
        .eq("provider_id", providerId)
        .maybeSingle();
      originalScheduledAt =
        (pre as { scheduled_at?: string | null } | null)?.scheduled_at ?? null;
    }

    const { data, error } = await admin
      .from("group_bookings")
      .update(sanitized)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !data) {
      return notFoundResponse("Group booking not found");
    }

    if (shouldSyncChildBookings) {
      const childUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("scheduled_at" in sanitized) childUpdate.scheduled_at = sanitized.scheduled_at;
      if ("location_id" in sanitized) childUpdate.location_id = sanitized.location_id;
      if ("location_type" in sanitized) childUpdate.location_type = sanitized.location_type;
      // §Group-booking-qa 2026-05: staff_id was omitted from the child sync
      // list even though shouldSyncChildBookings fires when staff_id changes.
      // Result: changing the assigned staff on a group left every child booking
      // pointing at the old staff member, breaking the calendar and reports.
      if ("staff_id" in sanitized) childUpdate.staff_id = sanitized.staff_id;
      for (const key of [
        "address_line1",
        "address_city",
        "address_state",
        "address_country",
        "address_postal_code",
        "address_latitude",
        "address_longitude",
        "travel_fee",
      ]) {
        if (key in sanitized) childUpdate[key] = sanitized[key];
      }
      const { data: childRows, error: childFetchError } = await admin
        .from("bookings")
        .select("id")
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(completed,no_show,cancelled)");
      if (childFetchError) throw childFetchError;
      if (childRows && childRows.length > 0) {
        const childIds = childRows.map((row: { id: string }) => row.id);
        const { error: childUpdateError } = await admin
          .from("bookings")
          .update(childUpdate)
          .in("id", childIds)
          .eq("provider_id", providerId);
        if (childUpdateError) throw childUpdateError;
        if ("scheduled_at" in sanitized && typeof sanitized.scheduled_at === "string") {
          await Promise.all(
            childIds.map((bookingId: string) =>
              rescheduleBookingServicesSequential(
                admin,
                bookingId,
                sanitized.scheduled_at as string,
                {
                  ...(typeof sanitized.staff_id === "string"
                    ? { staffId: sanitized.staff_id }
                    : {}),
                }
              )
            )
          );

          // §Group-booking-qa 2026-05: send reschedule notifications to
          // customers on every child booking whose time just changed. Best-
          // effort — a notification failure must never block the PATCH response.
          if (originalScheduledAt) {
            try {
              const { sendRescheduleNotification } = await import(
                "@/lib/bookings/notifications"
              );
              const oldDt = new Date(originalScheduledAt);
              const newDt = new Date(sanitized.scheduled_at as string);
              await Promise.allSettled(
                childIds.map((bId: string) =>
                  sendRescheduleNotification(bId, oldDt, newDt).catch(
                    (e: unknown) =>
                      console.warn(
                        "[provider group PATCH] reschedule notification failed for booking",
                        bId,
                        e
                      )
                  )
                )
              );
            } catch (notifyErr) {
              console.error(
                "[provider group PATCH] reschedule notification dispatch failed:",
                notifyErr
              );
            }
          }
        }
      }
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update group booking");
  }
}

/**
 * POST /api/provider/group-bookings/[id]?action=...
 *
 * Handles synthetic group:<id> actions redirected from the merged bookings
 * endpoints. This keeps provider app/web group rows actionable instead of
 * redirecting POST requests to a route with no POST handler.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const action = new URL(request.url).searchParams.get("action") ?? "";
    const body = await request.json().catch(() => ({}));
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error: groupError } = await admin
      .from("group_bookings")
      .select("id, status, total_price")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) throw groupError;
    if (!groupBooking) return notFoundResponse("Group booking not found");

    const now = new Date().toISOString();

    if (action === "start_service") {
      // §Group-booking-audit 2026-05: child booking updates are best-effort
      // so groups created via the web portal (inline participants without
      // booking_id) can still transition to "started". Without this guard,
      // bookings table errors blocked the group from ever changing state.
      const { error: bookingsError } = await admin
        .from("bookings")
        .update({
          status: "in_progress",
          current_stage: "service_started",
          updated_at: now,
        })
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .in("status", ["confirmed", "waiting", "checked_in"]);
      if (bookingsError) {
        console.warn(
          "[provider group start_service] child booking update failed (continuing):",
          bookingsError
        );
      }
      const { data, error: groupUpdateError } = await admin
        .from("group_bookings")
        .update({ status: "started", updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (groupUpdateError) throw groupUpdateError;
      return successResponse({ group_booking: data, message: "Group service started" });
    }

    if (action === "complete_service") {
      // Include all non-terminal statuses so providers who skip individual
      // check-ins (or call complete_service before start_service) don't leave
      // child bookings stranded in confirmed/checked_in/in_progress forever.
      const { error: bookingsError } = await admin
        .from("bookings")
        .update({
          status: "completed",
          current_stage: "service_completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .in("status", ["in_progress", "confirmed", "waiting", "checked_in"]);
      if (bookingsError) {
        console.warn(
          "[provider group complete_service] child booking update failed (continuing):",
          bookingsError
        );
      }
      const { data, error } = await admin
        .from("group_bookings")
        .update({ status: "completed", updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (error) throw error;
      return successResponse({ group_booking: data, message: "Group service completed" });
    }

    if (action === "mark_paid") {
      const permissionCheck = await requirePermission("process_payments", request);
      if (!permissionCheck.authorized) {
        return permissionCheck.response!;
      }

      const paymentMethod = body.payment_method === "mobile" ? "other" : body.payment_method;
      if (
        paymentMethod === "paystack_terminal" ||
        body.payment_provider === "paystack_terminal" ||
        body.payment_provider === "paystack_virtual_terminal"
      ) {
        return errorResponse(
          "Paystack Terminal group payments must be verified by Paystack and allocated from the terminal payment inbox.",
          "PAYSTACK_TERMINAL_ALLOCATION_REQUIRED",
          400
        );
      }
      if (!["cash", "card", "bank_transfer", "other", "yoco"].includes(paymentMethod)) {
        return errorResponse(
          "Valid payment_method is required (cash, card, bank_transfer, other, yoco)",
          "VALIDATION_ERROR",
          400
        );
      }

      const tenantId = await resolveTenantIdWithZaFallback(request);
      const { data: bookings, error: bookingsError } = await admin
        .from("bookings")
        .select(
          "id, tenant_id, location_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status, additional_charges(amount,status)"
        )
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(cancelled,no_show)");
      if (bookingsError) throw bookingsError;

      for (const booking of bookings ?? []) {
        const bookingMarketMismatch = bookingTenantMismatchResponse(
          tenantId,
          (booking as { tenant_id?: string | null }).tenant_id
        );
        if (bookingMarketMismatch) return bookingMarketMismatch;

        const branchAccess = await assertProviderUserCanAccessBookingBranch(
          admin,
          permissionCheck.user.id,
          permissionCheck.user.role,
          providerId,
          (booking as { location_id?: string | null }).location_id ?? null
        );
        if (branchAccess.allowed === false) {
          return errorResponse(branchAccess.message, "FORBIDDEN", 403);
        }
      }

      const paymentProvider =
        paymentMethod === "cash" ? "cash" : paymentMethod === "yoco" ? "yoco" : "other";
      const rows = (bookings ?? [])
        .map((booking: any) => {
          const unpaidAdditionalCharges = Array.isArray(booking.additional_charges)
            ? booking.additional_charges
                .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
                .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
            : 0;
          const remaining = computeWalletGiftCoverageOutstanding({
            totalAmount: Number(booking.total_amount ?? 0),
            totalPaid: Number(booking.total_paid ?? 0),
            totalRefunded: Number(booking.total_refunded ?? 0),
            walletAmount: Number(booking.wallet_amount ?? 0),
            giftCardAmount: Number(booking.gift_card_amount ?? 0),
            unpaidAdditionalCharges,
          });
          if (remaining <= 0) return null;
          return {
            booking_id: booking.id,
            tenant_id: booking.tenant_id ?? null,
            amount: remaining,
            payment_method: paymentMethod,
            payment_provider: paymentProvider,
            status: "completed",
            notes: body.notes || `Group payment received via ${paymentMethod}`,
            created_by: user.id,
          };
        })
        .filter(Boolean);

      if (rows.length === 0) {
        // §Group-booking-audit 2026-05: distinguish three states the previous
        // single ALREADY_PAID message hid:
        //   • No child bookings at all (web inline participants, or mobile
        //     flow that rolled back before linking) → NOT_INVOICED. Tell the
        //     provider to add a participant booking first.
        //   • Child bookings exist but each one is already settled → keep
        //     ALREADY_PAID so the receipt UI shows the historical paid state.
        const hasChildBookings = (bookings ?? []).length > 0;
        if (!hasChildBookings) {
          // Check for participants without booking_id so the error message is
          // specific: portal/waitlist-style groups need a participant booking
          // to invoice before payment can be recorded.
          const { count: participantCount } = await admin
            .from("booking_participants")
            .select("id", { count: "exact", head: true })
            .eq("group_booking_id", id);
          if ((participantCount ?? 0) > 0) {
            return errorResponse(
              "Participants are not invoiced yet. Create a participant booking before marking the session paid.",
              "NOT_INVOICED",
              400
            );
          }
          return errorResponse(
            "Add at least one participant before recording payment.",
            "NOT_INVOICED",
            400
          );
        }
        return errorResponse("Group booking is already fully paid", "ALREADY_PAID", 400);
      }

      const { data: payments, error: paymentsError } = await admin
        .from("booking_payments")
        .insert(rows)
        .select();
      if (paymentsError) throw paymentsError;

      const paidAt = new Date().toISOString();
      await admin
        .from("group_bookings")
        .update({ updated_at: paidAt })
        .eq("id", id)
        .eq("provider_id", providerId);

      return successResponse({ payments, message: "Group booking payments recorded" });
    }

    if (action === "refund") {
      return errorResponse(
        "Group booking refunds must be issued from the individual participant bookings so wallet credits and audit trails stay accurate.",
        "GROUP_REFUND_UNSUPPORTED",
        400
      );
    }

    return errorResponse("Unsupported group booking action", "UNSUPPORTED_ACTION", 400);
  } catch (error) {
    return handleApiError(error, "Failed to apply group booking action");
  }
}

/**
 * DELETE /api/provider/group-bookings/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const cancellationReasonFromClient =
      typeof body?.cancellation_reason === "string" && body.cancellation_reason.trim().length > 0
        ? body.cancellation_reason.trim()
        : null;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error: groupError } = await admin
      .from("group_bookings")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!groupBooking) {
      return notFoundResponse("Group booking not found");
    }

    // Fetch booking IDs before cancelling so we can trigger waitlist.
    // Use the admin client for the write path: provider staff can manage
    // groups through this API, while legacy RLS only allowed provider owners.
    const { data: groupBookings, error: bookingFetchError } = await admin
      .from("bookings")
      .select("id")
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)");

    if (bookingFetchError) {
      throw bookingFetchError;
    }

    const childCancellationReason =
      cancellationReasonFromClient ?? "Group booking cancelled by provider";

    // Cancel all associated bookings first
    const now = new Date().toISOString();
    const { error: bookingsCancelError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: childCancellationReason,
        updated_at: now,
      })
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)");

    if (bookingsCancelError) {
      throw bookingsCancelError;
    }

    // Then cancel the group booking
    const { error } = await admin
      .from("group_bookings")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    // Notify waitlist for freed slots
    if (groupBookings?.length) {
      try {
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await Promise.allSettled(
          groupBookings.map((b: { id: string }) => matchWaitlistOnCancellation(supabase, b.id))
        );
      } catch (waitlistErr) {
        console.error("[provider group cancel] waitlist matching failed:", waitlistErr);
      }

      // Send cancellation notifications to the customer on each child booking.
      // Best-effort: a notification failure must never block the cancel response.
      try {
        const { sendCancellationNotification } = await import("@/lib/bookings/notifications");
        await Promise.allSettled(
          groupBookings.map((b: { id: string }) =>
            sendCancellationNotification(b.id, { cancelledBy: "provider" }).catch((e: unknown) =>
              console.warn("[provider group cancel] notification failed for booking", b.id, e)
            )
          )
        );
      } catch (notifyErr) {
        console.error("[provider group cancel] notification dispatch failed:", notifyErr);
      }
    }

    return successResponse({ success: true, message: "Group booking cancelled" });
  } catch (error) {
    return handleApiError(error, "Failed to delete group booking");
  }
}
