import { Redirect } from "expo-router";

/** Canonical locations UI lives under More → Locations. */
export default function SettingsLocationsRedirect() {
  return <Redirect href="/(app)/(tabs)/more/locations" />;
}
