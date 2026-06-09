import { Redirect } from "expo-router";

/** Canonical package editor lives on the packages screen. */
export default function PackagesListRedirect() {
  return <Redirect href="/(app)/(tabs)/more/packages" />;
}
