import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView } from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";

export default function MembershipScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/membership");
      if (res.error) setError(res.error.message || "Failed to load");
      else setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
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
                Alert.alert("Error", res.error.message || "Failed to cancel");
              } else {
                await load();
              }
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to cancel");
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
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {hasMembership ? (
          <View className="gap-4">
            <View className="bg-pink-50 rounded-2xl p-4">
              <Text className="text-sm text-gray-600">Active membership</Text>
              <Text className="text-xl font-bold text-gray-900 mt-1">{membership?.name}</Text>
              {membership?.description && (
                <Text className="text-gray-700 mt-2">{membership.description}</Text>
              )}
              <Text className="text-sm text-gray-500 mt-2">
                {membership?.billing_cycle === "yearly" ? "Billed yearly" : "Billed monthly"}
                {membership?.expires_at && ` · Renews ${new Date(membership.expires_at).toLocaleDateString()}`}
              </Text>
            </View>
            {benefits.length > 0 && (
              <View>
                <Text className="font-semibold text-gray-900 mb-2">Benefits</Text>
                {benefits.map((b: any, i: number) => (
                  <View key={i} className="bg-gray-50 rounded-xl p-3 mb-2">
                    <Text className="font-medium text-gray-900">{b.name}</Text>
                    {b.description && <Text className="text-sm text-gray-600 mt-0.5">{b.description}</Text>}
                  </View>
                ))}
              </View>
            )}
            {(savings.this_month > 0 || savings.lifetime > 0) && (
              <View className="bg-green-50 rounded-xl p-4">
                <Text className="font-semibold text-gray-900">Your savings</Text>
                <Text className="text-gray-700 mt-1">
                  This month: ZAR {savings.this_month?.toFixed(2) ?? "0.00"}
                </Text>
                <Text className="text-gray-700">Lifetime: ZAR {savings.lifetime?.toFixed(2) ?? "0.00"}</Text>
              </View>
            )}
            {membership?.auto_renew !== false && (
              <TouchableOpacity
                onPress={cancelMembership}
                disabled={cancelling}
                className="py-3 border border-red-500 rounded-xl items-center"
              >
                <Text className="text-red-600 font-medium">{cancelling ? "Cancelling..." : "Cancel membership"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="gap-4">
            <View className="bg-gray-50 rounded-2xl p-4">
              <Text className="text-sm text-gray-600">No active membership</Text>
              <Text className="text-gray-700 mt-1">
                Browse provider profiles to see membership plans and subscribe.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
