/**
 * Legacy route: deep links and old bookmarks may still hit /notifications.
 * Canonical hub: More → Notifications (filters, delete, full list).
 */
import { Redirect } from "expo-router";

export default function NotificationsRedirect() {
  return <Redirect href="/(app)/(tabs)/more/notifications" />;
}
