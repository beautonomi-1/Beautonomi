/**
 * §Provider-audit 2026-04: this screen previously contained a simpler
 * (break-read-only) copy of the operating-hours editor. The canonical
 * editor now lives at `settings/hours.tsx` which supports full break
 * editing AND the same PATCH `/api/provider/settings/operating-hours`
 * endpoint. Two side-by-side editors kept drifting out of sync with
 * the `breaks` payload and caused support churn.
 *
 * Keeping this file as a thin redirect so any surviving deep-links
 * (push notifications, profile-completion rows, external docs) still
 * land on the real editor instead of crashing. No UI is rendered once
 * the replace() fires — we do it in an effect to be safe during SSR/
 * prebuild export.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { LoadingState } from "@/components/ui/LoadingState";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

export default function OperatingHoursRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(app)/(tabs)/more/settings/hours" as never);
  }, [router]);

  return (
    <ScreenContainer>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <LoadingState message="Redirecting..." />
      </View>
    </ScreenContainer>
  );
}
