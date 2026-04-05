import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type ProviderMembership = {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  discount_percent: number;
  price_monthly: number;
  currency: string;
  expires_at: string | null;
  started_at: string;
};

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function MembershipScreen() {
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/membership");
      if (res.error) setError(getApiErrorMessage(res.error, "Failed to load"));
      else setData(res.data);
    } catch (e) {
      setError(getApiErrorMessage(e as Error, "Failed to load"));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const cancelMembership = () => {
    Alert.alert(
      "Cancel membership",
      "Your benefits will continue until your current period ends. You won't be charged again.",
      [
        { text: "Keep membership", style: "cancel" },
        {
          text: "Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await api.post("/api/me/membership/cancel", {});
              if (res.error) {
                Alert.alert("Error", getApiErrorMessage(res.error, "Failed to cancel"));
              } else {
                await load();
              }
            } catch (e) {
              Alert.alert("Error", getApiErrorMessage(e as Error, "Failed to cancel"));
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const hasMembership = data?.has_membership && data?.membership;
  const membership = data?.membership;
  const benefits = data?.benefits ?? [];
  const savings = data?.savings ?? { this_month: 0, lifetime: 0 };
  const savingsCurrency =
    (typeof data?.savings_currency === "string" && data.savings_currency) ||
    membership?.currency ||
    getTenantDefaultCurrency();
  const providerMemberships: ProviderMembership[] = Array.isArray(data?.provider_memberships) ? data.provider_memberships : [];
  const hasSalonMemberships = providerMemberships.length > 0;

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        {hasMembership ? (
          <View>
            <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Active membership</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{membership?.name}</Text>
              {membership?.description && (
                <Text style={{ color: Colors.gray[700], marginTop: 8 }}>{membership.description}</Text>
              )}
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 8 }}>
                {membership?.billing_cycle === "yearly" ? "Billed yearly" : "Billed monthly"}
                {membership?.expires_at && ` · Renews ${formatDateSafe(membership.expires_at)}`}
              </Text>
            </View>
            {benefits.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Benefits</Text>
                {benefits.map((b: any, i: number) => (
                  <View key={i} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12, marginBottom: 8 }}>
                    <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{b.name}</Text>
                    {b.description && <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>{b.description}</Text>}
                  </View>
                ))}
              </View>
            )}
            {(savings.this_month > 0 || savings.lifetime > 0) && (
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 16, marginTop: 16 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Your savings</Text>
                <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                  This month: {savingsCurrency} {savings.this_month?.toFixed(2) ?? "0.00"}
                </Text>
                <Text style={{ color: Colors.gray[700] }}>Lifetime: {savingsCurrency} {savings.lifetime?.toFixed(2) ?? "0.00"}</Text>
              </View>
            )}
            {membership?.auto_renew !== false && (
              <TouchableOpacity
                onPress={cancelMembership}
                disabled={cancelling}
                style={{ marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#DC2626", fontWeight: "500" }}>{cancelling ? "Cancelling..." : "Cancel membership"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : hasSalonMemberships ? (
          <View>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>No platform membership</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                Your active salon memberships are listed below.
              </Text>
            </View>
          </View>
        ) : null}

        {hasSalonMemberships && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>Salon memberships</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
              Your active memberships with providers. You get the listed discount on bookings at each salon.
            </Text>
            {providerMemberships.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                onPress={() => pm.provider_slug && router.push({ pathname: "/(app)/partner-profile", params: { slug: pm.provider_slug } })}
                activeOpacity={0.8}
                style={{
                  backgroundColor: Colors.white,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{pm.provider_name}</Text>
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[800], marginTop: 4 }}>{pm.plan_name}</Text>
                {pm.plan_description ? (
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 4 }} numberOfLines={2}>{pm.plan_description}</Text>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 12 }}>
                  {pm.discount_percent > 0 && (
                    <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "600" }}>{pm.discount_percent}% off services</Text>
                  )}
                  {pm.expires_at && (
                    <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                      Expires {formatDateSafe(pm.expires_at)}
                    </Text>
                  )}
                </View>
                {pm.provider_slug && (
                  <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 8, fontWeight: "500" }}>View provider →</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!hasMembership && !hasSalonMemberships && (
          <View style={{ marginTop: 16 }}>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>No memberships yet</Text>
              <Text style={{ color: Colors.gray[700], marginTop: 4 }}>
                Browse provider profiles to see membership plans and subscribe.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
