/**
 * Keeps in-chat `messages.attachments[]` rows with `type: "custom_offer"` aligned with
 * `custom_offers.status` so customer/provider UIs never show stale CTAs after lifecycle changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomOfferAttachmentMessageStatus =
  | "pending"
  | "payment_pending"
  | "paid"
  | "expired"
  | "withdrawn"
  | "declined";

export type PatchCustomOfferMessageAttachmentsInput = {
  status: CustomOfferAttachmentMessageStatus;
  bookingId?: string | null;
};

/** @internal exported for unit tests */
export function applyCustomOfferAttachmentPatch(
  a: Record<string, unknown>,
  patch: PatchCustomOfferMessageAttachmentsInput,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...a, status: patch.status };

  if (patch.status === "expired") {
    next.expired = true;
    next.withdrawn = false;
  } else if (patch.status === "withdrawn") {
    next.withdrawn = true;
    next.expired = false;
  } else if (patch.status === "declined") {
    next.withdrawn = false;
    next.expired = false;
  } else if (patch.status === "pending") {
    next.withdrawn = false;
    next.expired = false;
    next.booking_id = null;
  } else if (patch.status === "payment_pending") {
    next.withdrawn = false;
    next.expired = false;
  } else if (patch.status === "paid") {
    next.withdrawn = false;
    next.expired = false;
  }

  if (patch.bookingId !== undefined) {
    next.booking_id = patch.bookingId;
  }

  return next;
}

/**
 * Patch every message attachment blob that references this `offer_id`.
 * Uses a narrow `ilike` pre-filter when supported to avoid full-table scans.
 */
export async function patchCustomOfferMessageAttachments(
  admin: SupabaseClient,
  offerId: string,
  patch: PatchCustomOfferMessageAttachmentsInput,
): Promise<void> {
  let rows: { id: string; attachments: unknown }[] | null = null;

  const { data: filtered, error: filterErr } = await admin
    .from("messages")
    .select("id, attachments")
    .not("attachments", "is", null)
    .ilike("attachments", `%${offerId}%`);

  if (!filterErr && Array.isArray(filtered)) {
    rows = filtered as { id: string; attachments: unknown }[];
  }
  if (!rows || rows.length === 0) {
    const { data: all, error: allErr } = await admin.from("messages").select("id, attachments").not("attachments", "is", null);
    if (allErr) {
      console.warn("[patchCustomOfferMessageAttachments] load messages failed:", allErr.message);
      return;
    }
    rows = (all || []) as { id: string; attachments: unknown }[];
  }

  for (const msg of rows || []) {
    const attachments = msg.attachments;
    if (!Array.isArray(attachments)) continue;
    let changed = false;
    const updated = attachments.map((raw: unknown) => {
      const a = raw as Record<string, unknown>;
      if (a?.type !== "custom_offer" || String(a.offer_id) !== offerId) return raw;
      changed = true;
      return applyCustomOfferAttachmentPatch(a, patch);
    });
    if (changed && JSON.stringify(updated) !== JSON.stringify(attachments)) {
      const { error: upErr } = await admin.from("messages").update({ attachments: updated }).eq("id", msg.id);
      if (upErr) {
        console.warn("[patchCustomOfferMessageAttachments] update failed:", msg.id, upErr.message);
      }
    }
  }
}
