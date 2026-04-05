import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  features?: unknown;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  plan?: Plan | null;
}

/** Content-only for use in Settings hub tab. */
export function SubscriptionContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Subscription | null>("/api/provider/subscription");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && data === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && data === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }
  const sub = data ?? null;
  const plan = sub?.plan && !Array.isArray(sub.plan)
    ? (sub.plan as Plan)
    : Array.isArray(sub?.plan) && (sub.plan as Plan[]).length
      ? (sub.plan as Plan[])[0]
      : null;
  const status = sub?.status ?? "none";
  const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={{ marginBottom: 24, width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 32, backgroundColor: "#faf5ff" }}>
        <Ionicons name="diamond-outline" size={32} color="#a855f7" />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Plan & billing</Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>
        Your current subscription. Manage upgrades and billing from the in-app subscription flow.
      </Text>

      {!sub ? (
        <View style={{ marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 16 }}>
          <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>No active subscription</Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }}>
            Subscribe from Settings {"->"} Subscription to unlock all features.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
              {plan?.name ?? "Plan"}
            </Text>
            <View
              style={{
                borderRadius: 9999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor:
                  status === "active"
                    ? "#dcfce7"
                    : status === "expired"
                      ? "#fee2e2"
                      : Colors.gray[100],
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  textTransform: "capitalize",
                  color:
                    status === "active"
                      ? "#166534"
                      : status === "expired"
                        ? "#b91c1c"
                        : Colors.gray[700],
                }}
              >
                {status}
              </Text>
            </View>
          </View>
          {plan?.price_monthly != null && (
            <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>
              {plan.currency} {plan.price_monthly.toFixed(2)}/month
              {plan.price_yearly != null && (
                <> · {plan.currency} {plan.price_yearly.toFixed(2)}/year</>
              )}
            </Text>
          )}
          {expiresAt && (
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
              {status === "active" ? "Renews " : "Expired "}
              {expiresAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

export default function SubscriptionScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Subscription" showBack />
      <SubscriptionContent />
    </ScreenContainer>
  );
}
