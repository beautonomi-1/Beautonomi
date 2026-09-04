import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { chunkIds, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

const METADATA_OR_CHUNK = 40;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const giftCardIds = new Set<string>();

    // 1) Gift cards from orders purchased by this user.
    //
    // `gift_card_orders.gift_card_id` is the singular FK to the FIRST card issued
    // for a bulk order; cards 2..N are only linked via `gift_cards.metadata.order_id`.
    // We fetch both so single AND bulk orders surface every code the buyer paid for.
    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("id, gift_card_id")
      .eq("purchaser_user_id", user.id)
      .eq("status", "paid");

    const paidOrderIds: string[] = [];
    for (const o of orders || []) {
      if (o.gift_card_id) giftCardIds.add(o.gift_card_id);
      if (typeof o.id === "string" && o.id.length > 0) paidOrderIds.push(o.id);
    }

    // 1b) Bulk-order siblings: every card issued for the buyer's paid orders.
    if (paidOrderIds.length > 0) {
      // Use the admin client because `gift_cards.metadata.order_id` is buyer-owned
      // metadata that RLS does not currently expose to the purchaser.
      for (const slice of chunkIds(paidOrderIds, METADATA_OR_CHUNK)) {
        const orFilter = slice.map((id) => `metadata->>order_id.eq.${id}`).join(",");
        const { data: bulkCards } = await supabaseAdmin.from("gift_cards").select("id").or(orFilter);
        for (const c of bulkCards || []) {
          if (c?.id) giftCardIds.add(c.id as string);
        }
      }
    }

    // 2) Gift cards from redemptions (used by this user at checkout)
    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("gift_card_id")
      .eq("user_id", user.id);

    for (const r of redemptions || []) {
      if (r.gift_card_id) giftCardIds.add(r.gift_card_id);
    }

    // 3) Admin-created gift cards assigned to this user's email (metadata.recipient_email)
    if (user.email) {
      const emailLower = user.email.trim().toLowerCase();
      const { data: assigned } = await supabaseAdmin
        .from("gift_cards")
        .select("id, metadata")
        .eq("is_active", true)
        .ilike("metadata->>recipient_email", emailLower);
      for (const c of assigned || []) {
        if (c?.id) giftCardIds.add(c.id as string);
      }
    }

    if (giftCardIds.size === 0) {
      return successResponse({ gift_cards: [] });
    }

    // Filter out cards this user has explicitly hidden ("removed from wallet").
    // Uses supabaseAdmin so it can read the table regardless of RLS caller context.
    const { data: hiddenRows } = await supabaseAdmin
      .from("user_gift_card_hides")
      .select("gift_card_id")
      .eq("user_id", user.id);

    const hiddenIds = new Set<string>(
      (hiddenRows || []).map((r) => r.gift_card_id as string).filter(Boolean)
    );

    const ids = Array.from(giftCardIds).filter((id) => !hiddenIds.has(id));

    if (ids.length === 0) {
      return successResponse({ gift_cards: [] });
    }

    // Admin client to keep visibility of buyer-issued bulk siblings consistent with 1b.
    const giftCards = await fetchInIdChunks<Record<string, unknown>>(ids, (slice) =>
      supabaseAdmin.from("gift_cards").select("*").in("id", slice).order("created_at", { ascending: false }),
      { throwOnError: true },
    );
    giftCards.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

    // Wallet visibility: surface the order's delivery schedule alongside each card so
    // the wallet can show "sends on <date>" / "delivered" without another round trip.
    // `expires_at`, `balance`, `is_active` are columns on gift_cards (select("*")).
    const orderIdByCard = new Map<string, string>();
    for (const o of orders || []) {
      if (o.gift_card_id && o.id) orderIdByCard.set(o.gift_card_id as string, o.id as string);
    }
    for (const c of giftCards || []) {
      const metaOrderId = (c as { metadata?: Record<string, unknown> }).metadata?.order_id;
      if (typeof metaOrderId === "string" && !orderIdByCard.has(c.id as string)) {
        orderIdByCard.set(c.id as string, metaOrderId);
      }
    }
    const orderIds = Array.from(new Set(orderIdByCard.values()));
    const deliveryByOrder = new Map<
      string,
      { deliver_at: string | null; delivered_at: string | null; delivery_channel: string | null }
    >();
    if (orderIds.length > 0) {
      try {
        const orderRows = await fetchInIdChunks<Record<string, unknown>>(orderIds, (slice) =>
          supabaseAdmin
            .from("gift_card_orders")
            .select("id, deliver_at, delivered_at, delivery_channel")
            .in("id", slice),
        );
        for (const row of orderRows) {
          deliveryByOrder.set(row.id as string, {
            deliver_at: (row.deliver_at as string | null) ?? null,
            delivered_at: (row.delivered_at as string | null) ?? null,
            delivery_channel: (row.delivery_channel as string | null) ?? null,
          });
        }
      } catch (deliveryLookupError) {
        // Delivery schedule is decorative for the wallet; never fail the list over it.
        console.warn("[me/gift-cards] delivery lookup failed", deliveryLookupError);
      }
    }

    const enriched = (giftCards || []).map((card) => {
      const orderId = orderIdByCard.get(card.id as string);
      const delivery = orderId ? deliveryByOrder.get(orderId) : undefined;
      return {
        ...card,
        expires_at: (card as { expires_at?: string | null }).expires_at ?? null,
        balance: Number((card as { balance?: number | string | null }).balance ?? 0),
        is_active: (card as { is_active?: boolean | null }).is_active ?? false,
        deliver_at: delivery?.deliver_at ?? null,
        delivered_at: delivery?.delivered_at ?? null,
        delivery_channel: delivery?.delivery_channel ?? null,
        can_resend: Boolean(orderId),
      };
    });

    return successResponse({ gift_cards: enriched });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch gift cards");
  }
}
