import NotificationsInboxPageClient from "./NotificationsInboxPageClient";
import { fetchNotificationsInboxInitial } from "./fetch-notifications-inbox-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialInbox = await fetchNotificationsInboxInitial();
  return <NotificationsInboxPageClient initialInbox={initialInbox} />;
}
