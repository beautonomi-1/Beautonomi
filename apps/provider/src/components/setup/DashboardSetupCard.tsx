/**
 * §provider-setup-seamless-ux 2026-05: Dashboard hero card that nudges new
 * providers to finish setup. Driven by GET /api/provider/setup-status (same
 * source of truth as the onboarding hub, settings checklist, and More-tab
 * completion card — so "% complete" is identical everywhere).
 *
 * Hidden when isComplete (the celebration overlay handles the once-only
 * congratulations moment).
 */
import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";

export type DashboardSetupStep = {
  id: string;
  title: string;
  completed: boolean;
  required: boolean;
  native_route?: string | null;
};

export type DashboardSetupStatus = {
  isComplete: boolean;
  completionPercentage: number;
  steps: DashboardSetupStep[];
};

function pickRouteForStep(step: DashboardSetupStep): string {
  if (step.native_route && step.native_route.startsWith("/(app)/")) {
    return step.native_route;
  }
  return "/(app)/onboarding";
}

export function DashboardSetupCard() {
  const router = useRouter();
  // Shares the same cache key as every other setup-status consumer — no
  // duplicate network call when this screen mounts alongside the More tab.
  const { data, loading } = useApi<DashboardSetupStatus>(
    "/api/provider/setup-status",
  );

  const nextSteps = useMemo(() => {
    const steps = data?.steps ?? [];
    return steps.filter((s) => s.required && !s.completed).slice(0, 3);
  }, [data]);

  if (loading && !data) return null;
  if (!data || data.isComplete) return null;
  if ((data.steps ?? []).length === 0) return null;

  const pct = Math.max(0, Math.min(100, data.completionPercentage));
  const requiredTotal = data.steps.filter((s) => s.required).length;
  const requiredDone = data.steps.filter((s) => s.required && s.completed).length;

  const openHub = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/onboarding" as never);
  };

  const openStep = (step: DashboardSetupStep) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(pickRouteForStep(step) as never);
  };

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#fce7f3",
        backgroundColor: "#fff5f9",
        padding: 16,
      }}
      accessibilityLabel={`Setup ${pct} percent complete. ${requiredDone} of ${requiredTotal} required steps done.`}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
            borderWidth: 1,
            borderColor: "#fbcfe8",
          }}
        >
          <Ionicons name="rocket-outline" size={22} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
            Finish setup to start accepting bookings
          </Text>
          <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>
            {requiredDone} of {requiredTotal} required steps done
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 9999,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#fbcfe8",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.primary }}>
            {pct}%
          </Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 14,
          height: 6,
          width: "100%",
          backgroundColor: "#fde7f0",
          borderRadius: 9999,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${pct}%`,
            minWidth: pct > 0 ? 6 : 0,
            borderRadius: 9999,
            backgroundColor: Colors.primary,
          }}
        />
      </View>

      {nextSteps.length > 0 && (
        <View style={{ marginTop: 12 }}>
          {nextSteps.map((step, idx) => (
            <TouchableOpacity
              key={step.id}
              onPress={() => openStep(step)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: "#fde7f0",
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${step.title}`}
            >
              <Ionicons
                name="ellipse-outline"
                size={16}
                color={Colors.primary}
                style={{ marginRight: 10 }}
              />
              <Text style={{ flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" }}>
                {step.title}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={openHub}
        activeOpacity={0.85}
        style={{
          marginTop: 14,
          backgroundColor: Colors.primary,
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
        accessibilityRole="button"
        accessibilityLabel="Open setup hub"
      >
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
          Continue setup
        </Text>
      </TouchableOpacity>
    </View>
  );
}
