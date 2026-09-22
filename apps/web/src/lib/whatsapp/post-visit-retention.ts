import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isCustomerWhatsAppJourneyEnabled } from "@/lib/whatsapp/journey-flags";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";
import { isShadowEmail } from "@/lib/users/shadow-email";

const RETENTION_KIND = "post_visit";
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function johannesburgQuietDelay(now = new Date()): Date | null {
  const fmt = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(fmt.format(now));
  if (hour >= 9 && hour < 18) return null;
  const next = new Date(now);
  if (hour >= 18) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  next.setUTCHours(7, 0, 0, 0);
  return next;
}

async function retentionCapOk(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - RETENTION_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("whatsapp_retention_sends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("sent_at", since);
  return (count ?? 0) < 1;
}

/**
 * Single post-visit WhatsApp (review + claim + loyalty). Returns true when enqueued.
 */
export async function maybeEnqueuePostVisitWhatsApp(bookingId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, customer_id, booking_number, tenant_id, loyalty_points_earned, providers(business_name)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.customer_id) return false;

  const tenantId = (booking.tenant_id as string | null) ?? null;
  if (!(await isCustomerWhatsAppJourneyEnabled(tenantId))) return false;
  if (!(await retentionCapOk(supabase, booking.customer_id as string))) return false;

  const { data: prior } = await supabase
    .from("whatsapp_retention_sends")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", RETENTION_KIND)
    .limit(1);
  if (prior && prior.length > 0) return false;

  const { data: userRow } = await supabase
    .from("users")
    .select("email, is_shadow, claimed_at, whatsapp_opted_out_at, phone")
    .eq("id", booking.customer_id)
    .maybeSingle();
  if (userRow?.whatsapp_opted_out_at) return false;
  if (!userRow?.phone?.trim()) return false;

  const providerRaw = booking.providers as { business_name?: string } | Array<{ business_name?: string }> | null;
  const providerName = Array.isArray(providerRaw)
    ? providerRaw[0]?.business_name
    : providerRaw?.business_name;

  const points = Number(booking.loyalty_points_earned ?? 0);
  const isShadow = userRow.is_shadow === true && !userRow.claimed_at;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  const variables: Record<string, string> = {
    provider_name: providerName || "Your salon",
    booking_number: String(booking.booking_number || bookingId.slice(0, 8)),
    booking_id: bookingId,
    review_url: `${baseUrl}/account-settings/bookings/${bookingId}`,
    loyalty_points: points > 0 ? String(points) : "",
    claim_link: isShadow ? `${baseUrl}/auth/claim?booking=${bookingId}` : "",
  };

  const scheduleAt = johannesburgQuietDelay();
  const result = await dispatchTemplateNotification(
    "post_visit_whatsapp",
    [booking.customer_id as string],
    variables,
    ["whatsapp"],
    { appType: "customer", tenantId, scheduleAt: scheduleAt ?? undefined },
  );
  if (!result.success) return false;

  await supabase.from("whatsapp_retention_sends").insert({
    user_id: booking.customer_id,
    kind: RETENTION_KIND,
    booking_id: bookingId,
    metadata: {
      points,
      shadow: isShadow && !isShadowEmail(userRow.email as string),
    },
  });

  return true;
}
