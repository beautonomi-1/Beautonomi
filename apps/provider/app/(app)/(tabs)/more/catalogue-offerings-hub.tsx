import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type Service = {
  id: string;
  title: string;
  description?: string | null;
  price?: number;
  duration_minutes?: number;
  provider_categories?: { name?: string } | null;
};

export default function CatalogueOfferingsHubScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Service[] | { data?: Service[] }>(
    "/api/provider/services"
  );

  const services: Service[] = Array.isArray(data) ? data : (data as { data?: Service[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Catalogue & offerings"
        subtitle="Services, products & packages"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {services.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="layers-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No services yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              Add your first service in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/catalogue" as never)}
              style={{ borderRadius: 12, backgroundColor: "#db2777", paddingHorizontal: 24, paddingVertical: 12 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>Add service</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {services.map((s) => (
              <View
                key={s.id}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{s.title}</Text>
                {s.provider_categories?.name && (
                  <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{s.provider_categories.name}</Text>
                )}
                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap" }}>
                  {typeof s.price === "number" && (
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginRight: 12 }}>{tenantCurrency} {s.price.toLocaleString()}</Text>
                  )}
                  {s.duration_minutes != null && (
                    <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{s.duration_minutes} min</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
