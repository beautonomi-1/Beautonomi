import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView, Platform } from "react-native";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

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

  useEffect(() => {
    load();
  }, []);

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
                {membership?.expires_at && ` · Renews ${new Date(membership.expires_at).toLocaleDateString()}`}
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
                  This month: ZAR {savings.this_month?.toFixed(2) ?? "0.00"}
                </Text>
                <Text style={{ color: Colors.gray[700] }}>Lifetime: ZAR {savings.lifetime?.toFixed(2) ?? "0.00"}</Text>
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
        ) : (
          <View>
            <View style={{ backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>No active membership</Text>
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
