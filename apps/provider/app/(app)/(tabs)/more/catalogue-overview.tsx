import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface ServiceCategory {
  id: string;
  name: string;
  slug?: string;
  color?: string | null;
  description?: string | null;
}

interface ServiceItem {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes?: number;
  price: number;
  currency: string;
  is_active: boolean;
  provider_id: string;
  provider_categories?: ServiceCategory | ServiceCategory[] | null;
}

interface ProductsResponse {
  products?: { id: string; name: string; retail_price: number; category?: string | null }[];
  total?: number;
}

export default function CatalogueOverviewScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [viewService, setViewService] = useState<ServiceItem | null>(null);
  const [serviceDetail, setServiceDetail] = useState<ServiceItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { data: servicesList, loading: loadingServices, error: servicesError, refresh: refreshServices } =
    useApi<ServiceItem[]>("/api/provider/services");
  const { data: productsData, refresh: refreshProducts } =
    useApi<ProductsResponse>("/api/provider/products?limit=5");

  const services: ServiceItem[] = Array.isArray(servicesList) ? servicesList : [];
  const products = productsData?.products ?? [];
  const productsTotal = productsData?.total ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshServices(), refreshProducts()]);
    setRefreshing(false);
  }, [refreshServices, refreshProducts]);

  const openServiceDetail = useCallback(async (service: ServiceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewService(service);
    setServiceDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<ServiceItem>(`/api/provider/services/${service.id}`);
      if (res.data) setServiceDetail(res.data);
      else setServiceDetail(service);
    } catch {
      setServiceDetail(service);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const goToProducts = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/products" as never);
  }, [router]);

  const categoryName = (s: ServiceItem): string => {
    const cat = s.provider_categories;
    if (!cat) return "";
    const c = Array.isArray(cat) ? cat[0] : cat;
    return c?.name ?? "";
  };

  if (loadingServices && services.length === 0) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (servicesError && services.length === 0) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={servicesError} onRetry={onRefresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Catalogue" showBack subtitle="Services & products" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Services
            </Text>
            {services.length > 0 && (
              <Text className="text-sm text-gray-500">
                {services.length} service{services.length !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
          {services.length === 0 ? (
            <View className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
              <View className="mb-2 h-12 w-12 items-center justify-center rounded-xl bg-pink-100">
                <Ionicons name="cut-outline" size={24} color="#ec4899" />
              </View>
              <Text className="font-medium text-gray-900">No services yet</Text>
              <Text className="mt-1 text-sm text-gray-500">
                Add services in the portal to show them here.
              </Text>
            </View>
          ) : (
            services.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => openServiceDetail(s)}
                activeOpacity={0.7}
                className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-pink-100">
                  <Ionicons name="cut-outline" size={20} color="#ec4899" />
                </View>
                <View className="ml-3 flex-1 min-w-0">
                  <Text className="font-semibold text-gray-900" numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text className="mt-0.5 text-sm text-gray-600">
                    {s.currency === "ZAR" ? "R" : s.currency} {Number(s.price).toFixed(2)}
                    {" · "}
                    {s.duration_minutes} min
                    {categoryName(s) ? ` · ${categoryName(s)}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))
          )}
        </View>

        <View className="mb-2">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Products
            </Text>
            {productsTotal > 0 && (
              <Text className="text-sm text-gray-500">
                {productsTotal} product{productsTotal !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={goToProducts}
            activeOpacity={0.7}
            className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <Ionicons name="cube-outline" size={20} color="#8b5cf6" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-gray-900">Products & inventory</Text>
              <Text className="mt-0.5 text-sm text-gray-500">
                {productsTotal === 0
                  ? "Add and manage products"
                  : `View all ${productsTotal} product${productsTotal !== 1 ? "s" : ""}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
          {products.length > 0 && (
            <View className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2">
              {products.slice(0, 3).map((p) => (
                <View key={p.id} className="flex-row items-center py-2">
                  <Text className="flex-1 text-sm text-gray-700" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-sm font-medium text-gray-600">
                    R {Number(p.retail_price).toFixed(2)}
                  </Text>
                </View>
              ))}
              {productsTotal > 3 && (
                <Text className="py-1 text-xs text-gray-500">+{productsTotal - 3} more</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {viewService && (
        <BottomSheet
          visible={!!viewService}
          onClose={() => setViewService(null)}
          title={viewService.title}
          subtitle={`${viewService.currency === "ZAR" ? "R" : viewService.currency} ${Number(viewService.price).toFixed(2)} · ${viewService.duration_minutes} min`}
        >
          {loadingDetail ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          ) : serviceDetail ? (
            <>
              {serviceDetail.description ? (
                <Text className="mb-3 text-sm text-gray-600">
                  {serviceDetail.description}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <View className="rounded-full bg-gray-100 px-2.5 py-1">
                  <Text className="text-xs font-medium text-gray-700">
                    {serviceDetail.duration_minutes} min
                  </Text>
                </View>
                {serviceDetail.buffer_minutes ? (
                  <View className="rounded-full bg-amber-100 px-2.5 py-1">
                    <Text className="text-xs font-medium text-amber-800">
                      +{serviceDetail.buffer_minutes} min buffer
                    </Text>
                  </View>
                ) : null}
                {categoryName(serviceDetail) ? (
                  <View className="rounded-full bg-pink-100 px-2.5 py-1">
                    <Text className="text-xs font-medium text-pink-800">
                      {categoryName(serviceDetail)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="mt-4 text-xs text-gray-500">
                To edit this service, use the provider portal.
              </Text>
            </>
          ) : null}
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
