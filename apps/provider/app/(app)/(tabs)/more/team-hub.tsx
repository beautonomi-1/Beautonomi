import { Redirect } from "expo-router";

/**
 * Legacy alias — same screen as `more/team` (staff list & scheduling entry).
 */
export default function TeamHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/team" />;
}
