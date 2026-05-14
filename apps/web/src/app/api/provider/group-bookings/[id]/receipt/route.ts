import { NextRequest, NextResponse } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { groupPackageTotal, groupProductLineTotal } from "@/lib/bookings/group-booking-package-pricing";
import { computeCatalogPackageServiceDiscount } from "@beautonomi/utils";
import { isPaidBookingPaymentStatus } from "@/lib/payments/booking-payment-status";

type ParticipantRow = {
  id: string;
  booking_id?: string | null;
  participant_name?: string | null;
  participant_email?: string | null;
  participant_phone?: string | null;
  service_name?: string | null;
  price?: number | null;
  duration_minutes?: number | null;
  addons?: unknown;
};

type ChildBookingRow = {
  id: string;
  booking_number?: string | null;
  total_amount?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  promotion_discount_amount?: number | null;
  membership_discount_amount?: number | null;
  loyalty_discount_amount?: number | null;
  tax_amount?: number | null;
  travel_fee?: number | null;
  tip_amount?: number | null;
  platform_fee_amount?: number | null;
  service_fee_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  payment_status?: string | null;
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  booking_payments?: Array<{ amount?: number | null; status?: string | null }> | null;
};

type ProviderReceiptRow = {
  business_name?: string | null;
  user_id?: string | null;
  phone?: string | null;
  receipt_header?: string | null;
  receipt_footer?: string | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function participantAddonSummary(addons: unknown): string | null {
  if (!Array.isArray(addons) || addons.length === 0) return null;
  const labels = addons
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const obj = a as Record<string, unknown>;
      return String(obj.name ?? obj.addon_name ?? obj.title ?? "").trim();
    })
    .filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : `${addons.length} add-on${addons.length === 1 ? "" : "s"}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const admin = getSupabaseAdmin();

    let user: { id: string; role: string };
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_group_booking_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json({ error: "Signed download token is invalid or expired" }, { status: 401 });
      }
      const { data: userRow } = await admin
        .from("users")
        .select("id, role")
        .eq("id", parsed.userId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json({ error: "Signed download token is invalid or expired" }, { status: 401 });
      }
      user = { id: userRow.id as string, role: (userRow.role as string) || "provider_owner" };
    } else {
      const authed = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
      user = { id: authed.user.id, role: authed.user.role as string };
    }

    const { data: group, error } = await admin
      .from("group_bookings")
      .select(`
        *,
        service_packages:package_id(id, name, price, discount_percentage),
        booking_participants(id, booking_id, participant_name, participant_email, participant_phone, service_name, price, duration_minutes, addons)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !group) {
      return notFoundResponse("Group booking not found");
    }

    const providerId = (group as { provider_id?: string | null }).provider_id;
    if (!providerId) return forbiddenResponse("Invalid group booking record");
    if (
      user.role !== "superadmin" &&
      !(await userHasProviderAccessAdmin(admin, user.id, providerId))
    ) {
      return forbiddenResponse("You do not have access to this group booking");
    }

    const tenantRegion = (group as { tenant_id?: string | null }).tenant_id
      ? await getTenantRegionConfig((group as { tenant_id?: string }).tenant_id!)
      : null;
    const currency = (group as { currency?: string | null }).currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;

    const [{ data: providerRow }, { data: locationRow }] = await Promise.all([
      admin
        .from("providers")
        .select("id, business_name, user_id, phone, receipt_header, receipt_footer")
        .eq("id", providerId)
        .maybeSingle(),
      (group as any).location_id
        ? admin
            .from("provider_locations")
            .select("id, name, address_line1, address_line2, city, state, postal_code")
            .eq("id", (group as any).location_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const provider = (providerRow || {}) as ProviderReceiptRow;
    let providerOwnerEmail = "";
    if (typeof provider.user_id === "string") {
      const { data: owner } = await admin
        .from("users")
        .select("email")
        .eq("id", provider.user_id)
        .maybeSingle();
      providerOwnerEmail = (owner as { email?: string | null } | null)?.email ?? "";
    }

    const participants = ((group as any).booking_participants || []) as ParticipantRow[];
    const bookingIds = participants.map((p) => p.booking_id).filter(Boolean) as string[];
    const { data: childBookings } = bookingIds.length > 0
      ? await admin
          .from("bookings")
          .select(`
            id,
            booking_number,
            total_amount,
            subtotal,
            discount_amount,
            promotion_discount_amount,
            membership_discount_amount,
            loyalty_discount_amount,
            tax_amount,
            travel_fee,
            tip_amount,
            platform_fee_amount,
            service_fee_amount,
            total_paid,
            total_refunded,
            wallet_amount,
            gift_card_amount,
            payment_status,
            customer:users!bookings_customer_id_fkey(full_name, email, phone),
            booking_payments(id, amount, status)
          `)
          .in("id", bookingIds)
      : { data: [] as ChildBookingRow[] };

    const childRows = (childBookings || []) as ChildBookingRow[];
    const childById = new Map<string, ChildBookingRow>(childRows.map((b) => [b.id, b]));
    const participantTotal = participants.reduce((sum, p) => sum + Math.max(0, num(p.price)), 0);
    const products = Array.isArray((group as any).products) ? ((group as any).products as any[]) : [];
    const productTotal = products.reduce((sum, p) => sum + groupProductLineTotal(p), 0);
    const travelFee = (group as any).location_type === "at_home" ? Math.max(0, num((group as any).travel_fee)) : 0;
    const pkg = Array.isArray((group as any).service_packages)
      ? (group as any).service_packages[0]
      : (group as any).service_packages;
    const packageDiscount = pkg ? computeCatalogPackageServiceDiscount(pkg, participantTotal) : 0;
    const groupComputedTotal = groupPackageTotal({ participantTotal, productTotal, travelFee, packageDiscount });
    const groupTotal = (group as any).total_price != null ? Math.max(0, num((group as any).total_price)) : groupComputedTotal;

    const childTotalAmount = childRows.reduce((sum, b) => sum + num(b.total_amount), 0);
    const taxAmount = childRows.reduce((sum, b) => sum + num(b.tax_amount), 0);
    const platformFeeAmount = childRows.reduce(
      (sum, b) => sum + num(b.platform_fee_amount ?? b.service_fee_amount),
      0,
    );
    const childDiscountAmount = childRows.reduce((sum, b) => sum + num(b.discount_amount), 0);
    const amountPaid = childRows.reduce((sum, b) => {
      const paidViaRows = (b.booking_payments || [])
        .filter((p) => isPaidBookingPaymentStatus(p.status))
        .reduce((s, p) => s + num(p.amount), 0);
      const legacyWalletGift = Math.max(0, num(b.wallet_amount) + num(b.gift_card_amount));
      return sum + Math.max(paidViaRows, legacyWalletGift);
    }, 0);
    const totalRefunded = childRows.reduce((sum, b) => sum + num(b.total_refunded), 0);
    const baseTotal = childRows.length > 0 ? childTotalAmount : groupTotal;
    const netCollected = Math.max(0, amountPaid - totalRefunded);
    /**
     * §Group-booking-audit 2026-05: an empty/estimate-only group has no
     * invoice yet — we still want callers to see what the projected total
     * is, but `balance_due` should be 0 (you cannot owe money on a session
     * that hasn't been billed). Surface the projected amount separately as
     * `estimated_session_amount` for the PDF/UI to render distinctly from a
     * real outstanding balance.
     */
    const isEstimateOnly = childRows.length === 0 && participants.length === 0;
    const balanceDue = isEstimateOnly ? 0 : Math.max(0, baseTotal - netCollected);
    const estimatedSessionAmount = isEstimateOnly ? Math.max(0, baseTotal) : 0;
    const paymentStatus =
      childRows.length === 0
        ? isEstimateOnly
          ? "not_invoiced"
          : "draft"
        : totalRefunded > 0 && amountPaid > 0 && totalRefunded >= amountPaid - 0.01
          ? "refunded"
          : totalRefunded > 0
            ? "partially_refunded"
            : balanceDue <= 0
              ? "paid"
              : childRows.some((b) => b.payment_status === "paid" || num(b.total_paid) > 0)
                ? "partial"
                : "pending";

    const lineItems = participants.map((p, index) => {
      const child = p.booking_id ? childById.get(p.booking_id) : null;
      return {
        participant_id: p.id,
        booking_id: p.booking_id ?? null,
        booking_number: child?.booking_number ?? null,
        description: p.service_name || "Participant service",
        participant_name: p.participant_name || child?.customer?.full_name || `Participant ${index + 1}`,
        email: p.participant_email || child?.customer?.email || null,
        phone: p.participant_phone || child?.customer?.phone || null,
        duration_minutes: p.duration_minutes ?? null,
        addons_summary: participantAddonSummary(p.addons),
        service_amount: num(p.price),
        booking_total: child ? num(child.total_amount) : null,
        tax_amount: child ? num(child.tax_amount) : null,
        platform_fee_amount: child ? num(child.platform_fee_amount ?? child.service_fee_amount) : null,
        amount_paid: child
          ? Math.max(
              (child.booking_payments || [])
                .filter((payment) => isPaidBookingPaymentStatus(payment.status))
                .reduce((sum, payment) => sum + num(payment.amount), 0),
              Math.max(0, num(child.wallet_amount) + num(child.gift_card_amount)),
            )
          : null,
        refunded: child ? num(child.total_refunded) : null,
      };
    });

    return successResponse({
      receipt_kind: "group_booking_aggregate",
      ref_number: (group as any).ref_number || id,
      group_booking_id: id,
      title: (group as any).title || "Group booking",
      status: (group as any).status || "booked",
      scheduled_at: (group as any).scheduled_at || null,
      provider: {
        name: provider.business_name || "Provider",
        email: providerOwnerEmail,
        phone: provider.phone || "",
        receipt_header: provider.receipt_header || null,
        receipt_footer: provider.receipt_footer || null,
      },
      location: {
        type: (group as any).location_type || "at_salon",
        name: (locationRow as any)?.name || null,
        line1: (group as any).address_line1 || (locationRow as any)?.address_line1 || "",
        city: (group as any).address_city || (locationRow as any)?.city || "",
        state: (group as any).address_state || (locationRow as any)?.state || "",
        postal_code: (group as any).address_postal_code || (locationRow as any)?.postal_code || "",
      },
      package_id: (group as any).package_id || null,
      package_name: pkg?.name || null,
      settlement_basis: childRows.length > 0 ? "linked_participant_bookings" : "group_session_estimate",
      participant_count: participants.length,
      items: lineItems,
      products,
      subtotal: participantTotal + productTotal,
      participant_services_total: participantTotal,
      products_total: productTotal,
      package_discount_amount: packageDiscount,
      linked_discount_amount: childDiscountAmount,
      travel_fee: travelFee,
      tax_amount: taxAmount,
      platform_fee_amount: platformFeeAmount,
      total_amount: childRows.length > 0 ? childTotalAmount : groupTotal,
      group_session_total: groupTotal,
      amount_paid: amountPaid,
      total_refunded: totalRefunded,
      balance_due: balanceDue,
      estimated_session_amount: estimatedSessionAmount,
      is_estimate_only: isEstimateOnly,
      payment_status: paymentStatus,
      currency,
      notes: (group as any).notes || null,
      receipt_footer: provider.receipt_footer || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group receipt");
  }
}
