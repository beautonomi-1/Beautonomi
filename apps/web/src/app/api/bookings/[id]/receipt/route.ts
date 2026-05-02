import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, userHasProviderAccessAdmin } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";

type BookingServiceRow = {
  price?: number | null;
  guest_name?: string | null;
  offerings?: { title?: string | null; price?: number | null } | null;
  offering?: { title?: string | null; price?: number | null } | null;
  /**
   * B14: immutable tax snapshot captured at booking time
   * (F17 / migration 493). Shape: `{ code, rate, inclusive, jurisdiction, source, resolved_at }`.
   * Exposed per-line so customers + auditors can see the exact VAT context
   * applied, independent of later provider/platform tax-rate changes.
   */
  tax_snapshot?: {
    code?: string | null;
    rate?: number | null;
    inclusive?: boolean | null;
    jurisdiction?: string | null;
    source?: string | null;
    resolved_at?: string | null;
  } | null;
};

type BookingAddonRow = {
  quantity?: number | null;
  price?: number | null;
};

type BookingProductRow = {
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  products?: { name?: string | null; retail_price?: number | null } | null;
  product_variant?: { option_values?: Record<string, unknown> | null } | null;
};

type AdditionalChargeRow = {
  id: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  requested_at?: string | null;
  paid_at?: string | null;
};

