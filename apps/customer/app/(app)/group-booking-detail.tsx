import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { haptic } from "@/lib/haptics";
import { getApiErrorMessage } from "@/lib/api-error";

type ParticipantAddon = {
  id: string | null;
  name: string | null;
  price: number;
  duration_minutes: number | null;
};

type Participant = {
  id: string;
  booking_id: string | null;
  is_current_user: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  service_name: string;
  price: number;
  duration_minutes: number | null;
  addons?: ParticipantAddon[];
  checked_in: boolean;
  checked_out: boolean;
  booking_status: string | null;
  payment_status: string | null;
  booking_number: string | null;
  total_paid?: number;
  total_refunded?: number;
};

type GroupProduct = {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type GroupBookingDetail = {
  id: string;
  ref_number: string;
  title: string;
  status: string;
  scheduled_at: string;
  provider?: { business_name?: string | null; phone?: string | null; email?: string | null } | null;
  location?: { name?: string | null; address_line1?: string | null; city?: string | null; country?: string | null } | null;
  location_type?: string | null;
  address?: { line1?: string | null; city?: string | null; country?: string | null } | null;
  package_name?: string | null;
  participant_count: number;
  max_participants?: number | null;
  participants: Participant[];
  products?: GroupProduct[];
  travel_fee?: number;
  total_price: number;
  notes?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "Invalid date";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function money(value: number) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function paymentBadge(status: string | null | undefined): { label: string; bg: string; fg: string } | null {
  if (!status) return null;
  if (status === "paid") return { label: "Paid", bg: "#DCFCE7", fg: "#15803D" };
  if (status === "unpaid" || status === "pending") return { label: "Unpaid", bg: "#FEF3C7", fg: "#92400E" };
  if (status === "partial") return { label: "Partial", bg: "#FEF9C3", fg: "#854D0E" };
  if (status === "refunded") return { label: "Refunded", bg: "#EDE9FE", fg: "#6D28D9" };
  return null;
}

function statusColor(status: string) {
  if (status === "completed") return { bg: "#DBEAFE", fg: "#1D4ED8" };
  if (status === "cancelled") return { bg: "#FEE2E2", fg: "#B91C1C" };
  if (status === "started" || status === "in_progress") return { bg: "#EDE9FE", fg: "#7C3AED" };
  if (status === "pending") return { bg: "#FEF3C7", fg: "#92400E" };
  return { bg: "#DCFCE7", fg: "#15803D" };
}

function humanStatus(status: string): string {
  switch (status) {
    case "pending": return "Pending";
    case "confirmed": return "Confirmed";
    case "booked": return "Booked";
    case "started": return "In progress";
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  }
}

export default function GroupBookingDetailScreen() {
  useScreenTracking("Group Booking Detail");
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => {
    const raw = params.id;
    return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  }, [params.id]);
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [data, setData] = useState<GroupBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [savingReschedule, setSavingReschedule] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!id) {
      setError("Group booking not found");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    const res = await api.get<GroupBookingDetail>(`/api/me/group-bookings/${id}`);
    if (res.error) {
      setError(getApiErrorMessage(res.error, "Could not load group booking"));
      setData(null);
    } else {
      setData(res.data ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const constrained = isTablet ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const colors = statusColor(data?.status ?? "confirmed");
  const isPrimaryContact = Boolean(data?.participants.some((p) => p.is_current_user && p.is_primary_contact));
  const canRescheduleGroup =
    isPrimaryContact && data != null && !["completed", "cancelled", "started"].includes(data.status);

  const submitReschedule = useCallback(async () => {
    if (!id) return;
    const parsed = Date.parse(`${rescheduleDate}T${rescheduleTime}:00`);
    if (!Number.isFinite(parsed)) {
      Alert.alert("Invalid date/time", "Use YYYY-MM-DD and HH:MM (24-hour).");
      return;
    }
    setSavingReschedule(true);
    try {
      const res = await api.post(`/api/me/group-bookings/${id}/reschedule`, {
        new_datetime: new Date(parsed).toISOString(),
      });
      if (res.error) {
        Alert.alert("Could not reschedule", getApiErrorMessage(res.error, "Try another time."));
        return;
      }
      haptic.success();
      setShowReschedule(false);
      await load(true);
    } finally {
      setSavingReschedule(false);
    }
  }, [id, load, rescheduleDate, rescheduleTime]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <Stack.Screen options={{ title: "Group booking" }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
      <View style={[constrained, { paddingHorizontal: contentPadding, paddingVertical: 14, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="chevron-back" size={20} color={Colors.gray[700]} />
          <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={{ color: Colors.gray[500], fontSize: 14 }}>Loading session…</Text>
        </View>
      ) : error ? (
        <View style={[constrained, { flex: 1, padding: contentPadding, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="calendar-outline" size={48} color={Colors.gray[300]} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Group session not found</Text>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>{error}</Text>
          {id ? (
            <TouchableOpacity onPress={() => void load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 }}>
              <Text style={{ color: Colors.white, fontWeight: "700" }}>Retry</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
              <Text style={{ color: Colors.primary, fontWeight: "700" }}>Go back</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : !data ? (
        <View style={[constrained, { flex: 1, padding: contentPadding, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="calendar-outline" size={48} color={Colors.gray[300]} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Session not found</Text>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>This group booking no longer exists or you may not have access to it.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
            <Text style={{ color: Colors.primary, fontWeight: "700" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={[constrained, { padding: contentPadding, paddingBottom: 48 }]}
        >
          <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 16 }, Shadows.cardSmall]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.gray[500], fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>{data.ref_number}</Text>
                <Text style={{ color: Colors.gray[900], fontSize: 24, fontWeight: "800", marginTop: 4 }}>{data.title}</Text>
                <Text style={{ color: Colors.gray[700], marginTop: 8 }}>{formatDate(data.scheduled_at)} · {formatTime(data.scheduled_at)}</Text>
                {canRescheduleGroup ? (
                  <TouchableOpacity
                    onPress={() => {
                      const parsed = new Date(data.scheduled_at);
                      if (Number.isFinite(parsed.getTime())) {
                        setRescheduleDate(parsed.toISOString().slice(0, 10));
                        setRescheduleTime(parsed.toISOString().slice(11, 16));
                      }
                      setShowReschedule(true);
                    }}
                    style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                  >
                    <Text style={{ color: Colors.white, fontWeight: "700", fontSize: 13 }}>Reschedule session</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 12 }}>{humanStatus(data.status)}</Text>
              </View>
            </View>
            <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.gray[500], fontSize: 12 }}>Participants</Text>
                <Text style={{ color: Colors.gray[900], fontSize: 18, fontWeight: "800" }}>
                  {data.participant_count}{data.max_participants ? ` / ${data.max_participants}` : ""}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.gray[500], fontSize: 12 }}>Session total</Text>
                <Text style={{ color: Colors.gray[900], fontSize: 18, fontWeight: "800" }}>{money(data.total_price)}</Text>
              </View>
            </View>
          </View>

          <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 16 }, Shadows.cardSmall]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 8 }}>Provider</Text>
            <Text style={{ fontWeight: "700", color: Colors.gray[900] }}>{data.provider?.business_name ?? "Provider"}</Text>
            <Text style={{ color: Colors.gray[600], marginTop: 6 }}>
              {data.location_type === "at_home"
                ? [data.address?.line1, data.address?.city, data.address?.country].filter(Boolean).join(", ") || "At your location"
                : [data.location?.name, data.location?.address_line1, data.location?.city].filter(Boolean).join(", ") || "At salon"}
            </Text>
          </View>

          {(data.package_name || data.notes) && (
            <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 16 }, Shadows.cardSmall]}>
              {data.package_name && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: data.notes ? 10 : 0 }}>
                  <Ionicons name="pricetag-outline" size={15} color={Colors.gray[500]} />
                  <Text style={{ color: Colors.gray[700], fontSize: 14, fontWeight: "600" }}>{data.package_name}</Text>
                </View>
              )}
              {data.notes && (
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name="document-text-outline" size={15} color={Colors.gray[500]} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, color: Colors.gray[600], fontSize: 14, lineHeight: 20 }}>{data.notes}</Text>
                </View>
              )}
            </View>
          )}

          <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 16 }, Shadows.cardSmall]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 12 }}>Participants</Text>
            {data.participants.length === 0 && (
              <Text style={{ color: Colors.gray[400], fontSize: 14, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
                No participants listed yet.
              </Text>
            )}
            {data.participants.map((p) => {
              const badge = paymentBadge(p.payment_status);
              return (
                <TouchableOpacity
                  key={p.id}
                  disabled={!p.booking_id}
                  onPress={() => {
                    if (!p.booking_id) return;
                    haptic.selection();
                    router.push({ pathname: "/(app)/booking-detail", params: { id: p.booking_id } });
                  }}
                  style={[
                    { borderWidth: 1, borderColor: p.is_current_user ? Colors.primary : Colors.gray[200], borderRadius: 14, padding: 14, marginBottom: 10 },
                    !p.booking_id && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ fontWeight: "800", color: Colors.gray[900] }}>{p.name}</Text>
                        {p.is_current_user && (
                          <View style={{ backgroundColor: Colors.primary + "20", borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: Colors.primary, fontSize: 10, fontWeight: "700" }}>you</Text>
                          </View>
                        )}
                        {p.is_primary_contact && (
                          <View style={{ backgroundColor: "#FDF2F8", borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: "#9D174D", fontSize: 10, fontWeight: "700" }}>primary</Text>
                          </View>
                        )}
                        {badge ? (
                          <View style={{ backgroundColor: badge.bg, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: badge.fg, fontSize: 10, fontWeight: "700" }}>{badge.label}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ color: Colors.gray[700], fontWeight: "600", marginTop: 4 }}>{p.service_name}</Text>
                      {Array.isArray(p.addons) && p.addons.length > 0 ? (
                        <Text style={{ color: Colors.gray[500], fontSize: 12, marginTop: 2 }}>
                          + {p.addons.map((ao) => ao.name ?? "Add-on").join(", ")}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <Text style={{ color: Colors.gray[600], fontSize: 14, fontWeight: "700" }}>{money(p.price)}</Text>
                        {p.duration_minutes ? (
                          <Text style={{ color: Colors.gray[400], fontSize: 12 }}>{p.duration_minutes} min</Text>
                        ) : null}
                      </View>
                      <Text style={{ color: Colors.gray[400], fontSize: 11, marginTop: 4 }}>
                        {p.checked_in ? "✓ Checked in" : "Not checked in"}{p.checked_out ? " · ✓ Checked out" : ""}
                      </Text>
                      {!p.booking_id && (
                        <Text style={{ color: Colors.gray[400], fontSize: 11, marginTop: 2, fontStyle: "italic" }}>
                          Booking details not available
                        </Text>
                      )}
                    </View>
                    {p.booking_id ? <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} style={{ marginTop: 2 }} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Products */}
          {Array.isArray(data.products) && data.products.length > 0 ? (
            <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 16 }, Shadows.cardSmall]}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 12 }}>Products</Text>
              {data.products.map((product, idx) => (
                <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: idx < data.products!.length - 1 ? 1 : 0, borderBottomColor: Colors.gray[100] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{product.name}</Text>
                    {product.quantity > 1 ? (
                      <Text style={{ color: Colors.gray[500], fontSize: 12, marginTop: 2 }}>
                        {money(product.unit_price)} × {product.quantity}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontWeight: "700", color: Colors.gray[900] }}>{money(product.total)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Price breakdown */}
          <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18 }, Shadows.cardSmall]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 12 }}>Price breakdown</Text>
            {data.participants.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={{ color: Colors.gray[600], flex: 1 }} numberOfLines={1}>{p.name} — {p.service_name}</Text>
                <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{money(p.price)}</Text>
              </View>
            ))}
            {Array.isArray(data.products) && data.products.length > 0 ? (
              data.products.map((product, idx) => (
                <View key={`prod-${idx}`} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                  <Text style={{ color: Colors.gray[600], flex: 1 }} numberOfLines={1}>{product.name} ×{product.quantity}</Text>
                  <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{money(product.total)}</Text>
                </View>
              ))
            ) : null}
            {(data.travel_fee ?? 0) > 0 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={{ color: Colors.gray[600] }}>Travel fee</Text>
                <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{money(data.travel_fee ?? 0)}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.gray[200] }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: Colors.gray[900] }}>Total</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: Colors.gray[900] }}>{money(data.total_price)}</Text>
            </View>
          </View>
        </ScrollView>
      ) : null}
      {showReschedule ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 8 }}>Reschedule group session</Text>
            <Text style={{ color: Colors.gray[600], fontSize: 13, marginBottom: 12 }}>
              This moves the entire group to a new date and time. Availability is verified when you save.
            </Text>
            <Text style={{ color: Colors.gray[600], fontSize: 12, marginBottom: 6 }}>Date (YYYY-MM-DD)</Text>
            <TextInput
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
              placeholder="2026-06-10"
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
            />
            <Text style={{ color: Colors.gray[600], fontSize: 12, marginBottom: 6 }}>Time (HH:MM)</Text>
            <TextInput
              value={rescheduleTime}
              onChangeText={setRescheduleTime}
              placeholder="14:30"
              autoCapitalize="none"
              style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setShowReschedule(false)}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ fontWeight: "700", color: Colors.gray[700] }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitReschedule()}
                disabled={savingReschedule}
                style={{ flex: 2, borderRadius: 12, backgroundColor: Colors.primary, paddingVertical: 14, alignItems: "center", opacity: savingReschedule ? 0.7 : 1 }}
              >
                <Text style={{ fontWeight: "700", color: Colors.white }}>
                  {savingReschedule ? "Saving…" : "Save new time"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
