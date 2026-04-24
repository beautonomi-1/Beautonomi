import { MessagesPageClient } from "./MessagesPageClient";
import { fetchMessagesPageInitial } from "./fetch-messages-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchMessagesPageInitial();
  return <MessagesPageClient initial={initial} />;
}
