import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatCurrency } from "@/lib/format";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type CustomRequest = {
  id: string;
  description?: string | null;
  status?: string | null;
  created_at: string;
  currency?: string | null;
  location_type?: string | null;
  duration_minutes?: number | null;
  preferred_start_at?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
  offers?: { status?: string; price?: number; currency?: string; expiration_at?: string; created_at?: string }[];
};

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function CustomRequestsListScreen() {
  const { t } = useTranslation();
  const cr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.customRequests." + key, opts) as string,
    [t],
  );
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const customRequestsUrl = selectedLocationId
    ? `/api/provider/custom-requests?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/custom-requests";
  const { data, loading, error, refresh } = useApi<CustomRequest[] | { data?: CustomRequest[] }>(
    customRequestsUrl
  );

  const requests: CustomRequest[] = Array.isArray(data)
    ? data
    : (data as { data?: CustomRequest[] })?.data && Array.isArray((data as { data?: CustomRequest[] }).data)
      ? (data as { data: CustomRequest[] }).data
      : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={cr("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={cr("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={cr("title")}
        subtitle={cr("subtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {requests.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="chatbox-ellipses-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>{cr("emptyTitle")}</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {cr("emptyDesc")}
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {requests.map((r) => {
                const offers = r.offers ?? [];
                const paidOffer = offers.find((o) => o.status === "paid");
                const pendingOffer = offers.find((o) => o.status === "pending" && !(o.expiration_at && new Date(o.expiration_at).getTime() < Date.now()));
                const allWithdrawnOrExpired = offers.length > 0 && offers.every((o) => o.status === "withdrawn" || o.status === "expired" || (o.expiration_at && new Date(o.expiration_at).getTime() < Date.now()));

                const offerBadge = paidOffer
                  ? { label: cr("booked"), bg: "#DCFCE7", text: "#166534" }
                  : pendingOffer
                  ? { label: cr("offerSent", { amount: formatCurrency(Number(pendingOffer.price ?? 0), pendingOffer.currency ?? r.currency ?? "") }), bg: "#EFF6FF", text: "#1E40AF" }
                  : allWithdrawnOrExpired
                  ? { label: cr("offerWithdrawnExpired"), bg: "#FEF3C7", text: "#92400E" }
                  : offers.length === 0
                  ? { label: cr("noOfferYet"), bg: Colors.gray[100], text: Colors.gray[500] }
                  : null;

                return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/(app)/(tabs)/more/custom-requests/${r.id}`)}
                  style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1, marginEnd: 8 }} numberOfLines={1}>
                      {r.customer?.full_name ?? r.customer?.email ?? cr("customerFallback")}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {r.status ? (
                        <View style={{ marginEnd: 8, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: r.status === "cancelled" ? "#FEE2E2" : Colors.gray[100] }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: r.status === "cancelled" ? "#B91C1C" : Colors.gray[700], textTransform: "capitalize" }}>
                            {String(r.status)}
                          </Text>
                        </View>
                      ) : null}
                      <DirectionalIcon name="chevron-forward" size={20} color="#9ca3af" />
                    </View>
                  </View>
                  {r.description ? (
                    <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }} numberOfLines={2}>
                      {r.description}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                      {formatDateSafe(r.created_at)}
                      {r.location_type === "at_home" ? ` · ${cr("atHome")}` : ` · ${cr("atSalon")}`}
                      {(r.budget_min != null || r.budget_max != null) &&
                        cr("budgetRange", {
                          min: formatCurrency(Number(r.budget_min ?? 0), r.currency ?? undefined),
                          max: formatCurrency(Number(r.budget_max ?? 0), r.currency ?? undefined),
                        })}
                    </Text>
                    {offerBadge ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: offerBadge.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: offerBadge.text }}>{offerBadge.label}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
                );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
