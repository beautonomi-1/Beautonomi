import { Redirect } from "expo-router";

/**
 * Redirect to the main Clients tab.
 * Client detail screens are accessed via more/clients/[id].
 */
export default function ClientsIndex() {
  return <Redirect href="/(app)/(tabs)/clients" />;
}
