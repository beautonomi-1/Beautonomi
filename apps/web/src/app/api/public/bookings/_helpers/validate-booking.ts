import { SupabaseClient } from "@supabase/supabase-js";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ensureProviderFreeSubscriptionRow } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatPublicCustomerBookingLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import type { BookingDraft } from "@/types/beautonomi";
import {
  aggregatePackageEntitlements,
  bookedOfferingCounts,
  bookedProductCounts,
  computeCatalogPackageServiceDiscount,
  entitlementMismatch,
  percentOf,
  sumMoney,
} from "@beautonomi/utils";
import { sumChainedBlockedMinutes } from "@/lib/booking-slot-math/blocked-window-minutes";
import { applyPublicBookingHoldSnapshotToDraft } from "@/lib/bookings/apply-hold-snapshot-to-draft";
import { formatInTimeZone } from "date-fns-tz";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { loadEffectiveStaffShifts } from "@/lib/availability/load-constraints";
import { segmentFitsAnyShift } from "@/lib/availability/shift-fit";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ValidatedBookingData {
  customerId: string;
  provider: ProviderRow;
  currency: string;

  /** Maps offering id → offering row */
  offeringById: Map<string, any>;
  /** Maps addon id → addon row */
  addonById: Map<string, any>;
  /** Maps product id → product row */
  productById: Map<string, any>;

  servicesSubtotal: number;
  addonsSubtotal: number;
  productsSubtotal: number;
  travelFee: number;
  packageDiscountAmount: number;
  promoDiscountAmount: number;
  promotionId: string | null;
  promoCode: string;
  /** Sum of line items only (services after package + add-ons + products). Excludes travel, promo, membership, loyalty. */
  subtotal: number;

  membershipPlanId: string | null;
  membershipId: string | null;
  membershipDiscountAmount: number;
  subtotalAfterMembership: number;
  commissionBase: number;

  tipAmount: number;
  taxRate: number;
  /** true = tax is already included in service prices (extract, don't add) */
  taxIncluded: boolean;
  taxAmount: number;

  serviceFeeAmount: number;
  serviceFeePercentage: number;
  serviceFeeConfigId: string | null;
  /** Whether the Platform Fee should be displayed to the customer on the booking confirmation screen */
  showServiceFeeToCustomer: boolean;

  totalAmount: number;
  loyaltyPointsEarned: number;
  loyaltyDiscountAmount: number;
  loyaltyPointsRedeemed: number;

  /** Appointment status determined by provider settings */
  appointmentStatus: string;

  /** Conflict-check results */
  allowOverride: boolean;
  conflictResult: ConflictResult | null;

  /** Resource IDs required across all services */
  allResourceIds: string[];

  /** Pre-built booking_services rows + total duration */
  bookingServicesData: any[];
  totalDuration: number;
  bookingEnd: Date;
  selectedDatetime: Date;

  /** Group booking data */
  isGroupBooking: boolean;
  groupParticipants: any[] | null;
}

export interface ProviderRow {
  id: string;
  tenant_id?: string | null;
  currency: string | null;
  requires_deposit: boolean;
  deposit_percentage: number | null;
  status: string;
  tax_rate_percent: number | null;
  tips_enabled: boolean | null;
  customer_fee_config_id: string | null;
  minimum_mobile_booking_amount: number | null;
}

