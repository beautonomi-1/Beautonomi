import { MessagingClient } from "./MessagingClient";
import { fetchMessagingInitial } from "./fetch-messaging-initial";
import { getSupabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ProviderMessagingPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; id?: string; conversation?: string; offer_id?: string }>;
}) {
  const sp = await searchParams;
  let resolvedConversationId = sp.conversationId ?? sp.id ?? sp.conversation ?? null;

  if (!resolvedConversationId && sp.offer_id) {
    try {
      const cookieStore = await cookies();
      const supabase = await getSupabaseServer({ cookies: () => cookieStore } as any);
      
      const { data: offerRow } = await supabase
        .from("custom_offers")
        .select("provider_id, request:custom_requests(customer_id)")
        .eq("id", sp.offer_id)
        .single();
        
      if (offerRow) {
        const req = offerRow.request as { customer_id?: string } | undefined;
        if (offerRow.provider_id && req?.customer_id) {
          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("provider_id", offerRow.provider_id)
            .eq("customer_id", req.customer_id)
            .limit(1)
            .maybeSingle();
            
          if (conv) {
            resolvedConversationId = conv.id;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const { conversations, error } = await fetchMessagingInitial();
  return (
    <MessagingClient
      initialConversations={conversations}
      initialError={error}
      initialConversationId={resolvedConversationId}
      fromServer
      offerId={sp.offer_id ?? null}
    />
  );
}
