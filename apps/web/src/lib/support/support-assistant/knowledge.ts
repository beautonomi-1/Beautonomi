import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicKbHit = { title: string; slug: string; snippet?: string | null };

/** Static facts for cancellations/refunds (used even before learning_articles SQL refresh). */
export const SUPPORT_CANCELLATION_WALLET_FACTS = [
  "Late cancellation and no-show fees only apply to money paid online through Beautonomi (card, wallet, gift card). Pay-at-venue, cash, and card-machine payments are not charged a cancellation fee.",
  "Refunds of online payments are credited to the customer's Beautonomi wallet first. Fees are charged on the service amount only; a tip paid online is always returned.",
  "Customers may request a bank refund of eligible card-payment wallet credit through Wallet help (manual EFT, finance-approved).",
  "No fee when the booking was not yet confirmed, within the grace period, after the provider rescheduled, or under a no-penalty policy.",
  "In admin: finance approves and marks bank refunds paid; support can see masked request facts on the ticket; ops can cancel a booking with a full preview.",
] as const;

export async function searchPublicKnowledgeForAssistant(
  supabase: SupabaseClient,
  query: string,
  audience: "customer" | "provider",
): Promise<PublicKbHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc("search_learning_articles", {
    p_query: q,
    p_limit: 5,
    p_offset: 0,
  });
  if (error || !data) return [];
  return (data as Array<{ title?: string; slug?: string; excerpt?: string; audience?: string }>)
    .filter((row) => {
      const aud = String(row.audience ?? "general");
      if (aud === "internal") return false;
      if (aud === "general") return true;
      return aud === audience;
    })
    .map((row) => ({
      title: String(row.title ?? "Article"),
      slug: String(row.slug ?? ""),
      snippet: row.excerpt ?? null,
    }))
    .filter((row) => row.slug);
}
