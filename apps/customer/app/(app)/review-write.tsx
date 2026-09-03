import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Platform, Keyboard } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { apiBookingReviewPath } from "@/lib/customer-api-paths";
import { trackReviewSubmitted } from "@/lib/analytics";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
export default function ReviewWriteScreen() {
  useScreenTracking("Review Write");
  const { t } = useTranslation();
  const rw = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.reviewWrite.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const writeReviewStackTitle = t("customer.mobile.stackTitles.writeReview");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const { bookingId, reviewId, rating: initRating, comment: initComment, provider_slug: providerSlugParam } =
    useLocalSearchParams<{
      bookingId?: string;
      reviewId?: string;
      rating?: string;
      comment?: string;
      /** Deep-link recovery when opening review without a booking context */
      provider_slug?: string;
    }>();
  const [rating, setRating] = useState(initRating ? parseInt(initRating, 10) : 0);
  const [comment, setComment] = useState(initComment || "");
  const [services, setServices] = useState<
    { offering_id: string; offering_name: string; staff_id?: string | null; staff_name?: string | null }[]
  >([]);
  const [serviceRatings, setServiceRatings] = useState<Record<string, number>>({});
  const [staffRatings, setStaffRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [androidKb, setAndroidKb] = useState(0);
  /** Set when `/api/me/reviews?booking_id=` returns a review (navigate with bookingId only). */
  const [hasExistingReview, setHasExistingReview] = useState(false);
  const isEdit = !!reviewId || hasExistingReview;

  const uniqueStaff = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) {
      if (s.staff_id) map.set(s.staff_id, s.staff_name || rw("staffFallback"));
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [services, rw]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const s = Keyboard.addListener("keyboardDidShow", (e) => {
      const h = e.endCoordinates?.height;
      setAndroidKb(typeof h === "number" && Number.isFinite(h) ? h : 0);
    });
    const h = Keyboard.addListener("keyboardDidHide", () => setAndroidKb(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    const loadContext = async () => {
      setLoadingContext(true);
      setHasExistingReview(false);
      try {
        const [bookingRes, reviewRes] = await Promise.all([
          api.get<any>(`/api/me/bookings/${bookingId}`),
          api.get<any>(`/api/me/reviews?booking_id=${bookingId}`),
        ]);
        if (cancelled) return;

        if (bookingRes.error) {
          Alert.alert(errTitle, rw("loadBookingError"));
          setLoadingContext(false);
          return;
        }

        const bookingRaw = bookingRes.data as Record<string, unknown> | null | undefined;
        const bookingRow =
          bookingRaw && typeof bookingRaw === "object" && "booking" in bookingRaw
            ? (bookingRaw as { booking?: Record<string, unknown> }).booking
            : bookingRaw;
        const bookingServicesRaw = Array.isArray((bookingRow as { services?: unknown[] } | null)?.services)
          ? ((bookingRow as { services: Record<string, unknown>[] }).services ?? [])
          : [];
        const mappedServices = bookingServicesRaw
          .map((svc) => ({
            offering_id: String(svc.offering_id ?? ""),
            offering_name: String(svc.offering_name ?? svc.service_name ?? rw("serviceFallback")),
            staff_id: svc.staff_id ? String(svc.staff_id) : null,
            staff_name: svc.staff_name ? String(svc.staff_name) : null,
          }))
          .filter((s) => s.offering_id.length > 0);
        setServices(mappedServices);

        const reviewRaw = reviewRes.data as Record<string, unknown> | null | undefined;
        const existingReview =
          (reviewRaw?.review as Record<string, unknown> | undefined) ??
          (Array.isArray(reviewRaw?.reviews) ? (reviewRaw?.reviews as Record<string, unknown>[])[0] : undefined);
        if (existingReview) {
          setHasExistingReview(true);
          const rv = Number(existingReview.rating);
          if (Number.isFinite(rv) && rv >= 1 && rv <= 5) setRating(rv);
          const cm = existingReview.comment;
          if (typeof cm === "string") setComment(cm);

          const existingServices = Array.isArray(existingReview.service_ratings)
            ? (existingReview.service_ratings as Record<string, unknown>[])
            : [];
          const srMap: Record<string, number> = {};
          for (const entry of existingServices) {
            const offeringId = typeof entry.offering_id === "string" ? entry.offering_id : "";
            const value = Number(entry.rating);
            if (offeringId && Number.isFinite(value) && value >= 1 && value <= 5) srMap[offeringId] = value;
          }
          setServiceRatings(srMap);
          const existingStaff = existingReview.staff_rating as Record<string, unknown> | null | undefined;
          if (existingStaff && typeof existingStaff.staff_id === "string") {
            const value = Number(existingStaff.rating);
            if (Number.isFinite(value) && value >= 1 && value <= 5) {
              setStaffRatings({ [existingStaff.staff_id]: value });
            }
          }
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    };
    loadContext().catch(() => {
      if (!cancelled) setLoadingContext(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId, errTitle, rw]);

  const submit = async () => {
    if (!bookingId) {
      Alert.alert(rw("bookingRequiredTitle"), rw("bookingRequiredBody"));
      return;
    }
    if (rating < 1 || rating > 5) {
      Alert.alert(rw("ratingRequiredTitle"), rw("ratingRequiredBody"));
      return;
    }
    setLoading(true);
    try {
      const normalizedServiceRatings = services.map((svc) => ({
        offering_id: svc.offering_id,
        rating: serviceRatings[svc.offering_id] ?? rating,
      }));
      const hasStaff = uniqueStaff.length > 0;
      const selectedStaff = hasStaff
        ? uniqueStaff.find((s) => typeof staffRatings[s.id] === "number")
        : null;
      const normalizedStaffRating =
        hasStaff && selectedStaff
          ? { staff_id: selectedStaff.id, rating: staffRatings[selectedStaff.id] ?? rating }
          : hasStaff
            ? { staff_id: uniqueStaff[0].id, rating }
            : undefined;

      const path = apiBookingReviewPath(bookingId);
      if (isEdit) {
        const res = await api.patch(path, {
          rating,
          comment: comment.trim() || undefined,
          service_ratings: normalizedServiceRatings,
          staff_rating: normalizedStaffRating,
        });
        if (res.error) Alert.alert(errTitle, res.error.message || rw("updateReviewError"));
        else router.back();
      } else {
        const res = await api.post(path, {
          rating,
          comment: comment.trim() || undefined,
          service_ratings: normalizedServiceRatings,
          staff_rating: normalizedStaffRating,
        });
        if (res.error) Alert.alert(errTitle, res.error.message || rw("submitReviewError"));
        else {
          trackReviewSubmitted(providerSlugParam ?? "", rating, bookingId);
          router.back();
        }
      }
    } catch (e) {
      Alert.alert(errTitle, e instanceof Error ? e.message : rw("submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!bookingId) {
    return (
      <>
        <Stack.Screen options={{ title: writeReviewStackTitle }} />
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.white }}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint, flexGrow: 1, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 16, color: Colors.gray[800], marginBottom: 12, lineHeight: 22 }}>{rw("noBookingContext")}</Text>
          {providerSlugParam ? (
            <TouchableOpacity
              onPress={() => router.replace({ pathname: "/(app)/book", params: { slug: providerSlugParam } } as never)}
              style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 12 }}
            >
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{rw("bookThisProvider")}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => router.replace("/(app)/account-settings/bookings" as never)}
            style={{ borderWidth: 1, borderColor: Colors.gray[300], paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 12 }}
          >
            <Text style={{ color: Colors.gray[900], fontWeight: "600", fontSize: 16 }}>{rw("myBookingsCta")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: Colors.primary, fontWeight: "600" }}>{rw("goBackCta")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: isEdit ? rw("editReviewTitle") : writeReviewStackTitle }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
      >
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.white }}
        contentContainerStyle={{
          padding: contentPadding,
          paddingBottom: Math.max(insets.bottom, 12) + 120 + (Platform.OS === "android" ? androidKb : 0),
          ...constraint,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{rw("ratingLabel")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
          {[1, 2, 3, 4, 5].map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRating(r)}
              style={{ padding: 4 }}
              accessibilityLabel={`${r} star${r > 1 ? "s" : ""}`}
              accessibilityRole="button"
            >
              <Ionicons
                name={rating >= r ? "star" : "star-outline"}
                size={40}
                color={rating >= r ? "#EAB308" : "#D1D5DB"}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{rw("yourReviewLabel")}</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 16, minHeight: 100 }}
          placeholder={rw("shareExperiencePlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {loadingContext ? <ActivityIndicator style={{ marginBottom: 12 }} /> : null}
        {services.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{rw("rateEachService")}</Text>
            {services.map((svc) => {
              const selected = serviceRatings[svc.offering_id] ?? rating;
              return (
                <View key={svc.offering_id} style={{ marginBottom: 10, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: Colors.gray[900], fontWeight: "500", marginBottom: 6 }}>{svc.offering_name}</Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <TouchableOpacity
                        key={`${svc.offering_id}-${r}`}
                        onPress={() => setServiceRatings((prev) => ({ ...prev, [svc.offering_id]: r }))}
                        style={{ padding: 2 }}
                      >
                        <Ionicons name={selected >= r ? "star" : "star-outline"} size={24} color={selected >= r ? "#EAB308" : "#D1D5DB"} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {uniqueStaff.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{rw("rateStaff")}</Text>
            {uniqueStaff.map((staff) => {
              const selected = staffRatings[staff.id] ?? rating;
              return (
                <View key={staff.id} style={{ marginBottom: 10, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: Colors.gray[900], fontWeight: "500", marginBottom: 6 }}>{staff.name}</Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <TouchableOpacity
                        key={`${staff.id}-${r}`}
                        onPress={() => setStaffRatings((prev) => ({ ...prev, [staff.id]: r }))}
                        style={{ padding: 2 }}
                      >
                        <Ionicons name={selected >= r ? "star" : "star-outline"} size={24} color={selected >= r ? "#EAB308" : "#D1D5DB"} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <TouchableOpacity
          onPress={submit}
          disabled={loading || loadingContext || rating < 1}
          style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: loading || loadingContext || rating < 1 ? 0.5 : 1 }}
        >
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>{rw("submitCta")}</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
