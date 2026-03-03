import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { registerSingularLinkHandler, buildProviderRoute } from "@/lib/singular";

/**
 * Registers with Singular to navigate when a smart link opens the app.
 * Mount once inside the (app) layout so router is available.
 */
export function SingularLinkHandler() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const unregister = registerSingularLinkHandler((params) => {
      const route = buildProviderRoute(params);
      if (route) {
        router.push(route as never);
      }
    });
    return unregister;
  }, []);
  return null;
}
