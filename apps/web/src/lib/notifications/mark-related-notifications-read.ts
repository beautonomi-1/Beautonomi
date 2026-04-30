import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * POST body for marking in-app notification rows read when the user opens the
 * related entity directly (chat, booking, order, ticket) without listing notifications.
 */
export const markRelatedNotificationsReadSchema = z
  .object({
    booking_id: z.string().uuid().optional(),
    conversation_id: z.string().uuid().optional(),
    /** Product / shop order — matches `order_id` or `product_order_id` in notification payloads */
    order_id: z.string().uuid().optional(),
    product_order_id: z.string().uuid().optional(),
    ticket_id: z.string().uuid().optional(),
    payment_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (o) =>
      !!(
        o.booking_id ||
        o.conversation_id ||
        o.order_id ||
        o.product_order_id ||
        o.ticket_id ||
        o.payment_id
      ),
    { message: "Provide at least one id" },
  );

export type MarkRelatedNotificationsReadBody = z.infer<typeof markRelatedNotificationsReadSchema>;

function buildJsonOrClause(keys: string[], value: string): string {
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`data->>${key}.eq.${value}`);
    parts.push(`metadata->>${key}.eq.${value}`);
  }
  parts.push(`action_url.ilike.%${value}%`);
  parts.push(`link.ilike.%${value}%`);
  return parts.join(",");
}

/**
 * Marks matching `notifications` rows as read for `userId`.
 * Returns how many rows were updated (may call multiple updates for separate criteria).
 */
export async function markRelatedNotificationsReadForUser(
  supabase: SupabaseClient,
  userId: string,
  body: MarkRelatedNotificationsReadBody,
): Promise<{ marked: number }> {
  const readAt = new Date().toISOString();
  let marked = 0;

  const runUpdate = async (orClause: string) => {
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .eq("user_id", userId)
      .eq("is_read", false)
      .or(orClause)
      .select("id");
    if (error) {
      console.warn("[markRelatedNotificationsReadForUser] update failed:", error.message);
      return;
    }
    marked += data?.length ?? 0;
  };

  if (body.booking_id) {
    await runUpdate(buildJsonOrClause(["booking_id"], body.booking_id));
  }
  if (body.conversation_id) {
    await runUpdate(buildJsonOrClause(["conversation_id"], body.conversation_id));
  }
  if (body.order_id) {
    await runUpdate(buildJsonOrClause(["order_id", "product_order_id"], body.order_id));
  }
  if (body.product_order_id && body.product_order_id !== body.order_id) {
    await runUpdate(buildJsonOrClause(["order_id", "product_order_id"], body.product_order_id));
  }
  if (body.ticket_id) {
    await runUpdate(buildJsonOrClause(["ticket_id"], body.ticket_id));
  }
  if (body.payment_id) {
    await runUpdate(buildJsonOrClause(["payment_id"], body.payment_id));
  }

  return { marked };
}