type ProviderLocationRow = {
  id?: string | null;
  name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

type BookingReceiptRow = {
  id: string;
  tenant_id?: string | null;
  booking_number?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  customer_id: string;
  provider_id: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  service_fee_amount?: number | null;
  travel_fee?: number | null;
  tip_amount?: number | null;
  discount_amount?: number | null;
  promotion_discount_amount?: number | null;
  membership_discount_amount?: number | null;
  loyalty_discount_amount?: number | null;
  loyalty_points_used?: number | null;
  loyalty_points_redeemed?: number | null;
  discount_reason?: string | null;
  cancellation_fee?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  customer?: unknown;
  provider?: unknown;
  location?: ProviderLocationRow | null;
  booking_services?: BookingServiceRow[] | null;
  booking_addons?: BookingAddonRow[] | null;
  booking_products?: BookingProductRow[] | null;
  booking_payments?: unknown[] | null;
  additional_charges?: AdditionalChargeRow[] | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;

    // §Customer-audit 2026-04: support the short-lived HMAC `?token=` the
    // mobile app mints via /api/bookings/[id]/receipt/signed-url.
    // Previously the PDF sibling route tried to satisfy `requireRoleInApi`
    // by setting a service-role Bearer, but `supabase.auth.getUser()` is
    // not valid for a service-role JWT, so every authenticated mobile
    // receipt download failed. Validate the token here directly and
    // derive the caller's user id from it — `parseReceiptDownloadToken`
    // already binds kind + booking id + userId + expiry via HMAC.
    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let tokenUserId: string | null = null;
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "customer_booking_receipt",
        subjectId: bookingId,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      tokenUserId = parsed.userId;
    }

    let user: { id: string; role: string };
    if (tokenUserId) {
      const { data: userRow } = await getSupabaseAdmin()
        .from("users")
        .select("id, role")
        .eq("id", tokenUserId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "customer",
      };
    } else {
      const authed = await requireRoleInApi(
        ["customer", "provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = { id: authed.user.id, role: authed.user.role as string };
    }

    // Use admin client so RLS doesn't block access — ownership is verified below
    const supabase = getSupabaseAdmin();

    // §Launch-audit 2026-04: the deep join below was returning 404 "Booking
    // not found" for bookings that do exist whenever any embedded relation
    // had schema drift (e.g. renamed FK). We now do a cheap existence probe
    // first so we can return 404 *only* when the booking truly doesn't
    // exist, and a diagnostic 500 when the detail query fails.
    const { data: existsRow, error: existsErr } = await supabase
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (existsErr) {
      console.error("[receipt] Booking lookup failed:", existsErr);
      return NextResponse.json(
        { error: "Failed to load booking", code: existsErr.code ?? null },
        { status: 500 },
      );
    }

    if (!existsRow) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 },
      );
    }

    // Get booking with all related data
    const { data: bookingRaw, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:users!bookings_customer_id_fkey(id, email, full_name, phone),
        provider:providers!bookings_provider_id_fkey(
          id,
          business_name,
          user_id,
          phone,
          receipt_header,
          receipt_footer
        ),
        location:provider_locations!bookings_location_id_fkey(
          id,
          name,
          address_line1,
          address_line2,
          city,
          state,
          postal_code
        ),
        booking_services:booking_services(
          id,
          offering_id,
          duration_minutes,
          price,
          currency,
          guest_name,
          tax_snapshot,
          offering:offerings(
            id,
            title,
            price,
            duration_minutes
          )
        ),
        booking_addons:booking_addons(
          id,
          addon_id,
          addon_name,
          quantity,
          price
        ),
        booking_products:booking_products(
          id,
          product_id,
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(
            id,
            name,
            retail_price
          ),
          product_variant:product_variants(id, option_values)
        ),
        booking_payments:booking_payments(
          id,
          amount,
          payment_method,
          payment_provider,
          status,
          created_at
        ),
        additional_charges:additional_charges(
          id,
          description,
          amount,
          currency,
          status,
          requested_at,
          paid_at
        ),
        service_packages:package_id(id, name)
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError) {
      // §Launch-audit 2026-04: the booking existed (we just probed it with
      // `existsRow` above) but the detail join failed. That's a 500, not a
      // 404 — mislabelling it as 404 was what made the bug invisible to
      // support. Surface the Supabase error code so ops can tell whether
      // it's a schema drift (e.g. PGRST200 / missing FK hint) or a
      // genuinely transient failure.
      console.error(
        "[receipt] Detail query failed:",
        bookingError.message,
        bookingError.code,
        bookingError.details,
      );
      return NextResponse.json(
        {
          error: "Failed to load receipt details",
          code: bookingError.code ?? null,
          message: bookingError.message ?? null,
        },
        { status: 500 },
      );
    }

    if (!bookingRaw) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = bookingRaw as BookingReceiptRow;

    const tenantRegion = booking.tenant_id
      ? await getTenantRegionConfig(booking.tenant_id)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Verify access: customer = booking owner; provider = owner or staff of
    // the booking's provider (multi-provider staff safe); superadmin = support
    const isCustomer = booking.customer_id === user.id;
    const isProvider = await userHasProviderAccessAdmin(
      supabase,
      user.id,
      booking.provider_id,
    );
    const isAdmin = user.role === "superadmin";

    if (!isCustomer && !isProvider && !isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Calculate totals (booking_services stores price per service line, no quantity)
    const servicesTotal =
      booking.booking_services?.reduce(
        (sum: number, bs: BookingServiceRow) => sum + Number(bs.price || 0),
        0
      ) || 0;

    const productsTotal =
      booking.booking_products?.reduce(
        (sum: number, bp: BookingProductRow) =>
          sum +
          Number(
            bp.total_price ||
              (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1)
          ),
        0
      ) || 0;

    const addonsTotal =
      booking.booking_addons?.reduce(
        (sum: number, ba: BookingAddonRow) =>
          sum + Number(ba.price || 0) * Number(ba.quantity || 1),
        0
      ) || 0;

    const linesSubtotal = servicesTotal + productsTotal + addonsTotal;
    const storedSubtotal = booking.subtotal != null ? Number(booking.subtotal) : null;
    const subtotal = storedSubtotal != null && !Number.isNaN(storedSubtotal) ? storedSubtotal : linesSubtotal;

    const tax = Number(booking.tax_amount || 0);
    const platformFee = Number((bookingRaw as Record<string, unknown>).platform_fee_amount ?? booking.service_fee_amount ?? 0);
    const platformFeePercentage = Number(
      (bookingRaw as Record<string, unknown>).platform_fee_percentage ??
        (bookingRaw as Record<string, unknown>).service_fee_percentage ??
        0,
    );
    const travelFee = Number(booking.travel_fee || 0);
    const tipAmount = Number(booking.tip_amount || 0);
    const discount = Number(booking.discount_amount || 0);
    const promotionDiscount = Number(booking.promotion_discount_amount || 0);
    const membershipDiscount = Number(booking.membership_discount_amount || 0);
    const loyaltyDiscount = Number(booking.loyalty_discount_amount || 0);
    const loyaltyPointsUsed = Number(booking.loyalty_points_used || booking.loyalty_points_redeemed || 0);
    const rawPkgId = (bookingRaw as Record<string, unknown>).package_id;
    const hasPackage =
      typeof rawPkgId === "string" && rawPkgId.length > 0;
    const spJoin = (bookingRaw as { service_packages?: { id?: string; name?: string } | { id?: string; name?: string }[] })
      .service_packages;
    const pkgJoined = Array.isArray(spJoin) ? spJoin[0] : spJoin;
    const packageDiscount = hasPackage ? Math.max(0, discount - promotionDiscount) : 0;
    const discountTotal = discount + membershipDiscount + loyaltyDiscount;
    const cancellationFee = Number(booking.cancellation_fee || 0);

    const totalFromRow =
      booking.total_amount != null && !Number.isNaN(Number(booking.total_amount))
        ? Number(booking.total_amount)
        : subtotal + tax + platformFee + travelFee + tipAmount - discountTotal - cancellationFee;

    const additionalCharges = (booking.additional_charges || []).map((ac: AdditionalChargeRow) => ({
      id: ac.id,
      description: ac.description || "Additional charge",
      amount: Number(ac.amount || 0),
      currency: ac.currency || booking.currency || currencyFallback,
      status: ac.status || "pending",
      requested_at: ac.requested_at || null,
      paid_at: ac.paid_at || null,
    }));

    const providerRaw = (booking.provider && typeof booking.provider === "object"
      ? (booking.provider as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const providerOwnerId = typeof providerRaw.user_id === "string" ? providerRaw.user_id : null;
    let providerOwnerEmail = "";
    if (providerOwnerId) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", providerOwnerId)
        .maybeSingle();
      providerOwnerEmail = (ownerRow as { email?: string | null } | null)?.email ?? "";
    }
    let providerLocation = booking.location ?? null;
    if (!providerLocation) {
      const { data: primaryLocation } = await supabase
        .from("provider_locations")
        .select("id, name, address_line1, address_line2, city, state, postal_code")
        .eq("provider_id", booking.provider_id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      providerLocation = primaryLocation as ProviderLocationRow | null;
    }
    const providerForReceipt: Record<string, unknown> = {
      ...providerRaw,
      owner_email: providerOwnerEmail,
      email: providerOwnerEmail,
      address: {
        line1: providerLocation?.address_line1 || "",
        line2: providerLocation?.address_line2 || "",
        city: providerLocation?.city || "",
        state: providerLocation?.state || "",
        postal_code: providerLocation?.postal_code || "",
      },
    };

    const bRaw = bookingRaw as Record<string, unknown>;
    const completedPayments = (booking.booking_payments || []) as Array<{ amount?: number; status?: string }>;
    const paymentsPaid = completedPayments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const walletCredit = Number(bRaw.wallet_amount ?? 0);
    const giftCardCredit = Number(bRaw.gift_card_amount ?? 0);
    const totalPaidRow = Number(bRaw.total_paid ?? 0);
    const totalRefundedRow = Number(bRaw.total_refunded ?? 0);
    const amountPaid = paymentsPaid + walletCredit + giftCardCredit;
    const balanceDue = computeBookingOutstandingDisplay({
      totalAmount: totalFromRow,
      totalPaid: totalPaidRow,
      totalRefunded: totalRefundedRow,
      walletAmount: walletCredit,
      giftCardAmount: giftCardCredit,
      unpaidAdditionalCharges: additionalCharges
        .filter((ac) => ac.status !== "paid" && ac.status !== "rejected")
        .reduce((sum, ac) => sum + Number(ac.amount || 0), 0),
      paymentStatus: booking.payment_status,
    });
    const depositRequired = Boolean(bRaw.deposit_required);
    const depositAmount = Number(bRaw.deposit_amount || 0);
    const depositPercentage = Number(bRaw.deposit_percentage || 0);
    const paymentOption = (bRaw.payment_option as string) || "full";

    const receipt = {
      package_id: hasPackage ? rawPkgId : null,
      package_name: hasPackage ? (pkgJoined?.name ?? null) : null,
      booking_number: booking.booking_number,
      booking_date: booking.created_at,
      service_date: booking.scheduled_at,
      customer: booking.customer,
      provider: providerForReceipt,
      services: booking.booking_services?.map((bs: BookingServiceRow) => {
        const title = (bs.offering?.title ?? bs.offerings?.title) || "Service";
        const offeringPrice = bs.offering?.price ?? bs.offerings?.price;
        const guest = bs.guest_name?.trim();
        return {
          name: guest ? `${title} (${guest})` : title,
          quantity: 1,
          price: bs.price ?? offeringPrice ?? 0,
          total: bs.price ?? offeringPrice ?? 0,
          // B14: forward the immutable tax snapshot stamped at booking
          // creation so clients render the real VAT line (rate + inclusive
          // flag) even if the provider's current tax settings have changed.
          tax_snapshot: bs.tax_snapshot ?? null,
        };
      }) || [],
      addons:
        booking.booking_addons?.map((ba: BookingAddonRow) => ({
          name: (ba as Record<string, unknown>).addon_name as string || "Add-on",
          quantity: ba.quantity || 1,
          price: Number(ba.price || 0),
          total: Number(ba.price || 0) * Number(ba.quantity || 1),
        })) || [],
      products: booking.booking_products?.map((bp: BookingProductRow) => {
        const ov = bp.product_variant?.option_values;
        const variantLabel =
          ov && typeof ov === "object"
            ? ` · ${Object.values(ov).join(" / ")}`
            : "";
        return {
          name: `${bp.products?.name || "Product"}${variantLabel}`,
          quantity: bp.quantity || 1,
          price: bp.unit_price || bp.products?.retail_price || 0,
          total:
            bp.total_price ||
            (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
        };
      }) || [],
      subtotal: Math.max(0, subtotal - travelFee),
      tax,
      tax_rate: Number(bRaw.tax_rate || 0),
      platform_fee_amount: platformFee,
      platform_fee_percentage: platformFeePercentage,
      fees: platformFee,
      service_fee_amount: platformFee,
      service_fee_percentage: platformFeePercentage,
      travel_fee: travelFee,
      tip_amount: tipAmount,
      cancellation_fee: cancellationFee,
      discount,
      promotion_discount_amount: promotionDiscount,
      membership_discount_amount: membershipDiscount,
      loyalty_discount_amount: loyaltyDiscount,
      loyalty_points_used: loyaltyPointsUsed,
      package_discount_amount: packageDiscount,
      discount_total_amount: discountTotal,
      discount_reason: booking.discount_reason || null,
      total: totalFromRow,
      currency: booking.currency || currencyFallback,
      payment_status: booking.payment_status,
      amount_paid: amountPaid,
      wallet_amount: walletCredit,
      gift_card_amount: giftCardCredit,
      balance_due: balanceDue,
      // B14: expose `total_refunded` so customer-facing receipts can render
      // "Refunded" lines and compute net paid without re-hitting the refunds
      // API. Sourced from `bookings.total_refunded` which is maintained by
      // the finance trigger (migration 490).
      total_refunded: totalRefundedRow,
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_percentage: depositPercentage,
      payment_option: paymentOption,
      transactions: booking.booking_payments || [],
      additional_charges: additionalCharges,
      receipt_header: (providerForReceipt.receipt_header as string) || null,
      receipt_footer: (providerForReceipt.receipt_footer as string) || null,
    };

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate receipt";
    const lower = message.toLowerCase();
    if (
      lower.includes("insufficient permissions") ||
      lower.includes("authentication required")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
