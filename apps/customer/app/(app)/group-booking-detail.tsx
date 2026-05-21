import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { haptic } from "@/lib/haptics";
import { getApiErrorMessage } from "@/lib/api-error";

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
  checked_in: boolean;
  checked_out: boolean;
  booking_status: string | null;
  payment_status: string | null;
  booking_number: string | null;
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

          <View style={[{ backgroundColor: Colors.white, borderRadius: 18, padding: 18 }, Shadows.cardSmall]}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.gray[900], marginBottom: 12 }}>Participants</Text>
            {data.participants.length === 0 && (
              <Text style={{ color: Colors.gray[400], fontSize: 14, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
                No participants listed yet.
              </Text>
            )}
            {data.participants.map((p) => (
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
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
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
                    </View>
                    <Text style={{ color: Colors.gray[600], marginTop: 4 }}>{p.service_name} · {money(p.price)}</Text>
                    <Text style={{ color: Colors.gray[500], fontSize: 12, marginTop: 4 }}>
                      {p.checked_in ? "Checked in" : "Not checked in"} · {p.checked_out ? "Checked out" : "Not checked out"}
                    </Text>
                    {!p.booking_id && (
                      <Text style={{ color: Colors.gray[400], fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
                        Booking details not available
                      </Text>
                    )}
                  </View>
                  {p.booking_id ? <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} /> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
