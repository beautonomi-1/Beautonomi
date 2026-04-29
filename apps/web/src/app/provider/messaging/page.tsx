import { MessagingClient } from "./MessagingClient";
import { fetchMessagingInitial } from "./fetch-messaging-initial";

export const dynamic = "force-dynamic";

export default async function ProviderMessagingPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; id?: string; conversation?: string }>;
}) {
  const sp = await searchParams;
  const { conversations, error } = await fetchMessagingInitial();
  return (
    <MessagingClient
      initialConversations={conversations}
      initialError={error}
      initialConversationId={sp.conversationId ?? sp.id ?? sp.conversation ?? null}
      fromServer
    />
  );
}