export interface ConflictResult {
  hasConflict?: boolean;
  conflictingBookings?: Array<{ booking_id: string }>;
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate and enrich a booking draft.
 *
 * Returns either a `ValidatedBookingData` object (on success)
 * or a NextResponse error (if any check fails). The caller should
 * check `response instanceof Response` to know which it got.
 */
export async function validateBooking(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  draft: BookingDraft,
  validatedDraft: PublicBookingValidatedBody,
  userId: string,
  /** When set (public web bookings), provider must belong to this tenant */
  marketTenantId?: string,
  /** e.g. on-demand accept creates an immediate booking — skip provider min-notice lead time */
  options?: { skipMinNoticeCheck?: boolean }
): Promise<ValidatedBookingData | Response> {
  // ── Auth / user row ──────────────────────────────────────────────────────
  const { data: userRow, error: userRowError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (userRowError || !userRow) {
    return handleApiError(
      new Error("User profile not found"),
      "User profile not found",
      "NOT_FOUND",
      404
    );
  }

  const customerId = userRow.id as string;

  // ── Location validation ──────────────────────────────────────────────────
  if (draft.location_type === "at_salon" && !draft.location_id) {
    return handleApiError(
      new Error("location_id is required for at_salon bookings"),
      "location_id is required for at_salon bookings",
      "VALIDATION_ERROR",
      400
    );
  }
  if (draft.location_type === "at_salon" && draft.location_id) {
    const { data: loc } = await supabase
      .from("provider_locations")
      .select("id, location_type")
      .eq("id", draft.location_id)
      .eq("provider_id", draft.provider_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!loc) {
      return handleApiError(
        new Error("Selected location is not available"),
        "Selected location is not available",
        "VALIDATION_ERROR",
        400
      );
    }
    if ((loc as any).location_type === "base") {
      return handleApiError(
        new Error("This provider does not accept in-studio bookings at this location"),
        "This location is for distance reference only; please book at home.",
        "VALIDATION_ERROR",
        400
      );
    }
  }
  if (draft.location_type === "at_home" && !draft.address) {
    return handleApiError(
      new Error("address is required for at_home bookings"),
      "address is required for at_home bookings",
      "VALIDATION_ERROR",
      400
    );
  }

  // ── Provider ─────────────────────────────────────────────────────────────
  let providerQuery = supabase
    .from("providers")
    .select(
      "id, tenant_id, currency, requires_deposit, deposit_percentage, status, tax_rate_percent, tips_enabled, customer_fee_config_id, minimum_mobile_booking_amount"
    )
    .eq("id", draft.provider_id);
  if (marketTenantId) {
    providerQuery = providerQuery.eq("tenant_id", marketTenantId);
  }
  const { data: provider, error: providerError } = await providerQuery.single();

  if (providerError || !provider) {
    return handleApiError(new Error("Provider not found"), "Provider not found", "NOT_FOUND", 404);
  }

  if (provider.status !== "active") {
    return handleApiError(
      new Error("Provider is not available"),
      "Provider is not available",
      "PROVIDER_INACTIVE",
      400
    );
  }

  /**
   * Hold snapshot (authoritative when `hold_id` is present for non-group bookings).
   *
   * The `booking_holds` row is the source of truth for `selected_datetime`, core
   * `services` (offering_id + staff_id as resolved when the hold was created),
   * and salon `location_type` / `location_id`. The client may still send addons,
   * products, payment fields, notes, and (for at_home) a refined address — but
   * must not drift the slot time or staff assignment. Previously the server
   * trusted `draft.services` + `pickFirstStaffForNullStaffLines` without
   * `preferred_staff_ids`, re-picking a different any-staff member than the hold
   * snapshot → false 409 CONFLICT while GET hold still showed active.
   */
  const isGroupBookingFlow =
    Boolean(validatedDraft.is_group_booking) &&
    Array.isArray(validatedDraft.group_participants) &&
    (validatedDraft.group_participants as unknown[]).length > 0;

  /** End time reserved by the hold row — used for advisory lock + booking end parity */
  let holdReservedEndAt: Date | null = null;
  /** From hold.metadata — used only if snapshot lines still have null staff (legacy edge). */
  let holdPreferredStaffIdsForPick: string[] | null = null;

  if (validatedDraft.hold_id) {
    const { data: holdRow } = await supabaseAdmin
      .from("booking_holds")
      .select(
        "end_at, hold_status, provider_id, expires_at, start_at, booking_services_snapshot, location_type, location_id, metadata"
      )
      .eq("id", validatedDraft.hold_id)
      .maybeSingle();

    const holdExpired =
      holdRow &&
      holdRow.expires_at &&
      new Date(holdRow.expires_at as string).getTime() < Date.now();
    const holdUsable =
      holdRow &&
      (holdRow.hold_status === "active" || holdRow.hold_status === "consuming") &&
      !holdExpired;

    if (!holdUsable) {
      console.warn("[validate-booking] hold rejected", {
        holdId: validatedDraft.hold_id,
        found: !!holdRow,
        status: holdRow?.hold_status ?? "missing",
        expired: holdExpired,
        expiresAt: holdRow?.expires_at ?? null,
      });
      return handleApiError(
        new Error("Booking hold is no longer valid"),
        "Your hold has expired or was already used. Please select a new time.",
        "HOLD_INVALID",
        410
      );
    }

    if (holdRow!.provider_id !== draft.provider_id) {
      return handleApiError(
        new Error("Hold does not match provider"),
        "This booking session is no longer valid. Please start again.",
        "VALIDATION_ERROR",
        400
      );
    }

    holdReservedEndAt = new Date(holdRow!.end_at as string);

    if (!isGroupBookingFlow) {
      try {
        const { preferredStaffIds } = applyPublicBookingHoldSnapshotToDraft(draft, {
          start_at: holdRow!.start_at as string,
          booking_services_snapshot: holdRow!.booking_services_snapshot,
          location_type: holdRow!.location_type as string | null,
          location_id: holdRow!.location_id as string | null,
          metadata: holdRow!.metadata,
        });
        holdPreferredStaffIdsForPick = preferredStaffIds;
      } catch {
        return handleApiError(
          new Error("Hold has no services"),
          "Your hold is invalid. Please select a new time.",
          "HOLD_INVALID",
          410
        );
      }
    }
  }

  const tenantIdForCurrency = provider.tenant_id || marketTenantId || null;
  const tenantRegionConfig = tenantIdForCurrency
    ? await getTenantRegionConfig(tenantIdForCurrency)
    : null;

  // Ensure an explicit free subscription row when missing so limit RPCs resolve a plan (local/stale DBs).
  await ensureProviderFreeSubscriptionRow(
    supabaseAdmin,
    provider.id,
    provider.tenant_id ?? marketTenantId ?? null
  );

  // ── Subscription limit ───────────────────────────────────────────────────
  const bookingLimitCheck = await checkBookingLimit(provider.id, supabaseAdmin);
  if (!bookingLimitCheck.canProceed) {
    const publicMessage = formatPublicCustomerBookingLimitMessage(bookingLimitCheck);
    console.error("[validateBooking] booking limit denied for provider", provider.id, {
      internalReason: bookingLimitCheck.reason,
      planName: bookingLimitCheck.planName,
      currentCount: bookingLimitCheck.currentCount,
      limitValue: bookingLimitCheck.limitValue,
    });
    return handleApiError(
      new Error(`Booking limit: ${bookingLimitCheck.reason}`),
      publicMessage,
      "SUBSCRIPTION_LIMIT_EXCEEDED",
      403
    );
  }

  // ── Online-booking windows from provider_online_booking_settings ─────────
  // §Release-audit 2026-04: also enforce `max_advance_days` as a ceiling —
  // previously only `min_notice_minutes` was checked server-side at commit
  // time, so a buggy / compromised client could submit a slot N months
  // out even when the provider caps advance bookings at e.g. 30 days.
  // Applies to scheduled online bookings (at_salon and at_home). Not
  // separate per location type in DB today.
  if (!options?.skipMinNoticeCheck) {
    const { data: obSettings } = await supabaseAdmin
      .from("provider_online_booking_settings")
      .select("min_notice_minutes, max_advance_days")
      .eq("provider_id", draft.provider_id)
      .maybeSingle();
    const rawNotice = obSettings?.min_notice_minutes;
    const minNotice =
      typeof rawNotice === "number"
        ? rawNotice
        : typeof rawNotice === "string"
          ? parseInt(rawNotice, 10)
          : 60;
    const effectiveMinNotice = Number.isFinite(minNotice) && minNotice >= 0 ? minNotice : 60;

    const rawAdvance = (obSettings as { max_advance_days?: number | string | null } | null)
      ?.max_advance_days;
    const maxAdvance =
      typeof rawAdvance === "number"
        ? rawAdvance
        : typeof rawAdvance === "string"
          ? parseInt(rawAdvance, 10)
          : null;
    const effectiveMaxAdvance =
      typeof maxAdvance === "number" && Number.isFinite(maxAdvance) && maxAdvance >= 1
        ? Math.floor(maxAdvance)
        : null;

    const selected = new Date(draft.selected_datetime);
    if (!Number.isFinite(selected.getTime())) {
      return handleApiError(
        new Error("Invalid selected_datetime"),
        "Invalid appointment time.",
        "VALIDATION_ERROR",
        400
      );
    }

    if (effectiveMinNotice > 0) {
      const cutoffMs = Date.now() + effectiveMinNotice * 60 * 1000;
      if (selected.getTime() < cutoffMs) {
        return handleApiError(
          new Error("Minimum notice not met for booking time"),
          `This provider requires at least ${effectiveMinNotice} minutes' notice. Please choose a later time.`,
          "MIN_NOTICE_NOT_MET",
          400
        );
      }
    }

    if (effectiveMaxAdvance != null) {
      const ceilingMs = Date.now() + effectiveMaxAdvance * 24 * 60 * 60 * 1000;
      if (selected.getTime() > ceilingMs) {
        return handleApiError(
          new Error("Selected slot exceeds provider's max advance booking window"),
          `This provider only accepts online bookings up to ${effectiveMaxAdvance} days in advance. Please choose a closer date.`,
          "MAX_ADVANCE_EXCEEDED",
          400
        );
      }
    }
  }

  // ── Group booking flags (must be consistent before we union offering ids) ──
  const isGroupFlag = Boolean(validatedDraft.is_group_booking);
  const participantsArr = validatedDraft.group_participants;
  const hasParticipants = Array.isArray(participantsArr) && participantsArr.length > 0;
  if (isGroupFlag && !hasParticipants) {
    return handleApiError(
      new Error("Group booking requires participants"),
      "Add at least one guest to book as a group.",
      "GROUP_PARTICIPANTS_REQUIRED",
      400
    );
  }
  if (hasParticipants && !isGroupFlag) {
    return handleApiError(
      new Error("group_participants without is_group_booking"),
      "Enable group booking when adding group participants.",
      "VALIDATION_ERROR",
      400
    );
  }

  // ── Offerings ────────────────────────────────────────────────────────────
  let offeringIds = draft.services.map((s) => s.offering_id);
  const isGroupBookingDraft = isGroupFlag && hasParticipants;
  if (isGroupBookingDraft) {
    const groupIds = (validatedDraft.group_participants as any[]).flatMap(
      (p: any) => p.service_ids ?? p.serviceIds ?? []
    );
    offeringIds = [...new Set([...offeringIds, ...groupIds])];
  }
  offeringIds = offeringIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (offeringIds.length === 0) {
    return errorResponse("Please select at least one service.", "VALIDATION_ERROR", 400);
  }
  const { data: offerings, error: offeringsError } = await supabase
    .from("offerings")
    .select(
      "id, provider_id, title, duration_minutes, buffer_minutes, price, currency, supports_at_home, at_home_price_adjustment, is_active, online_booking_enabled, service_type, master_service_id"
    )
    .in("id", offeringIds);

  if (offeringsError) {
    return handleApiError(
      offeringsError,
      "We couldn't validate the selected services. Please try again.",
      "BOOKING_VALIDATION_FAILED",
      503,
    );
  }

  const offeringById = new Map<string, any>();
  for (const o of offerings || []) offeringById.set(o.id, o);

  for (const s of draft.services) {
    const off = offeringById.get(s.offering_id);
    if (!off || off.provider_id !== draft.provider_id || !off.is_active) {
      return handleApiError(
        new Error("Invalid service selection"),
        "Invalid service selection",
        "VALIDATION_ERROR",
        400
      );
    }
    // §Release-audit 2026-04: the customer-facing services list
    // (`/api/public/providers/[slug]/services`) already filters
    // `online_booking_enabled = true`, but validate-booking previously
    // ignored the flag. A service id that leaks (cache, direct API
    // call, deep link) could bypass the provider's "offline booking
    // only" preference. Enforce it here so the commit path matches
    // what the discovery surface is willing to expose.
    if (off.online_booking_enabled === false) {
      return handleApiError(
        new Error("Service is not available for online booking"),
        "This service can only be booked by contacting the provider directly.",
        "ONLINE_BOOKING_DISABLED",
        400
      );
    }
    // §Release-audit 2026-04: addons must NOT be submitted as main service
    // lines — they go through `draft.addons` so addon-specific scoping
    // (applicable_service_ids, addon_locations) is enforced. Variants are
    // legitimate bookable services in their own right (own price/duration
    // row in `offerings` with `parent_service_id` set) so we allow them.
    if (off.service_type === "addon") {
      return handleApiError(
        new Error("Non-service offering submitted as service"),
        "Invalid service selection",
        "VALIDATION_ERROR",
        400
      );
    }
    if (draft.location_type === "at_home" && off.supports_at_home === false) {
      return handleApiError(
        new Error("One or more services do not support at-home"),
        "At-home not supported",
        "VALIDATION_ERROR",
        400
      );
    }
  }

  // Validate group participants' offerings (same provider, active)
  if (isGroupBookingDraft) {
    for (const p of validatedDraft.group_participants as any[]) {
      const ids = p.service_ids ?? p.serviceIds ?? [];
      for (const id of ids) {
        const off = offeringById.get(id);
        if (!off || off.provider_id !== draft.provider_id || !off.is_active) {
          return handleApiError(
            new Error("Invalid service selection for group participant"),
            "Invalid service selection",
            "VALIDATION_ERROR",
            400
          );
        }
        if (off.online_booking_enabled === false) {
          return handleApiError(
            new Error("Service is not available for online booking (group participant)"),
            "One of the selected services can only be booked by contacting the provider directly.",
            "ONLINE_BOOKING_DISABLED",
            400
          );
        }
        if (off.service_type === "addon") {
          return handleApiError(
            new Error("Non-service offering submitted for group participant"),
            "Invalid service selection",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }

    // §Final-audit 2026-04 (R3): parity assertion between
    // `group_participants[].service_ids` and `draft.services`.
    // `servicesSubtotal` below sums only `draft.services`, so if a
    // client (mobile, third-party) sends participant-only lines without
    // merging them into `services`, the server would silently undercharge
    // and promos would validate against the wrong total. Require the
    // client to flatten participant offerings into `services` first.
    const participantOfferingIds = (validatedDraft.group_participants as any[])
      .flatMap((p: any) => p.service_ids ?? p.serviceIds ?? [])
      .filter((id: unknown): id is string => typeof id === "string");
    const draftOfferingCounts = new Map<string, number>();
    for (const s of draft.services) {
      draftOfferingCounts.set(
        s.offering_id,
        (draftOfferingCounts.get(s.offering_id) ?? 0) + 1,
      );
    }
    const participantOfferingCounts = new Map<string, number>();
    for (const id of participantOfferingIds) {
      participantOfferingCounts.set(
        id,
        (participantOfferingCounts.get(id) ?? 0) + 1,
      );
    }
    for (const [offeringId, participantCount] of participantOfferingCounts) {
      const draftCount = draftOfferingCounts.get(offeringId) ?? 0;
      if (draftCount < participantCount) {
        return handleApiError(
          new Error(
            `Group booking line-item mismatch: participant service ${offeringId} count ${participantCount} exceeds draft.services count ${draftCount}`,
          ),
          "Group booking is missing line items. Please reload and try again.",
          "GROUP_LINE_ITEM_MISMATCH",
          400,
        );
      }
    }
  }

  // ── Online group booking policy (server — same DB fields as group-booking-settings API) ──
  if (isGroupBookingDraft) {
    const { evaluateGroupBookingPolicy } = await import("@/lib/public-booking/group-booking-policy");
    const { fetchGroupBookingPolicyFieldsFromDb } = await import("@/lib/public-booking/group-booking-policy-db");
    const policyFields = await fetchGroupBookingPolicyFieldsFromDb(supabaseAdmin, draft.provider_id);
    const participants = validatedDraft.group_participants as Array<{ service_ids?: string[]; serviceIds?: string[] }>;
    const participantOfferingIds = participants.flatMap((p) => p.service_ids ?? p.serviceIds ?? []);

    // Web UI includes "You" (primary) in group_participants; mobile only sends additional guests.
    // Detect whether primary is already in participants by checking if the first participant's
    // services match draft.services (the primary's services).
    const primaryOfferIds = new Set(draft.services.map((s: { offering_id: string }) => s.offering_id));
    const firstPServiceIds = participants[0]?.service_ids ?? (participants[0] as any)?.serviceIds ?? [];
    const primaryInParticipants =
      participants.length > 0 &&
      firstPServiceIds.length > 0 &&
      firstPServiceIds.every((id: string) => primaryOfferIds.has(id));
    const additionalGuestCount = primaryInParticipants
      ? Math.max(0, participants.length - 1)
      : participants.length;

    const gp = evaluateGroupBookingPolicy({
      additionalGuestCount,
      ...policyFields,
      primaryOfferingIds: draft.services.map((s) => s.offering_id),
      participantOfferingIds,
      locationType: draft.location_type,
      locationId: draft.location_id ?? null,
    });
    if (gp.ok === false) {
      return handleApiError(new Error(gp.message), gp.message, gp.code, 400);
    }
  }

  // ── Staff: active on provider + offering_staff eligibility when restricted ──
  {
    const { normalizePublicStaffIdForDatabase } = await import("@beautonomi/utils");
    const dbStaffByLine = new Map<number, string>();
    draft.services.forEach((s, idx) => {
      if (!s.staff_id) return;
      const { dbStaffId } = normalizePublicStaffIdForDatabase(s.staff_id);
      if (dbStaffId) dbStaffByLine.set(idx, dbStaffId);
    });
    const uniqueStaff = [...new Set(dbStaffByLine.values())];
    if (uniqueStaff.length > 0) {
      const { data: psRows } = await supabaseAdmin
        .from("provider_staff")
        .select("id")
        .eq("provider_id", draft.provider_id)
        .eq("is_active", true)
        .in("id", uniqueStaff);
      const activeStaff = new Set((psRows || []).map((r: { id: string }) => r.id));
      for (const id of uniqueStaff) {
        if (!activeStaff.has(id)) {
          return handleApiError(
            new Error("Staff not available for provider"),
            "Selected staff is not available for this provider.",
            "STAFF_INVALID",
            400
          );
        }
      }
    }
    const offeringIdsForStaff = [...new Set(draft.services.map((s) => s.offering_id))];
    const { data: oStaffRows } = await supabaseAdmin
      .from("offering_staff")
      .select("offering_id, staff_id")
      .in("offering_id", offeringIdsForStaff);
    const staffAllowedByOffering = new Map<string, Set<string>>();
    for (const row of oStaffRows || []) {
      const oid = (row as { offering_id: string }).offering_id;
      const sid = (row as { staff_id: string }).staff_id;
      if (!staffAllowedByOffering.has(oid)) staffAllowedByOffering.set(oid, new Set());
      staffAllowedByOffering.get(oid)!.add(sid);
    }
    for (let i = 0; i < draft.services.length; i++) {
      const s = draft.services[i];
      const dbId = dbStaffByLine.get(i);
      if (!dbId) continue;
      const allowed = staffAllowedByOffering.get(s.offering_id);
      if (!allowed || allowed.size === 0) continue;
      if (!allowed.has(dbId)) {
        return handleApiError(
          new Error("Staff not eligible for offering"),
          "Selected staff cannot perform one of the chosen services.",
          "STAFF_OFFERING_MISMATCH",
          400
        );
      }
    }
  }

  // ── Addons ───────────────────────────────────────────────────────────────
  // §Release-audit 2026-04: `service_addons` is a VIEW over `offerings`
  // where `service_type='addon' AND is_active=true` (see migration 081).
  // The customer-visible GET
  // `/api/public/providers/[slug]/services/[serviceId]/addons` queries
  // `offerings` directly and filters `online_booking_enabled=true`,
  // `service_type='addon'`, `is_active=true`, and respects
  // `applicable_service_ids`. Previously validate-booking went through
  // the VIEW with only `is_active` — allowing addons the provider
  // disabled for online booking or that aren't applicable to the chosen
  // services to sneak through at commit. Hit the underlying `offerings`
  // table with the same filter shape as discovery, then verify
  // applicability against the actual services in the draft.
  const addonIds = draft.addons || [];
  const addonById = new Map<string, any>();
  if (addonIds.length > 0) {
    const { data: addons, error: addonsError } = await supabase
      .from("offerings")
      .select(
        "id, provider_id, price, currency, duration_minutes, is_active, online_booking_enabled, service_type, applicable_service_ids, master_service_id"
      )
      .in("id", addonIds);
    if (addonsError) {
      return handleApiError(
        addonsError,
        "We couldn't validate the selected add-ons. Please try again.",
        "BOOKING_VALIDATION_FAILED",
        503,
      );
    }
    for (const a of addons || []) addonById.set(a.id, a);
    for (const id of addonIds) {
      const a = addonById.get(id);
      if (
        !a ||
        a.provider_id !== draft.provider_id ||
        !a.is_active ||
        a.service_type !== "addon"
      ) {
        return handleApiError(
          new Error("Invalid add-on selection"),
          "Invalid add-on selection",
          "VALIDATION_ERROR",
          400
        );
      }
      if (a.online_booking_enabled === false) {
        return handleApiError(
          new Error("Add-on is not available for online booking"),
          "One of the selected add-ons can only be booked by contacting the provider directly.",
          "ONLINE_BOOKING_DISABLED",
          400
        );
      }
      // Applicability: `applicable_service_ids` (nullable) may reference
      // `offerings.id` OR `offerings.master_service_id`. Mirror the OR-clause
      // used in the public addons GET so a scoped addon cannot be
      // attached to a service it wasn't offered for.
      const scope = (a.applicable_service_ids as string[] | null | undefined) ?? null;
      if (scope && scope.length > 0) {
        const selectedServiceIds = new Set<string>();
        for (const s of draft.services) {
          selectedServiceIds.add(s.offering_id);
          const masterId = offeringById.get(s.offering_id)?.master_service_id;
          if (typeof masterId === "string" && masterId.length > 0) {
            selectedServiceIds.add(masterId);
          }
        }
        const matches = scope.some((x) => selectedServiceIds.has(x));
        if (!matches) {
          return handleApiError(
            new Error("Add-on not applicable to selected services"),
            "One of the selected add-ons does not apply to the chosen services.",
            "ADDON_NOT_APPLICABLE",
            400
          );
        }
      }
    }
    // Branch: at_salon with location_id — addon must be available at that location
    if (draft.location_type === "at_salon" && draft.location_id) {
      const { data: addonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds);
      const addonsWithRestriction = new Set((addonLocs ?? []).map((r: any) => r.addon_id));
      const { data: atLocation } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", draft.location_id);
      const addonIdsAtLocation = new Set((atLocation ?? []).map((r: any) => r.addon_id));
      for (const id of addonIds) {
        if (addonsWithRestriction.has(id) && !addonIdsAtLocation.has(id)) {
          return handleApiError(
            new Error("One or more add-ons are not available at the selected location"),
            "Add-on not available at this location",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }
  }

  // ── Products (server-authoritative price + stock — do not trust client unit/total) ──
  const currency = provider.currency || tenantRegionConfig?.defaultCurrency || LAST_RESORT_CURRENCY;
  const products = draft.products ?? [];
  const productById = new Map<string, any>();
  const variantById = new Map<string, any>();
  let productsSubtotal = 0;

  if (products.length > 0) {
    const productIds = products
      .map((p) => p.productId ?? p.product_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (productIds.length !== products.length) {
      return handleApiError(
        new Error("Each product line must include a valid product id"),
        "Each product line must include a valid product id",
        "VALIDATION_ERROR",
        400
      );
    }

    const variantIds = products
      .map((p) => {
        const row = p as { productVariantId?: string | null; product_variant_id?: string | null };
        return row.productVariantId ?? row.product_variant_id ?? null;
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select(
        "id, provider_id, name, retail_price, currency, is_active, retail_sales_enabled, track_stock_quantity, quantity, has_variants"
      )
      .in("id", productIds);

    if (productsError) {
      return handleApiError(
        productsError,
        "We couldn't validate the selected products. Please try again.",
        "BOOKING_VALIDATION_FAILED",
        503,
      );
    }

    for (const p of productRows || []) productById.set(p.id, p);

    if (variantIds.length > 0) {
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("id, product_id, retail_price, quantity")
        .in("id", variantIds);
      if (variantError) {
        return handleApiError(
          variantError,
          "We couldn't validate the selected product options. Please try again.",
          "BOOKING_VALIDATION_FAILED",
          503,
        );
      }
      for (const v of variantRows || []) variantById.set(v.id, v);
    }

    for (const product of products) {
      const pid = product.productId ?? product.product_id;
      const productData = productById.get(pid);
      if (!productData || productData.provider_id !== draft.provider_id || !productData.is_active) {
        return handleApiError(
          new Error("Invalid product selection"),
          "Invalid product selection",
          "VALIDATION_ERROR",
          400
        );
      }
      if (productData.retail_sales_enabled === false) {
        return handleApiError(
          new Error(`Product is not available for purchase: ${productData.name}`),
          "Product is not available for purchase",
          "VALIDATION_ERROR",
          400
        );
      }

      const row = product as { productVariantId?: string | null; product_variant_id?: string | null };
      const variantId = row.productVariantId ?? row.product_variant_id ?? null;

      const qtyRaw = Number(product.quantity);
      const qty = Math.max(1, Math.floor(qtyRaw));
      if (!Number.isFinite(qtyRaw) || qty < 1 || qty > 10_000) {
        return handleApiError(new Error("Invalid quantity"), "Invalid quantity", "VALIDATION_ERROR", 400);
      }

      let unitPrice: number;

      if (productData.has_variants === true) {
        if (!variantId) {
          return handleApiError(
            new Error(`Select a variant for ${productData.name}`),
            "Variant is required for this product",
            "VALIDATION_ERROR",
            400
          );
        }
        const vrow = variantById.get(variantId);
        if (!vrow || vrow.product_id !== pid) {
          return handleApiError(
            new Error("Invalid product variant"),
            "Invalid product variant",
            "VALIDATION_ERROR",
            400
          );
        }
        // §Release-audit 2026-04: variant pricing must not silently fall
        // through to zero when a provider left `product_variants.retail_price`
        // at the table default (0 — the column is NOT NULL DEFAULT 0).
        // Fall back to the parent product's retail_price before treating
        // the line as free, so a provider who only set the parent price
        // but used variant rows for size/colour labels still charges
        // correctly. Customer PDP reads the same variant row, so UI /
        // server stay in sync via the same fallback.
        const rawVariantPrice = Number(vrow.retail_price);
        if (Number.isFinite(rawVariantPrice) && rawVariantPrice > 0) {
          unitPrice = rawVariantPrice;
        } else {
          unitPrice = Number(productData.retail_price ?? 0);
        }
        // §Release-audit 2026-04: stock check must honour the parent
        // product's `track_stock_quantity` flag, exactly like the
        // non-variant branch below. Previously variant products were
        // always gated by `vrow.quantity`, so a provider who
        // intentionally leaves stock tracking OFF (print-on-demand,
        // dropshipping, digital goods, configurable services) had
        // their variant orders rejected with "Only 0 units available"
        // once the default zero was left in. Now both branches agree.
        if (productData.track_stock_quantity) {
          const vQty = Number(vrow.quantity ?? 0);
          if (qty > vQty) {
            return handleApiError(
              new Error(`Insufficient stock for ${productData.name}`),
              `Only ${vQty} units available`,
              "INSUFFICIENT_STOCK",
              400
            );
          }
        }
        row.productVariantId = variantId;
      } else {
        if (variantId) {
          return handleApiError(
            new Error("This product does not use variants"),
            "Invalid product variant for this product",
            "VALIDATION_ERROR",
            400
          );
        }
        unitPrice = Number(productData.retail_price ?? 0);
        if (productData.track_stock_quantity && qty > (productData.quantity || 0)) {
          return handleApiError(
            new Error(`Insufficient stock for ${productData.name}`),
            `Only ${productData.quantity || 0} units available for ${productData.name}`,
            "INSUFFICIENT_STOCK",
            400
          );
        }
        row.productVariantId = null;
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return handleApiError(new Error("Invalid product price"), "Invalid product price", "VALIDATION_ERROR", 400);
      }

      const lineTotal = unitPrice * qty;
      (product as { unitPrice?: number; totalPrice?: number }).unitPrice = unitPrice;
      (product as { unitPrice?: number; totalPrice?: number }).totalPrice = lineTotal;
      productsSubtotal += lineTotal;
    }
  }

  // ── Price calculations ───────────────────────────────────────────────────
  const servicesSubtotal = draft.services.reduce((sum, s) => {
    const off = offeringById.get(s.offering_id);
    const base = Number(off.price || 0);
    const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
    return sum + base + homeAdj;
  }, 0);

  const addonsSubtotal = addonIds.reduce(
    (sum, id) => sum + Number(addonById.get(id)?.price || 0),
    0
  );

  // §Release-audit 2026-04: the server must not trust the client-submitted
  // travel_fee when a booking_hold exists — the hold already carries the
  // server-recomputed fee (see calculateTravelFeeForHold). Previously a
  // malicious / stale client could submit travel_fee=0 and skip the charge.
  // When no hold is present we fall back to the draft value; the holdless
  // path (direct booking creation, mobile, on-demand) stays unchanged so
  // existing journeys keep working.
  let travelFee = draft.location_type === "at_home" ? (draft.travel_fee || 0) : 0;
  if (draft.location_type === "at_home" && validatedDraft.hold_id) {
    try {
      const { data: holdMetaRow } = await supabaseAdmin
        .from("booking_holds")
        .select("metadata")
        .eq("id", validatedDraft.hold_id)
        .maybeSingle();
      const holdMeta =
        holdMetaRow && typeof holdMetaRow === "object"
          ? (holdMetaRow as { metadata?: unknown }).metadata
          : null;
      if (holdMeta && typeof holdMeta === "object" && !Array.isArray(holdMeta)) {
        const holdTravelFeeRaw = (holdMeta as { travel_fee?: unknown }).travel_fee;
        const holdTravelFee =
          typeof holdTravelFeeRaw === "number"
            ? holdTravelFeeRaw
            : typeof holdTravelFeeRaw === "string"
              ? Number(holdTravelFeeRaw)
              : null;
        if (holdTravelFee != null && Number.isFinite(holdTravelFee) && holdTravelFee >= 0) {
          travelFee = holdTravelFee;
        }
      }
    } catch (err) {
      console.error("[validate-booking] failed to read hold travel_fee override:", err);
    }
  }

  if (validatedDraft.customer_package_entitlement_id && !draft.package_id) {
    return handleApiError(
      new Error("package_id required with entitlement"),
      "Select a package when redeeming a package credit.",
      "VALIDATION_ERROR",
      400
    );
  }

  // ── Package discount (catalog `service_packages`) ───────────────────────
  // `package_id` applies catalog pricing/entitlement via `service_package_items`.
  // Optional `customer_package_entitlement_id` redeems one session from `customer_package_entitlements`
  // (validated above when present; decremented after successful insert via RPC).
  let packageDiscountAmount = 0;
  if (draft.package_id) {
    const { data: pkg, error: pkgError } = await supabase
      .from("service_packages")
      .select("id, provider_id, price, currency, discount_percentage, is_active")
      .eq("id", draft.package_id)
      .single();
    if (pkgError || !pkg || pkg.provider_id !== draft.provider_id) {
      return handleApiError(
        new Error("Invalid package selection"),
        "Invalid package selection",
        "VALIDATION_ERROR",
        400
      );
    }
    if ((pkg as { is_active?: boolean }).is_active === false) {
      return handleApiError(
        new Error("Package is not active"),
        "This package is no longer available for booking.",
        "PACKAGE_INACTIVE",
        400
      );
    }

    if (validatedDraft.customer_package_entitlement_id) {
      const eid = validatedDraft.customer_package_entitlement_id;
      const { data: ent, error: entErr } = await supabaseAdmin
        .from("customer_package_entitlements")
        .select("id, customer_id, provider_id, package_id, sessions_remaining, valid_from, valid_until")
        .eq("id", eid)
        .maybeSingle();
      if (entErr || !ent) {
        return handleApiError(
          new Error("Invalid package entitlement"),
          "This package credit is not valid.",
          "PACKAGE_ENTITLEMENT_INVALID",
          400
        );
      }
      const row = ent as {
        customer_id: string;
        provider_id: string;
        package_id: string;
        sessions_remaining: number;
        valid_from?: string | null;
        valid_until?: string | null;
      };
      if (
        row.customer_id !== customerId ||
        row.provider_id !== draft.provider_id ||
        row.package_id !== draft.package_id
      ) {
        return handleApiError(
          new Error("Package entitlement mismatch"),
          "This package credit does not apply to this booking.",
          "PACKAGE_ENTITLEMENT_MISMATCH",
          400
        );
      }
      if (Number(row.sessions_remaining) < 1) {
        return handleApiError(
          new Error("Package entitlement exhausted"),
          "You have no remaining sessions for this package.",
          "PACKAGE_ENTITLEMENT_EXHAUSTED",
          400
        );
      }
      const now = new Date();
      if (row.valid_from && new Date(row.valid_from) > now) {
        return handleApiError(
          new Error("Package entitlement not yet valid"),
          "This package is not active yet.",
          "PACKAGE_ENTITLEMENT_NOT_YET_VALID",
          400
        );
      }
      if (row.valid_until && new Date(row.valid_until) < now) {
        return handleApiError(
          new Error("Package entitlement expired"),
          "This package has expired.",
          "PACKAGE_ENTITLEMENT_EXPIRED",
          400
        );
      }
    }

    // Branch: at_salon with location_id — package must be available at that location
    if (draft.location_type === "at_salon" && draft.location_id) {
      const { data: allPkgLocs } = await supabase
        .from("package_locations")
        .select("location_id")
        .eq("package_id", draft.package_id);
      if (allPkgLocs && allPkgLocs.length > 0) {
        const allowedLocationIds = new Set(allPkgLocs.map((r: any) => r.location_id));
        if (!allowedLocationIds.has(draft.location_id)) {
          return handleApiError(
            new Error("This package is not available at the selected location"),
            "Package not available at this location",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }

    // Package entitlement: every booked offering (primary + group participants) must be covered by
    // service_package_items quantities. Prevents applying a catalog package discount to arbitrary services.
    const { data: pkgItems, error: pkgItemsError } = await supabase
      .from("service_package_items")
      .select("offering_id, product_id, product_variant_id, quantity")
      .eq("package_id", draft.package_id);

    if (pkgItemsError) {
      return handleApiError(
        pkgItemsError,
        "We couldn't validate the selected package. Please try again.",
        "BOOKING_VALIDATION_FAILED",
        503,
      );
    }

    const { entitlementByOffering, entitlementByProduct } = aggregatePackageEntitlements(
      pkgItems as Array<{
        offering_id?: string | null;
        product_id?: string | null;
        product_variant_id?: string | null;
        quantity?: unknown;
      }>
    );

    const hasPkgOfferingLines = entitlementByOffering.size > 0;
    const hasPkgProductLines = entitlementByProduct.size > 0;

    // Package defines only retail lines — cannot apply catalog package to arbitrary services.
    if ((pkgItems?.length ?? 0) > 0 && !hasPkgOfferingLines && draft.services.length > 0) {
      return handleApiError(
        new Error("Package has no service entitlements for this cart"),
        "This package does not include the selected services.",
        "VALIDATION_ERROR",
        400
      );
    }

    if (hasPkgOfferingLines) {
      const groupPackageParticipants = isGroupBookingDraft
        ? (validatedDraft.group_participants as Array<{ service_ids?: string[]; serviceIds?: string[] }>)
        : null;
      let bookedCounts = bookedOfferingCounts(draft.services, groupPackageParticipants);
      if (groupPackageParticipants?.length) {
        const servicesOnly = bookedOfferingCounts(draft.services, null);
        const participantsOnly = bookedOfferingCounts([], groupPackageParticipants);
        const sameMultiset =
          servicesOnly.size === participantsOnly.size &&
          Array.from(servicesOnly.entries()).every(([id, count]) => participantsOnly.get(id) === count);
        if (sameMultiset) {
          bookedCounts = participantsOnly;
        }
      }
      const badOffering = entitlementMismatch(bookedCounts, entitlementByOffering);
      if (badOffering) {
        return handleApiError(
          new Error("Package entitlement mismatch for offerings"),
          "Selected services must exactly match what this package includes.",
          "PACKAGE_ENTITLEMENT_MISMATCH",
          400
        );
      }
    }

    if (hasPkgProductLines) {
      const bookedProd = bookedProductCounts(products as Array<{ product_id?: string; productId?: string; quantity?: unknown }>);
      const badProduct = entitlementMismatch(bookedProd, entitlementByProduct);
      if (badProduct) {
        return handleApiError(
          new Error("Package entitlement mismatch for products"),
          "Selected products must exactly match what this package includes.",
          "PACKAGE_ENTITLEMENT_MISMATCH",
          400
        );
      }
    }

    packageDiscountAmount = computeCatalogPackageServiceDiscount(pkg, servicesSubtotal);
  }

  // ── Promo code ───────────────────────────────────────────────────────────
  let promotionId: string | null = null;
  let promoDiscountAmount = 0;
  const promoCode = (validatedDraft.promotion_code || "").toString().trim().toUpperCase();
  const linesSubtotalBeforePromo =
    Math.max(0, servicesSubtotal - packageDiscountAmount) + addonsSubtotal + productsSubtotal;
  const prePromoSubtotal = linesSubtotalBeforePromo + travelFee;

  if (promoCode) {
    const providerId = draft.provider_id as string | undefined;

    const { resolveCheckoutPromotionDiscount } = await import("@/lib/pricing/checkout-promotion-discount");
    const promoResolved = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode,
      providerId,
      promoTenantId: provider.tenant_id || marketTenantId || "",
      prePromoSubtotal,
      locationType: draft.location_type === "at_home" ? "at_home" : "at_salon",
      locationId: draft.location_id ?? null,
    });
    promotionId = promoResolved.promotionId;
    promoDiscountAmount = promoResolved.promotionDiscountAmount;
  }

  const combinedAfterPromo = Math.max(0, prePromoSubtotal - promoDiscountAmount);
  /** Persisted booking.subtotal: lines only (after catalog package on services), before promo/membership/loyalty. */
  const subtotal = linesSubtotalBeforePromo;

  // ── Minimum mobile booking amount ────────────────────────────────────────
  if (draft.location_type === "at_home" && provider.minimum_mobile_booking_amount) {
    const minimumAmount = Number(provider.minimum_mobile_booking_amount);
    if (minimumAmount > 0 && combinedAfterPromo < minimumAmount) {
      return handleApiError(
        new Error(`Minimum order amount for house calls is ${minimumAmount.toFixed(2)} ${currency}`),
        `Minimum order amount for house calls is ${minimumAmount.toFixed(2)} ${currency}. Your current order is ${combinedAfterPromo.toFixed(2)} ${currency}. Please add more services or book at the salon instead.`,
        "MINIMUM_ORDER_NOT_MET",
        400
      );
    }
  }

  // ── Commission base ──────────────────────────────────────────────────────
  const commissionBaseBeforeMembership =
    Math.max(0, servicesSubtotal - packageDiscountAmount) + addonsSubtotal + productsSubtotal - promoDiscountAmount;

  // ── Membership discount ──────────────────────────────────────────────────
  // §Provider-audit 2026-05: routed through the shared helper so the public
  // checkout flow and the provider-app `POST /api/provider/bookings` flow
  // compute identical membership benefits and persist the same plan/id.
  const { resolveMembershipDiscount } = await import(
    "@/lib/provider/salon-membership-entitlement"
  );
  const membershipResolved = await resolveMembershipDiscount({
    supabase,
    customerId,
    providerId: draft.provider_id,
    subtotal: combinedAfterPromo,
  });
  const membershipPlanId = membershipResolved.membershipPlanId;
  const membershipId = membershipResolved.membershipId;
  const membershipDiscountAmount = membershipResolved.membershipDiscountAmount;

  const subtotalAfterMembership = Math.max(0, combinedAfterPromo - membershipDiscountAmount);
  const commissionBase = Math.max(0, commissionBaseBeforeMembership - membershipDiscountAmount);

  // ── Tips / Tax ───────────────────────────────────────────────────────────
  const tipsEnabled = Boolean((provider as any)?.tips_enabled ?? true);
  const tipAmount = tipsEnabled ? (draft.tip_amount || 0) : 0;

  // Use null/undefined check — provider explicitly setting 0% is valid and must NOT fall through
  // to the platform default (|| 0 would treat 0% as "not set" which causes bogus 15% fallback)
  const rawProviderTaxRate = (provider as any)?.tax_rate_percent;
  let taxRate: number;
  let taxIncluded = false; // whether tax is already included in prices (inclusive) vs added on top (exclusive)
  if (rawProviderTaxRate == null) {
    const { getPlatformDefaultTaxRateAndInclusive } = await import("@/lib/pricing/checkout-tax-defaults");
    const defaults = await getPlatformDefaultTaxRateAndInclusive(supabaseAdmin);
    taxRate = defaults.taxRate;
    taxIncluded = defaults.taxIncluded;
  } else {
    taxRate = Math.max(0, Number(rawProviderTaxRate));
    // Provider-level inclusive flag if set
    taxIncluded = Boolean((provider as any)?.tax_inclusive ?? false);
  }

  // ── Loyalty redemption (before tax & platform fee; matches checkout parity) ──
  let loyaltyDiscountAmount = 0;
  let loyaltyPointsRedeemed = 0;
  const loyaltyPointsRequested = Number(validatedDraft.loyalty_points_used ?? 0);

  if (loyaltyPointsRequested > 0) {
    const { data: loyaltyConfig } = await supabase
      .from("loyalty_point_config")
      .select("redemption_rate, min_redemption_points, max_redemption_percentage, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loyaltyConfig) {
      return handleApiError(
        new Error("Loyalty points system not configured"),
        "Loyalty points are currently unavailable.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const redemptionRate = Number(loyaltyConfig.redemption_rate) || 10;
    const minPoints = Number(loyaltyConfig.min_redemption_points) || 0;
    const maxPct = Number(loyaltyConfig.max_redemption_percentage) || 100;

    if (loyaltyPointsRequested < minPoints) {
      return handleApiError(
        new Error(`Minimum ${minPoints} loyalty points required`),
        `You need at least ${minPoints} points to redeem.`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const maxDiscount = (subtotalAfterMembership * maxPct) / 100;
    const maxPointsByCap = Math.floor(maxDiscount * redemptionRate);
    const pointsToRedeem = Math.min(loyaltyPointsRequested, maxPointsByCap);

    if (loyaltyPointsRequested > 0 && maxPointsByCap < minPoints) {
      return handleApiError(
        new Error("Loyalty redemption capped below minimum"),
        `This booking only allows up to ${maxPointsByCap} loyalty points (${maxPct}% max), which is below the minimum redemption of ${minPoints} points.`,
        "VALIDATION_ERROR",
        400,
      );
    }

    if (pointsToRedeem < minPoints) {
      return handleApiError(
        new Error(`Minimum ${minPoints} loyalty points required for this booking`),
        `You need at least ${minPoints} points to redeem, but only ${pointsToRedeem} points can be applied on this booking (${maxPct}% maximum).`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: ledgerBal } = await supabase.rpc("get_customer_available_points" as any, {
      customer_uuid: customerId,
    });
    const availableBalance = Number(ledgerBal) || 0;

    if (pointsToRedeem > availableBalance) {
      return handleApiError(
        new Error("Insufficient loyalty points"),
        `You have ${availableBalance} loyalty points available. This redemption needs up to ${pointsToRedeem} points (${maxPct}% max on this booking).`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const discount = pointsToRedeem / redemptionRate;
    loyaltyPointsRedeemed = pointsToRedeem;
    loyaltyDiscountAmount = Math.round(discount * 100) / 100;
  }

  const baseAfterLoyalty = Math.max(0, subtotalAfterMembership - loyaltyDiscountAmount);

  let taxAmount = 0;
  if (taxRate > 0) {
    if (taxIncluded) {
      taxAmount = baseAfterLoyalty - baseAfterLoyalty / (1 + taxRate / 100);
    } else {
      taxAmount = percentOf(baseAfterLoyalty, taxRate);
    }
  }

  // ── Platform Fee ─────────────────────────────────────────────────────────
  let serviceFeeAmount = 0;
  let serviceFeePercentage = 0;
  let serviceFeeConfigId: string | null = null;

  if ((provider as any)?.customer_fee_config_id) {
    const { data: feeConfig } = await supabase
      .from("platform_fee_config")
      .select("id, fee_type, fee_percentage, fee_fixed_amount, min_booking_amount, max_fee_amount")
      .eq("id", (provider as any).customer_fee_config_id)
      .eq("is_active", true)
      .single();

    if (feeConfig) {
      serviceFeeConfigId = feeConfig.id;
      const minBookingAmount = Number(feeConfig.min_booking_amount || 0);

      if (baseAfterLoyalty >= minBookingAmount) {
        if (feeConfig.fee_type === "percentage") {
          serviceFeePercentage = Number(feeConfig.fee_percentage || 0);
          serviceFeeAmount = percentOf(baseAfterLoyalty, serviceFeePercentage);
          if (feeConfig.max_fee_amount) {
            serviceFeeAmount = Math.min(serviceFeeAmount, Number(feeConfig.max_fee_amount));
          }
        } else if (feeConfig.fee_type === "fixed_amount") {
          serviceFeeAmount = Number(feeConfig.fee_fixed_amount || 0);
        }
      }
    }
  }

  // Fallback to platform settings if no provider fee config
  let showServiceFeeToCustomer = true; // default: show — prevents hidden charges
  if (serviceFeeAmount === 0 && !serviceFeeConfigId) {
    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "platform_settings",
      tenantId: provider.tenant_id || marketTenantId || "",
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const settings = (scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings;
    const payoutSettings = (settings as Record<string, any> | undefined)?.payouts || {};
    // Default to "fixed" (R0) when platform not configured — never default to percentage
    const serviceFeeType = payoutSettings.platform_service_fee_type || "fixed";
    const fallbackFeePercentage = payoutSettings.platform_service_fee_percentage ?? 0;
    const fallbackFeeFixed = payoutSettings.platform_service_fee_fixed ?? 0;

    // Respect the show_service_fee_to_customer admin setting
    if (payoutSettings.show_service_fee_to_customer === false) {
      showServiceFeeToCustomer = false;
    }

    if (serviceFeeType === "percentage") {
      serviceFeePercentage = fallbackFeePercentage;
      serviceFeeAmount = percentOf(baseAfterLoyalty, serviceFeePercentage);
    } else {
      serviceFeeAmount = fallbackFeeFixed;
    }
  } else if (serviceFeeConfigId) {
    // Provider-specific fee config: always show since it's explicitly configured per provider
    showServiceFeeToCustomer = true;
  }

  const totalAmount = taxIncluded
    ? sumMoney(baseAfterLoyalty, tipAmount, serviceFeeAmount)
    : sumMoney(baseAfterLoyalty, tipAmount, taxAmount, serviceFeeAmount);

  let loyaltyPointsEarned = 0;
  const { data: loyaltyRule } = await supabase
    .from("loyalty_rules")
    .select("points_per_currency_unit, currency")
    .eq("is_active", true)
    .eq("currency", currency)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (loyaltyRule?.points_per_currency_unit) {
    loyaltyPointsEarned = Math.floor(totalAmount * Number(loyaltyRule.points_per_currency_unit));
  }

  // ── Appointment status ───────────────────────────────────────────────────
  const { determineAppointmentStatusFromDB } = await import(
    "@/lib/provider-portal/appointment-settings"
  );
  const appointmentStatus = await determineAppointmentStatusFromDB(supabaseAdmin, draft.provider_id);

  // ── Group booking duration (for conflict check) ─────────────────────────
  const isGroupBooking =
    Boolean(validatedDraft.is_group_booking) && Boolean(validatedDraft.group_participants);
  const groupParticipants = isGroupBooking ? validatedDraft.group_participants : null;
  let groupTotalDurationMinutes: number | null = null;
  if (isGroupBooking && groupParticipants && groupParticipants.length > 0) {
    const { calculateGroupBookingDuration } = await import(
      "@/lib/bookings/group-booking-services"
    );
    const durationMap = new Map<string, { duration_minutes: number }>();
    for (const o of offeringById.values()) {
      durationMap.set(o.id, { duration_minutes: Number(o.duration_minutes || 0) });
    }
    const primaryServiceIds = (draft.services || []).map((s: any) => s.offering_id);
    const allParticipantsForDuration = [
      { serviceIds: primaryServiceIds },
      ...(groupParticipants as any[]).map((p: any) => ({
        serviceIds: p.service_ids ?? p.serviceIds ?? [],
      })),
    ];
    groupTotalDurationMinutes = calculateGroupBookingDuration(allParticipantsForDuration, durationMap);
  }

  // ── Hold validation (per-segment conflict check runs after booking_services rows are built) ──
  let allowOverride = false;
  let conflictResult: ConflictResult | null = null;
  // holdReservedEndAt is set early when validatedDraft.hold_id is present (see authoritative hold snapshot).

  // ── Resource availability ────────────────────────────────────────────────
  const { getRequiredResourcesForOffering, checkResourceAvailability } = await import(
    "@/lib/resources/assignment"
  );
  let allResourceIds: string[] = [];

  const draftResourceIds = draft.resource_ids;
  if (Array.isArray(draftResourceIds) && draftResourceIds.length > 0) {
    allResourceIds = draftResourceIds;
  } else {
    const resourceResults = await Promise.all(
      draft.services.map((s: any) => getRequiredResourcesForOffering(supabase, s.offering_id))
    );
    const resourceIdSet = new Set<string>();
    for (const requiredResources of resourceResults) {
      for (const rid of requiredResources) {
        resourceIdSet.add(rid);
      }
    }
    allResourceIds = [...resourceIdSet];
  }

  if (allResourceIds.length > 0) {
    const selectedDatetime = new Date(draft.selected_datetime);
    let resMinutes = 0;
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      resMinutes += Number(off.duration_minutes || 0) + Number(off.buffer_minutes || 0);
    }
    const resEnd = new Date(selectedDatetime.getTime() + resMinutes * 60000);

    const resourceCheck = await checkResourceAvailability(
      supabase,
      [...new Set(allResourceIds)],
      selectedDatetime,
      resEnd
    );

    if (!resourceCheck.available) {
      return handleApiError(
        new Error("Required resources are not available"),
        `Required resources are not available: ${resourceCheck.conflicts.map((c: any) => c.reason).join(", ")}`,
        "RESOURCE_UNAVAILABLE",
        409
      );
    }
  }

  // ── Build booking_services data ──────────────────────────────────────────
  let bookingServicesData: any[];
  let totalDuration = 0;

  if (isGroupBooking && groupParticipants && groupParticipants.length > 0) {
    const { calculateGroupBookingDuration } = await import(
      "@/lib/bookings/group-booking-services"
    );

    const servicesMap = new Map();
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
      servicesMap.set(s.offering_id, {
        offering_id: off.id,
        staff_id: s.staff_id || null,
        duration_minutes: Number(off.duration_minutes),
        price: Number(off.price) + homeAdj,
        currency,
        buffer_minutes: Number(off.buffer_minutes || 0),
      });
    }

    // Primary = booker; their services are draft.services. Others are in group_participants (each with service_ids).
    const primaryServiceIds = (draft.services || []).map((s: any) => s.offering_id);
    const allParticipantsForDuration = [
      { serviceIds: primaryServiceIds },
      ...groupParticipants.map((p: any) => ({ serviceIds: p.service_ids ?? p.serviceIds ?? [] })),
    ];
    totalDuration = calculateGroupBookingDuration(allParticipantsForDuration, servicesMap);

    // Booking services data = primary's services only (one booking row; createGroupBookingServices adds others' services)
    let cursor = new Date(draft.selected_datetime);
    bookingServicesData = primaryServiceIds
      .map((serviceId: string) => {
        const s = draft.services.find((serv: any) => serv.offering_id === serviceId);
        if (!s) return null;
        const off = offeringById.get(s.offering_id);
        const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
        const start = new Date(cursor);
        const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
        cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);
        return {
          offering_id: off.id,
          staff_id: s.staff_id || null,
          duration_minutes: Number(off.duration_minutes),
          price: Number(off.price) + homeAdj,
          currency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (bookingServicesData.length === 0 && draft.services.length > 0) {
      const s = draft.services[0];
      const off = offeringById.get(s.offering_id);
      const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
      const start = new Date(draft.selected_datetime);
      const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
      bookingServicesData = [
        {
          offering_id: off.id,
          staff_id: s.staff_id || null,
          duration_minutes: Number(off.duration_minutes),
          price: Number(off.price) + homeAdj,
          currency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        },
      ];
    }
  } else {
    let cursor = new Date(draft.selected_datetime);
    bookingServicesData = draft.services.map((s) => {
      const off = offeringById.get(s.offering_id);
      const start = new Date(cursor);
      const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
      cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);

      const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
      return {
        offering_id: off.id,
        staff_id: s.staff_id || null,
        duration_minutes: Number(off.duration_minutes),
        price: Number(off.price) + homeAdj,
        currency,
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      };
    });

    totalDuration = sumChainedBlockedMinutes(
      draft.services.map((s) => {
        const off = offeringById.get(s.offering_id);
        return {
          durationMinutes: Number(off?.duration_minutes || 0),
          bufferAfterMinutes: Number(off?.buffer_minutes || 0),
        };
      })
    );

    // When "anyone" / no preference: pick the first team member (stable id order) who passes the
    // same calendar block + booking overlap rules as payment — not a random id (that caused slots
    // to show "available" while the assigned staff hit availability_blocks / conflicts).
    const allStaffNull = bookingServicesData.every((s: any) => !s.staff_id);
    if (allStaffNull && draft.provider_id) {
      const offeringBufferMinutesById = new Map<string, number>();
      for (const [oid, off] of offeringById) {
        offeringBufferMinutesById.set(oid, Number(off?.buffer_minutes ?? 15));
      }
      const { pickFirstStaffForNullStaffLines } = await import(
        "@/lib/bookings/resolve-any-staff-for-public-booking"
      );
      const locationIdForCalendar =
        draft.location_type === "at_salon" ? draft.location_id ?? null : null;
      const picked = await pickFirstStaffForNullStaffLines({
        supabaseAdmin,
        providerId: draft.provider_id,
        locationId: locationIdForCalendar,
        bookingServicesData: bookingServicesData as any,
        offeringBufferMinutesById,
        preferredStaffIds: holdPreferredStaffIdsForPick ?? undefined,
      });
      if (picked.ok) {
        bookingServicesData = bookingServicesData.map((s: any) => ({
          ...s,
          staff_id: picked.staffId,
        }));
      } else if (picked.ok === false && picked.reason === "no_one_available_for_window") {
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }
    }
  }

  // ── Time-slot conflict: per scheduled segment (multi-service + multi-staff; solo null staff = provider-wide) ──
  // F17: stamp immutable tax_snapshot on every booking_services line so historical
  // reports are not affected by later VAT-rate changes.
  const taxSnapshotValue = {
    code: "RESOLVED",
    rate: taxRate,
    inclusive: taxIncluded,
    jurisdiction: (provider as any)?.country_code ?? null,
    source: rawProviderTaxRate != null ? "provider_override" : "platform_default",
    resolved_at: new Date().toISOString(),
  };
  bookingServicesData = bookingServicesData.map((line: any) => ({
    ...line,
    tax_snapshot: line.tax_snapshot ?? taxSnapshotValue,
  }));

  {
    const { normalizePublicStaffIdForDatabase } = await import("@beautonomi/utils");
    const {
      lockBookingServices,
      canOverrideDoubleBooking,
      checkActiveHoldOverlap,
      checkBookingSnapshotSegmentConflicts,
    } = await import("@/lib/bookings/conflict-check");

    const offeringBufferMinutesById = new Map<string, number>();
    for (const [oid, off] of offeringById) {
      offeringBufferMinutesById.set(oid, Number(off?.buffer_minutes ?? 15));
    }

    const snapshotLines = bookingServicesData.map((line: any) => ({
      offering_id: line.offering_id,
      staff_id: line.staff_id ?? null,
      scheduled_start_at: line.scheduled_start_at,
      scheduled_end_at: line.scheduled_end_at,
    }));

    if (snapshotLines.length === 0) {
      // No segments (should not happen after validation) — skip conflict machinery
    } else {
      const selectedDatetimeForConflict = new Date(draft.selected_datetime);

      // Other guests' active holds vs each scheduled segment (including synthetic solo: dbStaffId null → provider-wide).
      // Exclude the customer's own hold so it doesn't conflict with itself during checkout.
      const ownHoldId = validatedDraft.hold_id ?? (draft as any).hold_id;
      for (const line of snapshotLines) {
        const { dbStaffId } = normalizePublicStaffIdForDatabase(line.staff_id);
        const segStart = new Date(line.scheduled_start_at);
        const segEnd = new Date(line.scheduled_end_at);
        const holdOverlap = await checkActiveHoldOverlap(supabaseAdmin, draft.provider_id, segStart, segEnd, {
          dbStaffId: dbStaffId ?? null,
          excludeHoldId: ownHoldId,
        });
        if (holdOverlap) {
          console.warn("[validate-booking] hold overlap blocked booking", {
            providerId: draft.provider_id,
            ownHoldId,
            staffId: dbStaffId,
            segStart: segStart.toISOString(),
            segEnd: segEnd.toISOString(),
          });
          return handleApiError(
            new Error("This time slot is no longer available. Please select another time."),
            "This time slot is no longer available. Please select another time.",
            "CONFLICT",
            409
          );
        }
      }

      const fullStart = new Date(snapshotLines[0].scheduled_start_at);
      const lastSnapshotLine = snapshotLines[snapshotLines.length - 1];
      const fullEnd = new Date(lastSnapshotLine.scheduled_end_at);
      if (groupTotalDurationMinutes != null && groupTotalDurationMinutes > 0) {
        fullEnd.setTime(Math.max(fullEnd.getTime(), fullStart.getTime() + groupTotalDurationMinutes * 60000));
      }
      const rangeStart = new Date(fullStart.getTime() - 24 * 60 * 60 * 1000);
      const rangeEnd = new Date(fullEnd.getTime() + 24 * 60 * 60 * 1000);
      const { data: groupBlockers, error: groupBlockersError } = await supabaseAdmin
        .from("group_bookings")
        .select("id, staff_id, scheduled_at, duration_minutes, status")
        .eq("provider_id", draft.provider_id)
        .gte("scheduled_at", rangeStart.toISOString())
        .lte("scheduled_at", rangeEnd.toISOString());

      if (groupBlockersError) {
        throw groupBlockersError;
      }

      const requestedStaffIds = new Set(
        snapshotLines.map((line) => line.staff_id).filter((staffId): staffId is string => typeof staffId === "string" && staffId.length > 0),
      );
      const conflictsWithGroupBooking = (groupBlockers || []).some((group: any) => {
        const groupStatus = String(group.status || "").toLowerCase();
        if (groupStatus === "cancelled" || groupStatus === "canceled" || groupStatus === "no_show") return false;
        const groupStart = new Date(group.scheduled_at);
        if (!Number.isFinite(groupStart.getTime())) return false;
        const groupDuration = Math.max(1, Number(group.duration_minutes || 60));
        const groupEnd = new Date(groupStart.getTime() + groupDuration * 60000);
        const staffId = typeof group.staff_id === "string" ? group.staff_id : null;
        const sameStaffOrProviderWide = !staffId || requestedStaffIds.size === 0 || requestedStaffIds.has(staffId);
        return sameStaffOrProviderWide && groupStart < fullEnd && groupEnd > fullStart;
      });

      if (conflictsWithGroupBooking) {
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }

      const segConflict = await checkBookingSnapshotSegmentConflicts(
        supabaseAdmin,
        draft.provider_id,
        snapshotLines,
        offeringBufferMinutesById,
        (draft as any).reschedule_booking_id
      );
      conflictResult = {
        hasConflict: segConflict.hasConflict,
        conflictingBookings: segConflict.conflictingBookings,
      };
      if (segConflict.hasConflict) {
        allowOverride = await canOverrideDoubleBooking(supabase, draft.provider_id);
        if (!allowOverride) {
          return handleApiError(
            new Error("This time slot is no longer available. Please select another time."),
            "This time slot is no longer available. Please select another time.",
            "CONFLICT",
            409
          );
        }
        console.warn("Double booking override allowed for provider:", draft.provider_id);
      }

      // Advisory lock: reduces TOCTOU vs concurrent confirms (legacy: first staff + whole blocked span)
      const firstLine = snapshotLines[0];
      if (firstLine?.staff_id) {
        if (validatedDraft.hold_id && holdReservedEndAt) {
          const lockRes = await lockBookingServices(
            supabase,
            firstLine.staff_id,
            selectedDatetimeForConflict,
            holdReservedEndAt,
            0
          );
          conflictResult = lockRes;
          if (lockRes.hasConflict) {
            allowOverride = await canOverrideDoubleBooking(supabase, draft.provider_id);
            if (!allowOverride) {
              return handleApiError(
                new Error("This time slot is no longer available. Please select another time."),
                "This time slot is no longer available. Please select another time.",
                "CONFLICT",
                409
              );
            }
            console.warn("Double booking override allowed for provider:", draft.provider_id);
          }
        } else {
          const lastLine = snapshotLines[snapshotLines.length - 1];
          const lastBuf = offeringBufferMinutesById.get(lastLine.offering_id) ?? 15;
          const lockEndAt = new Date(new Date(lastLine.scheduled_end_at).getTime() + lastBuf * 60000);
          const lockRes = await lockBookingServices(
            supabase,
            firstLine.staff_id,
            selectedDatetimeForConflict,
            lockEndAt,
            0
          );
          conflictResult = lockRes;
          if (lockRes.hasConflict) {
            allowOverride = await canOverrideDoubleBooking(supabase, draft.provider_id);
            if (!allowOverride) {
              return handleApiError(
                new Error("This time slot is no longer available. Please select another time."),
                "This time slot is no longer available. Please select another time.",
                "CONFLICT",
                409
              );
            }
            console.warn("Double booking override allowed for provider:", draft.provider_id);
          }
        }
      }
    }
  }

  // Ensure totalDuration is non-zero
  if (totalDuration === 0) {
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      totalDuration += Number(off.duration_minutes || 0) + Number(off.buffer_minutes || 0);
    }
  }

  const selectedDatetime = new Date(draft.selected_datetime);
  const effectiveDuration = groupTotalDurationMinutes != null && groupTotalDurationMinutes > totalDuration
    ? groupTotalDurationMinutes
    : totalDuration;

  // Guard: zero-duration services produce bookingServicesData with scheduled_end_at === scheduled_start_at.
  // The working-hours guard later adds the buffer on top of the zero-length segment, making it extend
  // past closing time and returning a misleading CONFLICT 409 ("time slot taken"). Reject early with a
  // clear VALIDATION_ERROR so the provider can fix their catalog.
  if (effectiveDuration <= 0) {
    return handleApiError(
      new Error("Booking service has zero duration"),
      "One or more selected services has no duration. Please remove it and try again, or contact the provider.",
      "VALIDATION_ERROR",
      400,
    );
  }

  const bookingEndFromServices = new Date(selectedDatetime.getTime() + effectiveDuration * 60000);
  // Hold flow: validate + lock used hold.end_at; create_booking_with_locking must use the same end or we get false 409s.
  // For group bookings, if participants extend the duration past the hold window, use the computed end instead.
  const bookingEnd = holdReservedEndAt && bookingEndFromServices <= holdReservedEndAt
    ? holdReservedEndAt
    : bookingEndFromServices;

  // Guard: end must be strictly after start. Zero-duration services (duration_minutes = 0 in DB,
  // or a corrupted cart) would produce bookingEnd === selectedDatetime which passes the DB
  // constraint check as equal and later causes the RPC to surface "end_at must be after start_at"
  // — a confusing message that the UI can misread as a conflict. Return a clear validation error
  // early so the customer sees a helpful message instead of "time slot taken".
  if (bookingEnd <= selectedDatetime) {
    return handleApiError(
      new Error("Booking end must be after start: service duration is zero or invalid"),
      "One or more selected services has no duration. Please remove it and try again, or contact the provider.",
      "VALIDATION_ERROR",
      400,
    );
  }

  // ── Provider calendar blocks (time blocks, availability, staff off) ─────
  // Same sources as GET /api/public/providers/[slug]/availability; prevents bypass when draft skipped staff conflict paths.
  // For at_home bookings, extend the blocked window by travel buffer to match availability engine behavior.
  const travelBufferMinutes =
    draft.location_type === "at_home"
      ? Number(validatedDraft.availability_travel_buffer_minutes ?? 30)
      : 0;
  const locationIdForCalendar =
    draft.location_type === "at_salon" ? draft.location_id ?? null : null;
  {
    const { isProviderCalendarWindowBlocked } = await import(
      "@/lib/public-booking/provider-calendar-block-overlap"
    );
    for (let i = 0; i < bookingServicesData.length; i++) {
      const line = bookingServicesData[i];
      const segStart = new Date(line.scheduled_start_at);
      const segEnd = new Date(line.scheduled_end_at);
      const off = offeringById.get(line.offering_id);
      const buf = Number(off?.buffer_minutes ?? 15);
      const isLastSegment = i === bookingServicesData.length - 1;
      const travelTail = isLastSegment ? travelBufferMinutes : 0;
      const effectiveEnd = new Date(segEnd.getTime() + (buf + travelTail) * 60000);
      const cal = await isProviderCalendarWindowBlocked(supabaseAdmin, {
        providerId: draft.provider_id,
        locationId: locationIdForCalendar,
        staffId: line.staff_id ?? null,
        startAt: segStart,
        endAt: effectiveEnd,
      });
      if (cal.blocked) {
        return handleApiError(
          new Error(cal.reason || "This time is blocked on the calendar."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409,
        );
      }
    }
  }

  // ── Working hours guard (defense in depth) ────────────────────────────────
  // Same shift resolution as GET availability (`loadEffectiveStaffShifts`): staff_shifts →
  // staff_schedules → working_hours → location hours, then clamp to location window.
  {
    const providerTz =
      normalizeProviderTimezone((provider as { timezone?: string | null }).timezone) ?? "UTC";

    const minutesFromInstantInZone = (instant: Date): number => {
      const hm = formatInTimeZone(instant, providerTz, "HH:mm");
      const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };

    // segmentFitsAnyShift is the shared helper from shift-fit.ts — it handles
    // normal, overnight (end < start), and midnight-close shifts identically to
    // the listing engine (calculate-slots.ts / shiftMinuteRanges). The old
    // inline implementation only tested `closeMin > openMin` and silently
    // rejected valid slots in overnight shifts, causing false 409 conflicts.
    const segmentFitsAtLeastOneShift = segmentFitsAnyShift;

    const shiftCache = new Map<string, Awaited<ReturnType<typeof loadEffectiveStaffShifts>>>();

    for (let i = 0; i < bookingServicesData.length; i++) {
      const line = bookingServicesData[i];
      const segStart = new Date(line.scheduled_start_at);
      const segEnd = new Date(line.scheduled_end_at);
      const off = offeringById.get(line.offering_id);
      const buf = Number(off?.buffer_minutes ?? 15);
      const isLastSegment = i === bookingServicesData.length - 1;
      const travelTail = isLastSegment ? travelBufferMinutes : 0;
      const effectiveSegEnd = new Date(segEnd.getTime() + (buf + travelTail) * 60000);

      const staffIdForGuard = line.staff_id ?? `provider-${draft.provider_id}`;
      const localDate = formatInTimeZone(segStart, providerTz, "yyyy-MM-dd");

      const cacheKey = `${staffIdForGuard}|${localDate}`;
      let resolved = shiftCache.get(cacheKey);
      if (!resolved) {
        resolved = await loadEffectiveStaffShifts(
          supabaseAdmin,
          staffIdForGuard,
          localDate,
          draft.provider_id,
          locationIdForCalendar,
        );
        shiftCache.set(cacheKey, resolved);
      }

      const { staffShifts, workHoursEnabledEffective } = resolved;

      if (staffShifts.length === 0 || !workHoursEnabledEffective) {
        console.warn(
          `[validateBooking] shift-guard: no effective shifts for staff ${staffIdForGuard} on ${localDate}`,
        );
        return handleApiError(
          new Error("Booking falls outside working hours"),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409,
        );
      }

      const segStartMin = minutesFromInstantInZone(segStart);
      const segEndMin = minutesFromInstantInZone(effectiveSegEnd);

      if (!segmentFitsAtLeastOneShift(segStartMin, segEndMin, staffShifts)) {
        console.warn(
          `[validateBooking] shift-guard: segment ${segStart.toISOString()}–${effectiveSegEnd.toISOString()} ` +
            `outside resolved shifts for staff ${staffIdForGuard} on ${localDate}`,
        );
        return handleApiError(
          new Error("Booking falls outside working hours"),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409,
        );
      }
    }
  }

  // ── Return enriched data ─────────────────────────────────────────────────
  return {
    customerId,
    provider: provider as any as ProviderRow,
    currency,

    offeringById,
    addonById,
    productById,

    servicesSubtotal,
    addonsSubtotal,
    productsSubtotal,
    travelFee,
    packageDiscountAmount,
    promoDiscountAmount,
    promotionId,
    promoCode,
    subtotal,

    membershipPlanId,
    membershipId,
    membershipDiscountAmount,
    subtotalAfterMembership,
    commissionBase,

    tipAmount,
    taxRate,
    taxIncluded,
    taxAmount,

    serviceFeeAmount,
    serviceFeePercentage,
    serviceFeeConfigId,
    showServiceFeeToCustomer,

    totalAmount,
    loyaltyPointsEarned,
    loyaltyDiscountAmount,
    loyaltyPointsRedeemed,

    appointmentStatus,

    allowOverride,
    conflictResult,

    allResourceIds,

    bookingServicesData,
    totalDuration,
    bookingEnd,
    selectedDatetime,

    isGroupBooking,
    groupParticipants,
  };
}
