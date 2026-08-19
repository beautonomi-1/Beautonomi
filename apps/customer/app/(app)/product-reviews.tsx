/**
 * Customer product reviews list screen.
 *
 * §Customer-audit 2026-04 (follow-up): the PDP only shows the 3 most recent
 * reviews. The public API `/api/products/:id/reviews` already paginates the
 * full list and supports `sort=newest|highest|lowest|helpful`, so we expose
 * it as a dedicated screen reachable from the "See all reviews" CTA on the
 * PDP.
 *
 * Design choices:
 * - Uses the public (unauthenticated) endpoint so visitors can browse reviews
 *   without logging in, matching web behavior.
 * - Sort chips are a simple horizontal FilterChipGroup-style row — we do NOT
 *   persist the choice, it is a per-view filter.
 * - Infinite scroll via FlatList `onEndReached`; each page appends to the
 *   list. When sort changes we reset to page 1.
 * - Graceful handling for the empty state, network errors, and the case
 *   where the product has no reviews yet (distinct copy per case).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import { ContentReportSheet } from "@/components/safety/ContentReportSheet";

type SortKey = "newest" | "highest" | "lowest" | "helpful";

interface Review {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  image_urls?: string[] | null;
  is_verified_purchase?: boolean;
  helpful_count?: number;
  provider_response?: string | null;
  provider_response_at?: string | null;
  created_at: string;
  customer?: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

interface ReviewsResponse {
  reviews: Review[];
  summary: {
    average_rating: number;
    total_count: number;
    distribution: Record<string, number>;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest" },
  { value: "lowest", label: "Lowest" },
  { value: "helpful", label: "Most helpful" },
];

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductReviewsScreen() {
  const { contentPadding } = useResponsive();
  const { user } = useAuth();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [sort, setSort] = useState<SortKey>("newest");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewsResponse["summary"] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);

  const openReportReview = useCallback(
    (reviewId: string) => {
      if (!user) {
        Alert.alert(
          t("customer.contentReport.signInTitle"),
          t("customer.contentReport.signInBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () =>
                pushCustomerLogin(
                  productId
                    ? `/(app)/product-reviews?id=${encodeURIComponent(productId)}`
                    : "/(app)/(tabs)/shop",
                ) },
          ],
        );
        return;
      }
      setReportReviewId(reviewId);
    },
    [t, user],
  );

  const fetchTokenRef = useRef(0);

  const load = useCallback(
    async (opts: { page: number; sort: SortKey; mode: "replace" | "append" | "refresh" }) => {
      if (!productId) return;
      const token = ++fetchTokenRef.current;
      if (opts.mode === "append") setLoadingMore(true);
      else if (opts.mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          page: String(opts.page),
          limit: String(PAGE_SIZE),
          sort: opts.sort,
        });
        const res = await api.get<ReviewsResponse>(
          `/api/products/${encodeURIComponent(productId)}/reviews?${qs.toString()}`
        );
        if (token !== fetchTokenRef.current) return;
        if (res.error) {
          setError(res.error.message || "Failed to load reviews");
          if (opts.mode !== "append") {
            setReviews([]);
            setSummary(null);
          }
          return;
        }
        const data = (res.data as ReviewsResponse) ?? null;
        if (!data) return;
        setSummary(data.summary);
        setTotalPages(data.pagination.totalPages || 1);
        if (opts.mode === "append") {
          setReviews((prev) => [...prev, ...(data.reviews ?? [])]);
        } else {
          setReviews(data.reviews ?? []);
        }
      } catch (e) {
        if (token !== fetchTokenRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load reviews");
      } finally {
        if (token !== fetchTokenRef.current) return;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    setPage(1);
    load({ page: 1, sort, mode: "replace" });
  }, [productId, sort, load]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    load({ page: 1, sort, mode: "refresh" });
  }, [load, sort]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing) return;
    if (page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    load({ page: next, sort, mode: "append" });
  }, [loading, loadingMore, refreshing, page, totalPages, sort, load]);

  const distribution = useMemo(() => {
    if (!summary) return [] as { stars: number; count: number; pct: number }[];
    const total = summary.total_count || 0;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = Number(summary.distribution?.[String(stars)] ?? 0);
      return { stars, count, pct: total > 0 ? (count / total) * 100 : 0 };
    });
  }, [summary]);

  const keyExtractor = useCallback((r: Review) => r.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Review }) => {
      return (
        <View
          style={{
            backgroundColor: Colors.white,
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: Colors.gray[100],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            {item.customer?.avatar_url ? (
              <Image
                source={{ uri: item.customer.avatar_url }}
                style={{ width: 28, height: 28, borderRadius: 14, marginRight: 10 }}
              />
            ) : (
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  marginRight: 10,
                  backgroundColor: Colors.gray[100],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="person-outline" size={14} color={Colors.gray[500]} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[900] }}>
                {item.customer?.full_name ?? "Customer"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= item.rating ? "star" : "star-outline"}
                    size={12}
                    color="#F59E0B"
                    style={{ marginRight: 2 }}
                  />
                ))}
                <Text style={{ marginLeft: 6, fontSize: 11, color: Colors.gray[500] }}>
                  {formatDateSafe(item.created_at)}
                  {item.is_verified_purchase ? " · Verified" : ""}
                </Text>
              </View>
            </View>
            {(item.helpful_count ?? 0) > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: "#EFF6FF",
                }}
              >
                <Ionicons name="thumbs-up-outline" size={12} color="#1D4ED8" />
                <Text style={{ fontSize: 11, color: "#1D4ED8", marginLeft: 4 }}>
                  {item.helpful_count}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => openReportReview(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t("customer.contentReport.reportProductReview")}
              accessibilityRole="button"
            >
              <Ionicons name="flag-outline" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>
          {item.title ? (
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 2 }}>
              {item.title}
            </Text>
          ) : null}
          {item.comment ? (
            <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 19 }}>
              {item.comment}
            </Text>
          ) : null}
          {item.provider_response ? (
            <View
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                backgroundColor: Colors.gray[50],
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], marginBottom: 2 }}>
                Provider response
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[700], lineHeight: 18 }}>
                {item.provider_response}
              </Text>
            </View>
          ) : null}
        </View>
      );
    },
    [openReportReview, t],
  );

  const ListHeader = useMemo(
    () => (
      <View style={{ marginBottom: 12 }}>
        {summary && summary.total_count > 0 ? (
          <View
            style={{
              backgroundColor: Colors.white,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ alignItems: "center", marginRight: 16 }}>
                <Text style={{ fontSize: 32, fontWeight: "700", color: Colors.gray[900] }}>
                  {summary.average_rating.toFixed(1)}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 2 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons
                      key={n}
                      name={n <= Math.round(summary.average_rating) ? "star" : "star-outline"}
                      size={14}
                      color="#F59E0B"
                      style={{ marginRight: 1 }}
                    />
                  ))}
                </View>
                <Text style={{ marginTop: 4, fontSize: 11, color: Colors.gray[500] }}>
                  {summary.total_count} reviews
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {distribution.map((row) => (
                  <View key={row.stars} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                    <Text style={{ width: 14, fontSize: 11, color: Colors.gray[600] }}>{row.stars}</Text>
                    <Ionicons name="star" size={10} color="#F59E0B" style={{ marginRight: 6 }} />
                    <View
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: Colors.gray[100],
                        overflow: "hidden",
                      }}
                    >
                      <View style={{ width: `${row.pct}%`, height: 6, backgroundColor: "#F59E0B" }} />
                    </View>
                    <Text style={{ width: 26, textAlign: "right", fontSize: 11, color: Colors.gray[500] }}>
                      {row.count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 2 }}>
          {SORT_OPTIONS.map((opt) => {
            const active = opt.value === sort;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSort(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? Colors.primary : Colors.gray[200],
                  backgroundColor: active ? Colors.primary : Colors.white,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: active ? Colors.white : Colors.gray[700],
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    ),
    [summary, distribution, sort]
  );

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <Ionicons name="alert-circle-outline" size={28} color={Colors.gray[400]} />
          <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray[600] }}>{error}</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{
              marginTop: 12,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: Colors.primary,
            }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ alignItems: "center", paddingVertical: 40 }}>
        <Ionicons name="chatbubble-ellipses-outline" size={28} color={Colors.gray[400]} />
        <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>
          No reviews yet
        </Text>
        <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500], textAlign: "center" }}>
          Be the first to share what you think.
        </Text>
      </View>
    );
  }, [loading, error, handleRefresh]);

  const ListFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 18, alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
    return null;
  }, [loadingMore]);

  if (!productId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Reviews" }} />
        <Ionicons name="alert-circle-outline" size={28} color={Colors.gray[400]} />
        <Text style={{ marginTop: 8, color: Colors.gray[600] }}>Missing product id.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.primary }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <Stack.Screen options={{ title: "Reviews" }} />
      <FlatList
        {...verticalFlatListPerf}
        data={reviews}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      />
      {reportReviewId ? (
        <ContentReportSheet
          visible
          onClose={() => setReportReviewId(null)}
          targetType="product_review"
          targetId={reportReviewId}
          title={t("customer.contentReport.reportProductReview")}
        />
      ) : null}
    </SafeAreaView>
  );
}
