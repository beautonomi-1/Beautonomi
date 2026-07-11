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
import {
  GUIDED_WIZARD_ROUTE,
  resolveNextIncompleteRoute,
  resolveSetupStepRoute,
  type SetupNavStep,
} from "@/lib/setup-step-navigation";

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

/**
 * Prefer a dedicated native screen when the server returned one (so the
 * provider lands directly on the form that fixes the missing field). Fall
 * back to the shared setup-step resolver.
 */
function pickRouteForStep(step: DashboardSetupStep): string {
  return resolveSetupStepRoute(step as SetupNavStep);
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

  const steps = data.steps ?? [];
  const hasSetupSteps = steps.length > 0;

  const openWizard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(GUIDED_WIZARD_ROUTE as never);
  };

  const continueSetup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(resolveNextIncompleteRoute(steps as SetupNavStep[]) as never);
  };

  if (!hasSetupSteps) {
    return (
      <View
        style={{
          marginBottom: 16,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "#fbcfe8",
          backgroundColor: "#ffffff",
          padding: 18,
          shadowColor: "#831843",
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
        accessibilityLabel="Start business setup"
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: "#fdf2f8",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <Ionicons name="rocket" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", letterSpacing: -0.2 }}>
              Start your business profile
            </Text>
            <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
              Complete setup to accept bookings and go live
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={openWizard}
          activeOpacity={0.88}
          style={{
            marginTop: 16,
            backgroundColor: Colors.primary,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel="Start business setup wizard"
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 }}>
            Start business setup
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    );
  }

  const pct = Math.max(0, Math.min(100, data.completionPercentage));
  const requiredTotal = steps.filter((s) => s.required).length;
  const requiredDone = steps.filter((s) => s.required && s.completed).length;

  const openStep = (step: DashboardSetupStep) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(pickRouteForStep(step) as never);
  };

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#fbcfe8",
        backgroundColor: "#ffffff",
        padding: 18,
        shadowColor: "#831843",
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
      accessibilityLabel={`Setup ${pct} percent complete. ${requiredDone} of ${requiredTotal} required steps done.`}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            backgroundColor: "#fdf2f8",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Ionicons name="rocket" size={24} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", letterSpacing: -0.2 }}>
            Finish setup to go live
          </Text>
          <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {requiredDone} of {requiredTotal} required tasks done
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 9999,
            backgroundColor: "#fdf2f8",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.primary }}>
            {pct}%
          </Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 16,
          height: 8,
          width: "100%",
          backgroundColor: "#fce7f3",
          borderRadius: 9999,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${pct}%`,
            minWidth: pct > 0 ? 8 : 0,
            borderRadius: 9999,
            backgroundColor: Colors.primary,
          }}
        />
      </View>

      {nextSteps.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "#9ca3af",
              marginBottom: 8,
            }}
          >
            Next up
          </Text>
          {nextSteps.map((step, idx) => (
            <TouchableOpacity
              key={step.id}
              onPress={() => openStep(step)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: "#f3f4f6",
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${step.title}`}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "#fdf2f8",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.primary }}>
                  {idx + 1}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" }}>
                {step.title}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#cbd5f5" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={continueSetup}
        activeOpacity={0.88}
        style={{
          marginTop: 16,
          backgroundColor: Colors.primary,
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
        }}
        accessibilityRole="button"
        accessibilityLabel="Continue setup"
      >
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 }}>
          Continue setup
        </Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
}
