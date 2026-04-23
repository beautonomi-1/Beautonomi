import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { Colors } from "@/constants/colors";
import { normalizePackagesList } from "@/lib/unpack-provider-api";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  quantity: number;
  offering?: { id: string; title: string; duration_minutes?: number; price?: number } | null;
  product?: { id: string; name: string; retail_price?: number; sku?: string | null } | null;
}

interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  discount_percentage: number | null;
  is_active: boolean;
  items: PackageItem[];
  created_at: string;
}

export default function PackagesListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useApi<unknown>("/api/provider/packages");

  const packagesList = useMemo(
    () => normalizePackagesList(data) as ServicePackage[],
    [data]
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleCreatePackage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/packages" as never);
  }, [router]);

  const renderPackageRow = (pkg: ServicePackage) => {
    const itemLabel = (item: PackageItem) => {
      if (item.offering) return item.offering.title;
      if (item.product) return item.product.name;
      if (item.offering_id) return "Service";
      if (item.product_id) return "Product";
      return "Item";
    };
    return (
      <View
        key={pkg.id}
        style={[
          { marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
          !pkg.is_active && { opacity: 0.6 },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
            {pkg.name}
          </Text>
          {!pkg.is_active && (
            <View style={{ borderRadius: 4, backgroundColor: Colors.gray[200], paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[600] }}>Inactive</Text>
            </View>
          )}
        </View>
        {pkg.description ? (
          <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }} numberOfLines={2}>
            {pkg.description}
          </Text>
        ) : null}
        <Text style={{ marginTop: 8, fontSize: 18, fontWeight: "700", color: "#4f46e6" }}>
          {formatCurrency(pkg.price, pkg.currency)}
        </Text>
        {pkg.discount_percentage != null && pkg.discount_percentage > 0 && (
          <Text style={{ marginTop: 2, fontSize: 14, color: "#16a34a" }}>
            {pkg.discount_percentage}% discount
          </Text>
        )}
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Includes</Text>
          {(pkg.items ?? []).slice(0, 3).map((item) => (
            <Text key={item.id} style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }} numberOfLines={1}>
              • {itemLabel(item)}
              {item.quantity > 1 ? ` (x${item.quantity})` : ""}
            </Text>
          ))}
          {(pkg.items ?? []).length > 3 && (
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[400] }}>
              +{(pkg.items ?? []).length - 3} more
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (loading && !packagesList.length) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Packages" subtitle="Bundled services & products" onBack={() => router.back()} />
        <SkeletonList rows={6} />
      </ScreenContainer>
    );
  }

  if (error && !packagesList.length) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Packages" subtitle="Bundled services & products" onBack={() => router.back()} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Packages"
        subtitle="Bundled services & products"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleCreatePackage}
            style={{ height: 40, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#4f46e6", paddingHorizontal: 12 }}
            accessibilityLabel="Create package"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />

      {packagesList.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="No packages"
          description="Create service packages to offer bundled services at discounted rates."
          actionLabel="Create package"
          onAction={handleCreatePackage}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={packagesList}
          keyExtractor={(p: ServicePackage) => p.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }: { item: ServicePackage }) => renderPackageRow(item)}
        />
      )}
    </ScreenContainer>
  );
}
