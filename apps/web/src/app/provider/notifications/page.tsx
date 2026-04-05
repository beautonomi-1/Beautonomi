import { NotificationsClient } from "./NotificationsClient";
import { fetchNotificationsInitial } from "./fetch-notifications-initial";

export const dynamic = "force-dynamic";

export default async function ProviderNotificationsPage() {
  const { notifications, totalUnread, error } = await fetchNotificationsInitial();
  return (
    <NotificationsClient
      initialNotifications={notifications}
      initialTotalUnread={totalUnread}
      initialError={error}
      fromServer
    />
  );
}
