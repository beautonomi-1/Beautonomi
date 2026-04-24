import NotificationsPageClient from "./NotificationsPageClient";
import { fetchNotificationPreferencesInitial } from "./fetch-notification-preferences-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialPreferences = await fetchNotificationPreferencesInitial();
  return <NotificationsPageClient initialPreferences={initialPreferences} />;
}
