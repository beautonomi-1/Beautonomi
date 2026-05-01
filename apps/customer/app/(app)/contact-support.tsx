import { Redirect } from "expo-router";

/**
 * Legacy route for deep links and bookmarks. Canonical compose UI is Support → New ticket.
 */
export default function ContactSupportRedirect() {
  return <Redirect href="/(app)/(tabs)/support-tickets/new" />;
}
