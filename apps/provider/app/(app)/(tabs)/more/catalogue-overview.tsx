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
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { LAST_RESORT_CURRENCY } from "@beautonomi/utils";
import { formatCurrency } from "@/lib/format";

function currencySymbol(currency: string | undefined): string {
  const c = currency || getTenantDefaultCurrency();
  return c === LAST_RESORT_CURRENCY ? "R" : c;
}

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

interface ServicePackageRow {
  id: string;
  name: string;
}

interface PackagesListResponse {
  packages?: ServicePackageRow[];
}

export default function CatalogueOverviewScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [viewService, setViewService] = useState<ServiceItem | null>(null);
  const [serviceDetail, setServiceDetail] = useState<ServiceItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { data: servicesList, loading: loadingServices, error: servicesError, refresh: refreshServices } =
    useApi<ServiceItem[]>("/api/provider/services");
  const { data: productsData, refresh: refreshProducts } =
    useApi<ProductsResponse>("/api/provider/products?limit=5");
  const { data: packagesData, refresh: refreshPackages } =
    useApi<PackagesListResponse | { data?: PackagesListResponse }>("/api/provider/packages");

  const services: ServiceItem[] = Array.isArray(servicesList) ? servicesList : [];
  const products = productsData?.products ?? [];
  const productsTotal = productsData?.total ?? 0;
  const packagesList =
    (packagesData as PackagesListResponse)?.packages ??
    (packagesData as { data?: PackagesListResponse })?.data?.packages ??
    [];
  const packagesTotal = packagesList.length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshServices(), refreshProducts(), refreshPackages()]);
    setRefreshing(false);
  }, [refreshServices, refreshProducts, refreshPackages]);

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

  const goToPackages = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/packages-list" as never);
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (servicesError && services.length === 0) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={servicesError} onRetry={onRefresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Catalogue" showBack subtitle="Services, packages & products" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 24 }}>
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", color: Colors.gray[500] }}>Services</Text>
            {services.length > 0 && (
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{services.length} service{services.length !== 1 ? "s" : ""}</Text>
            )}
          </View>
          {services.length === 0 ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 24 }}>
              <View style={{ marginBottom: 8, height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fce7f3" }}>
                <Ionicons name="cut-outline" size={24} color="#ec4899" />
              </View>
              <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>No services yet</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }}>Add services in the portal to show them here.</Text>
            </View>
          ) : (
            services.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => openServiceDetail(s)}
                activeOpacity={0.7}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fce7f3" }}>
                  <Ionicons name="cut-outline" size={20} color="#ec4899" />
                </View>
                <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>{s.title}</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                    {currencySymbol(s.currency)} {Number(s.price).toFixed(2)}
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

        <View style={{ marginBottom: 24 }}>
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", color: Colors.gray[500] }}>Packages</Text>
            {packagesTotal > 0 && (
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                {packagesTotal} package{packagesTotal !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={goToPackages}
            activeOpacity={0.7}
            style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
          >
            <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#e0e7ff" }}>
              <Ionicons name="layers-outline" size={20} color="#4f46e5" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Service packages</Text>
              <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
                {packagesTotal === 0
                  ? "Create bundles of services and retail"
                  : `View all ${packagesTotal} package${packagesTotal !== 1 ? "s" : ""}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
          {packagesList.length > 0 && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", paddingHorizontal: 12, paddingVertical: 8 }}>
              {packagesList.slice(0, 3).map((p) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[700] }} numberOfLines={1}>{p.name}</Text>
                </View>
              ))}
              {packagesTotal > 3 && (
                <Text style={{ paddingVertical: 4, fontSize: 12, color: Colors.gray[500] }}>+{packagesTotal - 3} more</Text>
              )}
            </View>
          )}
        </View>

        <View style={{ marginBottom: 8 }}>
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", color: Colors.gray[500] }}>Products</Text>
            {productsTotal > 0 && (
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{productsTotal} product{productsTotal !== 1 ? "s" : ""}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={goToProducts}
            activeOpacity={0.7}
            style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
          >
            <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ede9fe" }}>
              <Ionicons name="cube-outline" size={20} color="#8b5cf6" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Products & inventory</Text>
              <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
                {productsTotal === 0 ? "Add and manage products" : `View all ${productsTotal} product${productsTotal !== 1 ? "s" : ""}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
          {products.length > 0 && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", paddingHorizontal: 12, paddingVertical: 8 }}>
              {products.slice(0, 3).map((p) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[700] }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>{formatCurrency(Number(p.retail_price))}</Text>
                </View>
              ))}
              {productsTotal > 3 && (
                <Text style={{ paddingVertical: 4, fontSize: 12, color: Colors.gray[500] }}>+{productsTotal - 3} more</Text>
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
          subtitle={`${currencySymbol(viewService.currency)} ${Number(viewService.price).toFixed(2)} · ${viewService.duration_minutes} min`}
        >
          {loadingDetail ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          ) : serviceDetail ? (
            <>
              {serviceDetail.description ? (
                <Text style={{ marginBottom: 12, fontSize: 14, color: Colors.gray[600] }}>{serviceDetail.description}</Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={{ borderRadius: 9999, backgroundColor: Colors.gray[100], paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700] }}>{serviceDetail.duration_minutes} min</Text>
                </View>
                {serviceDetail.buffer_minutes ? (
                  <View style={{ borderRadius: 9999, backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#92400e" }}>+{serviceDetail.buffer_minutes} min buffer</Text>
                  </View>
                ) : null}
                {categoryName(serviceDetail) ? (
                  <View style={{ borderRadius: 9999, backgroundColor: "#fce7f3", paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#9d174d" }}>{categoryName(serviceDetail)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ marginTop: 16, fontSize: 12, color: Colors.gray[500] }}>Edit service details from your in-app catalogue management flow.</Text>
            </>
          ) : null}
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
