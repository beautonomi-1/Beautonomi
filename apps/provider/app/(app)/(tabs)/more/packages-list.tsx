import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Alert,
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

interface PackagesResponse {
  packages: ServicePackage[];
}

export default function PackagesListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useApi<PackagesResponse | { data?: PackagesResponse }>(
    "/api/provider/packages"
  );

  const packagesList = (data as PackagesResponse)?.packages ?? (data as any)?.data?.packages ?? [];

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleCreatePackage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Create package",
      "Package creation with full editor is available on the web portal. Open the web app to create and edit packages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open web",
          onPress: () => {
            const base = process.env.EXPO_PUBLIC_APP_URL || "https://app.beautonomi.com";
            Linking.openURL(`${base}/provider/packages/new`).catch(() => {});
          },
        },
      ]
    );
  }, []);

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
        className={`mb-3 rounded-xl border border-gray-100 bg-white p-4 ${!pkg.is_active ? "opacity-60" : ""}`}
      >
        <View className="flex-row items-start justify-between">
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {pkg.name}
          </Text>
          {!pkg.is_active && (
            <View className="rounded bg-gray-200 px-2 py-0.5">
              <Text className="text-xs font-medium text-gray-600">Inactive</Text>
            </View>
          )}
        </View>
        {pkg.description ? (
          <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
            {pkg.description}
          </Text>
        ) : null}
        <Text className="mt-2 text-lg font-bold text-indigo-600">
          {formatCurrency(pkg.price, pkg.currency)}
        </Text>
        {pkg.discount_percentage != null && pkg.discount_percentage > 0 && (
          <Text className="mt-0.5 text-sm text-green-600">
            {pkg.discount_percentage}% discount
          </Text>
        )}
        <View className="mt-2 border-t border-gray-100 pt-2">
          <Text className="text-xs font-medium text-gray-500">Includes</Text>
          {pkg.items.slice(0, 3).map((item) => (
            <Text key={item.id} className="mt-0.5 text-sm text-gray-600" numberOfLines={1}>
              • {itemLabel(item)}
              {item.quantity > 1 ? ` (x${item.quantity})` : ""}
            </Text>
          ))}
          {pkg.items.length > 3 && (
            <Text className="mt-0.5 text-xs text-gray-400">
              +{pkg.items.length - 3} more
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
            className="h-10 min-w-[44px] flex-row items-center justify-center rounded-full bg-indigo-600 px-3"
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
          description="Create service packages to offer bundled services at discounted rates. Use the web app to create and edit packages."
          actionLabel="Create package (web)"
          onAction={handleCreatePackage}
        />
      ) : (
        <FlatList
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
