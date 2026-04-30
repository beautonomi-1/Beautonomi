/**
 * Settings entry for forms — full CRUD lives on `more/forms.tsx`.
 * Avoid maintaining two different UIs for the same APIs.
 */
import { Redirect } from "expo-router";

export default function SettingsFormsRedirect() {
  return <Redirect href="/(app)/(tabs)/more/forms" />;
}
