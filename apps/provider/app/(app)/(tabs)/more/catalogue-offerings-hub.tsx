import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { normalizePackagesList } from "@/lib/unpack-provider-api";

function countServices(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  const d = data as { data?: unknown[] } | null;
  return Array.isArray(d?.data) ? d.data.length : 0;
}

function countPackages(data: unknown): number {
  return normalizePackagesList(data).length;
}

function countProducts(data: unknown): number {
  const o = data as { total?: number; products?: unknown[] } | null;
  if (typeof o?.total === "number") return o.total;
  return Array.isArray(o?.products) ? o.products.length : 0;
}

export default function CatalogueOfferingsHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: servicesData, loading: loadingServices, error: servicesError, refresh: refreshServices } =
    useApi<unknown>("/api/provider/services");
  const { data: productsData, loading: loadingProducts, error: productsError, refresh: refreshProducts } =
    useApi<unknown>("/api/provider/products?limit=1");
  const { data: packagesData, loading: loadingPackages, error: packagesError, refresh: refreshPackages } =
    useApi<unknown>("/api/provider/packages");

  const loading = loadingServices || loadingProducts || loadingPackages;
  const error = servicesError || productsError || packagesError;
  const hasAnyData = servicesData != null || productsData != null || packagesData != null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshServices(), refreshProducts(), refreshPackages()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshServices, refreshProducts, refreshPackages]);

  const goServices = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/catalogue-overview" as never);
  }, [router]);

  const goProducts = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/products" as never);
  }, [router]);

  const goPackages = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/packages-list" as never);
  }, [router]);

  if (loading && !hasAnyData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !hasAnyData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={onRefresh} />
        </View>
      </ScreenContainer>
    );
  }

  const nServices = countServices(servicesData);
  const nProducts = countProducts(productsData);
  const nPackages = countPackages(packagesData);

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
        <Text style={{ marginBottom: 16, paddingHorizontal: 4, fontSize: 14, color: Colors.gray[600] }}>
          Manage what clients can book and buy. Open each area for the full list and editing tools.
        </Text>

        <TouchableOpacity
          onPress={goServices}
          activeOpacity={0.7}
          style={{
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 16,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#fce7f3",
            }}
          >
            <Ionicons name="cut-outline" size={22} color="#db2777" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Services</Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
              {nServices === 0 ? "Add and edit your service menu" : `${nServices} service${nServices !== 1 ? "s" : ""} in catalogue`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goPackages}
          activeOpacity={0.7}
          style={{
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 16,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#e0e7ff",
            }}
          >
            <Ionicons name="layers-outline" size={22} color="#4f46e5" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Packages</Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
              {nPackages === 0 ? "Bundles of services and retail" : `${nPackages} package${nPackages !== 1 ? "s" : ""}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goProducts}
          activeOpacity={0.7}
          style={{
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            padding: 16,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#ede9fe",
            }}
          >
            <Ionicons name="cube-outline" size={22} color="#8b5cf6" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Products</Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
              {nProducts === 0 ? "Retail and inventory" : `${nProducts} product${nProducts !== 1 ? "s" : ""}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
