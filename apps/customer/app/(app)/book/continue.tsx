import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";

function pickParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v) && v[0]) return String(v[0]).trim() || undefined;
  return undefined;
}

/**
 * Same entry as web `/book/continue?hold_id=…` — opens checkout after slot hold (e.g. post-login return, universal link).
 */
export default function BookContinueRedirect() {
  const params = useLocalSearchParams<{
    hold_id?: string | string[];
    reschedule_booking_id?: string | string[];
  }>();
  const holdId = useMemo(() => pickParam(params.hold_id), [params.hold_id]);
  const rescheduleId = useMemo(() => pickParam(params.reschedule_booking_id), [params.reschedule_booking_id]);
  const missingMessage = "Missing hold. Please start your booking again.";

  useEffect(() => {
    if (!holdId) return;
    const p: Record<string, string> = { hold_id: holdId };
    if (rescheduleId) p.reschedule_booking_id = rescheduleId;
    router.replace({ pathname: "/(app)/book-checkout", params: p });
  }, [holdId, rescheduleId]);

  if (!holdId) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            backgroundColor: "#fff",
          }}
        >
          <Text style={{ color: "#6B7280", textAlign: "center", marginBottom: 16 }}>{missingMessage}</Text>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/search")}
            style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary }}
            accessibilityRole="button"
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Find a provider</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    </>
  );
}
