import { useState, useCallback } from "react";
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
import { Colors } from "@/constants/colors";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface ServiceCategory {
  id: string;
  name: string;
  color?: string | null;
  display_order?: number;
}

interface ServiceItem {
  id: string;
  title?: string;
  name?: string;
  provider_category_id?: string | null;
  duration_minutes?: number;
  price?: number;
  service_type?: string;
  is_active?: boolean;
}

interface CategoriesResponse {
  data?: { own_categories?: ServiceCategory[] };
  own_categories?: ServiceCategory[];
}

export default function ServicesCatalogueScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: categoriesData, loading: loadingCat, error: errorCat, refresh: refreshCat } = useApi<CategoriesResponse>(
    "/api/provider/categories"
  );
  const { data: services, loading: loadingSvc, error: errorSvc, refresh: refreshSvc } = useApi<ServiceItem[]>(
    "/api/provider/services?include_inactive=true"
  );

  const categoriesRaw =
    categoriesData?.own_categories ??
    (categoriesData && typeof categoriesData === "object" && "data" in categoriesData
      ? (categoriesData as { data?: { own_categories?: ServiceCategory[] } }).data?.own_categories
      : undefined) ??
    [];
  const categories = [...categoriesRaw].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const rawServices = services;
  const servicesList = Array.isArray(rawServices)
    ? rawServices
    : rawServices && typeof rawServices === "object" && "data" in rawServices && Array.isArray((rawServices as { data: ServiceItem[] }).data)
      ? (rawServices as { data: ServiceItem[] }).data
      : [];

  useFocusEffect(
    useCallback(() => {
      refreshCat();
      refreshSvc();
    }, [refreshCat, refreshSvc])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshCat(), refreshSvc()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCat, refreshSvc]);

  const handleAddService = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/service-form" as never);
  }, [router]);

  const handleEditService = useCallback(
    (service: ServiceItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(app)/(tabs)/more/service-form?id=${service.id}` as never);
    },
    [router]
  );

  const loading = loadingCat || loadingSvc;
  const error = errorCat || errorSvc;

  // Group services by category (and uncategorized)
  const byCategory = new Map<string, ServiceItem[]>();
  for (const cat of categories) {
    byCategory.set(cat.id, []);
  }
  byCategory.set("__none__", []);
  for (const svc of servicesList) {
    const catId = svc.provider_category_id ?? "__none__";
    if (!byCategory.has(catId)) byCategory.set(catId, []);
    byCategory.get(catId)!.push(svc);
  }

  const sections: { category: ServiceCategory | null; services: ServiceItem[] }[] = [];
  for (const cat of categories) {
    const list = byCategory.get(cat.id) ?? [];
    if (list.length > 0) sections.push({ category: cat, services: list });
  }
  const uncategorized = byCategory.get("__none__") ?? [];
  if (uncategorized.length > 0) {
    sections.push({
      category: { id: "__none__", name: "Uncategorized", color: "#9ca3af" },
      services: uncategorized,
    });
  }
  if (categories.length === 0 && servicesList.length > 0) {
    sections.push({
      category: { id: "all", name: "All services", color: Colors.primary },
      services: servicesList,
    });
  }

  const renderServiceRow = (item: ServiceItem) => (
    <TouchableOpacity
      key={item.id}
      style={twStyle("flex-row items-center border-b border-gray-100 py-3.5")}
      onPress={() => handleEditService(item)}
      accessibilityLabel={`Edit ${item.title || item.name}`}
    >
      <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-gray-100")}>
        <Ionicons name="cut-outline" size={20} color="#6b7280" />
      </View>
      <View style={twStyle("ml-3 flex-1")}>
        <Text style={twStyle("text-base font-medium text-gray-900")} numberOfLines={1}>
          {item.title || item.name || "Unnamed service"}
        </Text>
        <View style={twStyle("mt-0.5 flex-row items-center")}>
          <Text style={[twStyle("text-sm font-medium text-indigo-600"), { marginRight: 8 }]}>
            {formatCurrency(item.price ?? 0)}
          </Text>
          <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 8 }]}>
            {item.duration_minutes ?? 0} min
          </Text>
          {item.service_type && item.service_type !== "basic" && (
            <Text style={twStyle("text-xs text-gray-500 capitalize")}>{item.service_type}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
    </TouchableOpacity>
  );

  if (loading && !categories.length && !servicesList.length) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Services" subtitle="Catalogue & pricing" onBack={() => router.back()} />
        <SkeletonList rows={8} />
      </ScreenContainer>
    );
  }

  if (error && !categories.length && !servicesList.length) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Services" subtitle="Catalogue & pricing" onBack={() => router.back()} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Services"
        subtitle="Catalogue & pricing"
        onBack={() => router.back()}
        rightAction={
          <View style={twStyle("flex-row items-center")}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/catalogue" as never)}
              style={[twStyle("h-10 min-w-[44px] flex-row items-center justify-center rounded-full bg-gray-100 px-3"), { marginRight: 8 }]}
              accessibilityLabel="Advanced pricing rules"
              accessibilityRole="button"
            >
              <Ionicons name="pricetags-outline" size={18} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddService}
              style={twStyle("h-10 min-w-[44px] flex-row items-center justify-center rounded-full bg-indigo-600 px-3")}
              accessibilityLabel="Add service"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      {sections.length === 0 && servicesList.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title="No services"
          description="Add your first service to appear in bookings and on your profile"
          actionLabel="Add service"
          onAction={handleAddService}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={sections}
          keyExtractor={(s: { category: ServiceCategory | null; services: ServiceItem[] }) => s.category?.id ?? "section"}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item: section }: { item: { category: ServiceCategory | null; services: ServiceItem[] } }) => (
            <View style={twStyle("mb-4")}>
              <View
                style={[twStyle("mb-2 flex-row items-center px-1"), {
                  borderLeftWidth: 4,
                  borderLeftColor: (section.category?.color as string) || "#ec4899",
                  paddingLeft: 8,
                }]}
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {section.category?.name ?? "Services"}
                </Text>
                <Text style={twStyle("ml-2 text-xs text-gray-500")}>
                  {section.services.length} service{section.services.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={twStyle("rounded-xl border border-gray-100 bg-white overflow-hidden")}>
                {section.services.map((svc: ServiceItem) => renderServiceRow(svc))}
              </View>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
