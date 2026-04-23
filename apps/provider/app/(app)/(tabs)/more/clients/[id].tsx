import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format as formatDateFns } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { AddressAutocomplete, type ParsedAddress } from "@/components/ui/AddressAutocomplete";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

interface ClientDefaultAddress {
  address_line1: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Customer saved this via their app/profile; provider cannot overwrite. */
  customer_managed_home?: boolean;
}

interface ClientCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth?: string | null;
  email_notifications_enabled?: boolean | null;
  sms_notifications_enabled?: boolean | null;
  default_address?: ClientDefaultAddress | null;
  /**
   * §Release-audit 2026-04 — true when this customer is a real
   * self-registered Beautonomi user (not a walk-in placeholder). Server
   * refuses name/email/phone/DOB edits for registered customers to keep
   * the customer's own /api/me/profile surface the source of truth.
   */
  is_registered?: boolean | null;
}

interface HistoryItem {
  id: string;
  type: "appointment" | "sale";
  date: string;
  description: string;
  amount: number;
  team_member_name?: string | null;
  status?: string;
  booking_number?: string;
  scheduled_at?: string;
}

interface ClientDetail {
  id: string;
  customer_id: string;
  customer: ClientCustomer;
  notes: string | null;
  tags?: string[] | null;
  is_favorite?: boolean | null;
  total_bookings: number;
  total_spent: number;
  history: HistoryItem[];
}

/** GET /api/provider/ratings — same aggregate as provider web Ratings tab. */
interface ProviderRatingStats {
  total_ratings?: number;
  average_rating?: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-600",
  confirmed: "text-blue-600",
  booked: "text-amber-600",
  pending: "text-amber-600",
  started: "text-pink-600",
  in_progress: "text-pink-600",
  cancelled: "text-red-600",
  no_show: "text-red-600",
};

const STATUS_BG: Record<string, string> = {
  completed: "bg-green-50",
  confirmed: "bg-blue-50",
  booked: "bg-amber-50",
  pending: "bg-amber-50",
  started: "bg-pink-50",
  in_progress: "bg-pink-50",
  cancelled: "bg-red-50",
  no_show: "bg-red-50",
};

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const clientId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;
  const { bundle } = useConfigBundle();
  const mapboxCountryIso =
    bundle?.meta?.active_market_country?.trim().length === 2
      ? bundle.meta.active_market_country.trim().toUpperCase()
      : "ZA";
  const defaultCountryName =
    bundle?.meta?.tenant_region?.name?.trim() || "South Africa";

  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const [addressEditing, setAddressEditing] = useState(false);
  const [addressSearchValue, setAddressSearchValue] = useState("");
  const [homeParsed, setHomeParsed] = useState<ParsedAddress | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);

  // §Provider-audit 2026-04 (client editing): matches the provider-web
  // `ClientFormData` dialog — full_name / email / phone / DOB / marketing
  // consent all already exist on the PATCH /api/provider/clients/[id]
  // endpoint, the mobile screen just never exposed them.
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [formFullName, setFormFullName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formDob, setFormDob] = useState<string>("");
  const [formEmailOptIn, setFormEmailOptIn] = useState(true);
  const [formSmsOptIn, setFormSmsOptIn] = useState(true);
  const [showDobPicker, setShowDobPicker] = useState(false);

  const [favoriteSaving, setFavoriteSaving] = useState(false);

  const {
    data: client,
    loading,
    error,
    refresh,
  } = useApi<ClientDetail>(`/api/provider/clients/${clientId}`, {
    enabled: !!clientId,
  });

  const ratingCustomerId = client?.customer_id ?? client?.customer?.id ?? "";
  const ratingsStatsUrl = ratingCustomerId
    ? `/api/provider/ratings?customer_id=${encodeURIComponent(ratingCustomerId)}`
    : "/api/provider/ratings?_noop=1";
  const {
    data: ratingStats,
    loading: ratingStatsLoading,
    refresh: refreshRatingStats,
  } = useApi<ProviderRatingStats>(ratingsStatsUrl, {
    enabled: Boolean(ratingCustomerId),
    staleTimeMs: 0,
  });
  const clientDetailFocusRef = useRef(true);

  const { execute: patchClient } = useApiMutation("patch");

  useFocusEffect(
    useCallback(() => {
      if (clientDetailFocusRef.current) {
        clientDetailFocusRef.current = false;
        return;
      }
      if (!clientId) return;
      void refresh();
      if (ratingCustomerId) void refreshRatingStats();
    }, [clientId, ratingCustomerId, refresh, refreshRatingStats]),
  );

  useEffect(() => {
    clientDetailFocusRef.current = true;
  }, [clientId]);

  const resetAddressFormFromClient = useCallback(
    (c: ClientDetail) => {
      const da = c.customer?.default_address;
      if (da?.address_line1 && da.city) {
        setAddressSearchValue([da.address_line1, da.city].filter(Boolean).join(", "));
        setHomeParsed({
          full_address: [da.address_line1, da.city].join(", "),
          address_line1: da.address_line1,
          city: da.city,
          state: da.state || "",
          postal_code: da.postal_code || "",
          country: da.country || defaultCountryName,
          latitude: da.latitude != null ? Number(da.latitude) : 0,
          longitude: da.longitude != null ? Number(da.longitude) : 0,
        });
      } else {
        setAddressSearchValue("");
        setHomeParsed(null);
      }
    },
    [defaultCountryName],
  );

  useEffect(() => {
    if (client) resetAddressFormFromClient(client);
  }, [client, resetAddressFormFromClient]);

  useEffect(() => {
    if (client?.customer?.default_address?.customer_managed_home) {
      setAddressEditing(false);
    }
  }, [client?.customer?.default_address?.customer_managed_home, client?.id]);

  const handleSaveAddress = useCallback(async () => {
    if (!clientId) return;
    const p = homeParsed;
    if (!p?.address_line1?.trim() || !p?.city?.trim()) {
      Alert.alert(
        "Address",
        "Pick a search result so street and city are filled in — required for house-call distance.",
      );
      return;
    }
    const iso =
      p.country && /^[A-Za-z]{2}$/.test(p.country.trim())
        ? p.country.trim().toUpperCase()
        : mapboxCountryIso;
    setAddressSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, {
      address: {
        line1: p.address_line1.trim(),
        line2: "",
        city: p.city.trim(),
        state: p.state?.trim() || undefined,
        postal_code: p.postal_code?.trim() || undefined,
        country: iso,
        latitude: p.latitude,
        longitude: p.longitude,
      },
    });
    setAddressSaving(false);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    setAddressEditing(false);
    refresh();
  }, [clientId, homeParsed, mapboxCountryIso, patchClient, refresh]);

  const onRefresh = useCallback(() => {
    void refresh();
    if (ratingCustomerId) void refreshRatingStats();
  }, [refresh, refreshRatingStats, ratingCustomerId]);

  const goBackToClients = useCallback(() => {
    router.replace("/(app)/(tabs)/clients" as never);
  }, [router]);

  const handleTagsChange = useCallback(
    async (tags: string[]) => {
      if (!clientId) return;
      const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, { tags });
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      refresh();
    },
    [clientId, patchClient, refresh]
  );

  const openNotesEdit = useCallback(() => {
    setNotesDraft(client?.notes ?? "");
    setNotesEditing(true);
  }, [client?.notes]);

  const handleSaveNotes = useCallback(async () => {
    if (!clientId) return;
    setNotesSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, {
      notes: notesDraft.trim() || null,
    });
    setNotesSaving(false);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    setNotesEditing(false);
    refresh();
  }, [clientId, notesDraft, patchClient, refresh]);

  const openDetailsSheet = useCallback(() => {
    if (!client) return;
    setFormFullName(client.customer?.full_name ?? "");
    setFormEmail(client.customer?.email ?? "");
    setFormPhone(client.customer?.phone ?? "");
    setFormDob(client.customer?.date_of_birth ?? "");
    // Fall back to `true` when the flag is null so the toggle shows the
    // platform default (opted-in) instead of an ambiguous off state.
    setFormEmailOptIn(client.customer?.email_notifications_enabled !== false);
    setFormSmsOptIn(client.customer?.sms_notifications_enabled !== false);
    setShowDobPicker(false);
    setDetailsSheetOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [client]);

  const handleSaveDetails = useCallback(async () => {
    if (!clientId) return;
    const trimmedName = formFullName.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Enter the client's name before saving.");
      return;
    }
    const trimmedEmail = formEmail.trim();
    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      Alert.alert("Invalid email", "Enter a valid email address or clear the field.");
      return;
    }
    setDetailsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, {
      full_name: trimmedName,
      email: trimmedEmail || null,
      phone: formPhone.trim() || null,
      date_of_birth: formDob || null,
      email_opt_in: formEmailOptIn,
      sms_opt_in: formSmsOptIn,
    });
    setDetailsSaving(false);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    setDetailsSheetOpen(false);
    refresh();
  }, [
    clientId,
    formFullName,
    formEmail,
    formPhone,
    formDob,
    formEmailOptIn,
    formSmsOptIn,
    patchClient,
    refresh,
  ]);

  const handleToggleFavorite = useCallback(async () => {
    if (!clientId || !client) return;
    const nextFavorite = !(client.is_favorite ?? false);
    setFavoriteSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, {
      is_favorite: nextFavorite,
    });
    setFavoriteSaving(false);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    refresh();
  }, [clientId, client, patchClient, refresh]);

  const dobLabel = useMemo(() => {
    if (!formDob) return "";
    const d = new Date(formDob);
    if (Number.isNaN(d.getTime())) return formDob;
    return formatDateFns(d, "d MMM yyyy");
  }, [formDob]);

  if (loading && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  if (!client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View style={twStyle("flex-1 items-center justify-center px-4")}>
          <Text style={twStyle("text-base text-gray-500")}>Client not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const customer = client.customer ?? ({} as ClientCustomer);
  const name = customer.full_name ?? "Client";
  const history = client.history ?? [];
  const clientTags = client.tags ?? [];
  const providerBookingAvg =
    ratingStats &&
    typeof ratingStats.total_ratings === "number" &&
    ratingStats.total_ratings > 0 &&
    typeof ratingStats.average_rating === "number"
      ? ratingStats.average_rating.toFixed(1)
      : null;
  const homeAddressLocked = Boolean(customer.default_address?.customer_managed_home);
  const isFavorite = Boolean(client.is_favorite);
  const dob = customer.date_of_birth;
  const emailOptIn = customer.email_notifications_enabled !== false;
  const smsOptIn = customer.sms_notifications_enabled !== false;
  // §Release-audit 2026-04: server rejects identity edits for registered
  // customers — hide the Edit button so the provider never sees a 403.
  const identityEditable = customer.is_registered === false;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Client" showBack onBack={goBackToClients} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#1a1f3c" />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Client info card ── */}
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
            <View style={twStyle("flex-row items-center")}>
              <Avatar name={name} imageUrl={customer.avatar_url ?? undefined} size="lg" />
              <View style={twStyle("ml-4 flex-1")}>
                <Text style={twStyle("text-lg font-bold text-gray-900")}>{name}</Text>
                {customer.phone ? (
                  <Text style={twStyle("text-sm text-gray-500 mt-0.5")}>{customer.phone}</Text>
                ) : null}
                {customer.email ? (
                  <Text style={twStyle("text-sm text-gray-500")}>{customer.email}</Text>
                ) : null}
              </View>
              <View style={twStyle("items-end gap-2")}>
                <TouchableOpacity
                  onPress={handleToggleFavorite}
                  disabled={favoriteSaving}
                  style={twStyle(
                    `h-9 w-9 items-center justify-center rounded-full ${
                      isFavorite ? "bg-amber-50" : "bg-gray-100"
                    }`,
                  )}
                  accessibilityLabel={isFavorite ? "Remove from favorites" : "Mark as favorite"}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={isFavorite ? "star" : "star-outline"}
                    size={18}
                    color={isFavorite ? "#f59e0b" : "#6b7280"}
                  />
                </TouchableOpacity>
                {identityEditable ? (
                  <TouchableOpacity
                    onPress={openDetailsSheet}
                    style={twStyle("flex-row items-center rounded-lg bg-gray-900 px-3 py-1.5")}
                    accessibilityLabel="Edit client details"
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil-outline" size={13} color="#ffffff" />
                    <Text style={twStyle("ml-1 text-xs font-semibold text-white")}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={twStyle("flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5")}
                    accessibilityLabel="Customer-managed profile"
                  >
                    <Ionicons name="lock-closed-outline" size={13} color="#6b7280" />
                    <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>
                      Customer-managed
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Quick-glance meta (birthday + opt-ins) so providers can see the
                full client record without opening the edit sheet. */}
            {(dob || !emailOptIn || !smsOptIn) ? (
              <View style={twStyle("mt-3 flex-row flex-wrap gap-2")}>
                {dob ? (
                  <View style={twStyle("flex-row items-center rounded-full bg-gray-100 px-2.5 py-1")}>
                    <Ionicons name="gift-outline" size={12} color="#6b7280" />
                    <Text style={twStyle("ml-1 text-xs text-gray-600")}>
                      {(() => {
                        const d = new Date(dob);
                        return Number.isNaN(d.getTime())
                          ? dob
                          : formatDateFns(d, "d MMM yyyy");
                      })()}
                    </Text>
                  </View>
                ) : null}
                {!emailOptIn ? (
                  <View style={twStyle("flex-row items-center rounded-full bg-red-50 px-2.5 py-1")}>
                    <Ionicons name="mail-unread-outline" size={12} color="#dc2626" />
                    <Text style={twStyle("ml-1 text-xs text-red-600")}>Email off</Text>
                  </View>
                ) : null}
                {!smsOptIn ? (
                  <View style={twStyle("flex-row items-center rounded-full bg-red-50 px-2.5 py-1")}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color="#dc2626" />
                    <Text style={twStyle("ml-1 text-xs text-red-600")}>SMS off</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Stats row — avg matches provider web /api/provider/ratings (this business, post-visit only). */}
            <View style={twStyle("mt-3 flex-row rounded-xl bg-gray-50 px-3 py-3")}>
              <View style={{ flex: 1 }}>
                <Text style={twStyle("text-xs text-gray-400")}>Bookings</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {client.total_bookings}
                </Text>
              </View>
              <View style={twStyle("h-10 w-px bg-gray-200")} />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={twStyle("text-xs text-gray-400")}>Total spent</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {formatCurrency(client.total_spent)}
                </Text>
              </View>
              <View style={twStyle("h-10 w-px bg-gray-200")} />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={twStyle("text-xs text-gray-400")}>Avg rating</Text>
                {ratingStatsLoading ? (
                  <Text style={twStyle("text-base font-bold text-gray-400")}>…</Text>
                ) : providerBookingAvg != null ? (
                  <Text style={twStyle("text-base font-bold text-gray-900")}>{providerBookingAvg}</Text>
                ) : (
                  <Text style={twStyle("text-base font-bold text-gray-400")}>—</Text>
                )}
                <Text style={twStyle("text-[10px] text-gray-400 mt-0.5")} numberOfLines={2}>
                  Your post-visit ratings
                </Text>
              </View>
            </View>

            {/* §Provider-audit 2026-04: quick-book entry point from the client
                profile — saves several taps vs. going back to the clients tab
                then hitting the row action. */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const customerId = client.customer_id || client.customer?.id;
                if (!customerId) return;
                router.push(
                  `/(app)/(tabs)/more/bookings/new?clientId=${customerId}` as never,
                );
              }}
              style={twStyle(
                "mt-3 flex-row items-center justify-center rounded-xl bg-indigo-600 py-3",
              )}
              accessibilityLabel="Book appointment for this client"
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={twStyle("ml-2 text-sm font-semibold text-white")}>
                Book appointment
              </Text>
            </TouchableOpacity>

            {/* Tags */}
            <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
              <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                Tags
              </Text>
              <ChipCombobox
                value={clientTags}
                onChange={handleTagsChange}
                staticSuggestions={[
                  { value: "VIP", label: "VIP" },
                  { value: "Regular", label: "Regular" },
                  { value: "New", label: "New" },
                  { value: "At risk", label: "At risk" },
                  { value: "Loyal", label: "Loyal" },
                ]}
                placeholder="Add tags (e.g. VIP, Regular)"
                accessibilityLabel="Client tags"
              />
            </View>

            {/* Notes */}
            <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
              <View style={twStyle("flex-row items-center justify-between mb-1.5")}>
                <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                  Private notes
                </Text>
                {!notesEditing ? (
                  <TouchableOpacity
                    onPress={openNotesEdit}
                    style={twStyle("flex-row items-center rounded-lg bg-gray-100 px-2.5 py-1")}
                    accessibilityLabel="Edit notes"
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil-outline" size={13} color="#6b7280" />
                    <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {notesEditing ? (
                <View>
                  <TextInput
                    value={notesDraft}
                    onChangeText={setNotesDraft}
                    placeholder="Add private notes about this client..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={4}
                    style={{
                      borderWidth: 1.5,
                      borderColor: "#6366f1",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: "#111827",
                      backgroundColor: "#fafafa",
                      minHeight: 96,
                      textAlignVertical: "top",
                    }}
                    accessibilityLabel="Client notes"
                  />
                  <View style={twStyle("mt-2 flex-row gap-2")}>
                    <TouchableOpacity
                      onPress={() => setNotesEditing(false)}
                      style={[
                        twStyle("flex-1 items-center justify-center rounded-xl border border-gray-200 py-3"),
                      ]}
                      accessibilityLabel="Cancel editing notes"
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-600")}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveNotes}
                      disabled={notesSaving}
                      style={[
                        twStyle("flex-1 items-center justify-center rounded-xl bg-gray-900 py-3"),
                        notesSaving ? { opacity: 0.6 } : undefined,
                      ]}
                      accessibilityLabel="Save notes"
                    >
                      <Text style={twStyle("text-sm font-semibold text-white")}>
                        {notesSaving ? "Saving…" : "Save"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : client.notes ? (
                <TouchableOpacity onPress={openNotesEdit} activeOpacity={0.7}>
                  <Text style={twStyle("text-sm text-gray-600 leading-relaxed")}>
                    {client.notes}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={openNotesEdit}
                  style={twStyle(
                    "flex-row items-center rounded-xl border border-dashed border-gray-200 px-3 py-3"
                  )}
                  accessibilityLabel="Add notes"
                  accessibilityRole="button"
                >
                  <Ionicons name="document-text-outline" size={16} color="#9ca3af" />
                  <Text style={twStyle("ml-2 text-sm text-gray-400")}>
                    Tap to add private notes…
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Home address — Mapbox + saved coords for house-call distance */}
            <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
              <View style={twStyle("flex-row items-center justify-between mb-1.5")}>
                <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                  Home address
                </Text>
                {!addressEditing && !homeAddressLocked ? (
                  <TouchableOpacity
                    onPress={() => {
                      resetAddressFormFromClient(client);
                      setAddressEditing(true);
                    }}
                    style={twStyle("flex-row items-center rounded-lg bg-gray-100 px-2.5 py-1")}
                    accessibilityLabel="Edit home address"
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil-outline" size={13} color="#6b7280" />
                    <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {addressEditing ? (
                <View>
                  <AddressAutocomplete
                    value={addressSearchValue}
                    countryCode={mapboxCountryIso}
                    defaultCountryName={defaultCountryName}
                    label="Search address"
                    placeholder="Start typing for suggestions…"
                    onSelect={(p) => {
                      setHomeParsed(p);
                      setAddressSearchValue(p.full_address);
                    }}
                  />
                  <View style={twStyle("mt-2 flex-row gap-2")}>
                    <TouchableOpacity
                      onPress={() => {
                        setAddressEditing(false);
                        resetAddressFormFromClient(client);
                      }}
                      style={twStyle(
                        "flex-1 items-center justify-center rounded-xl border border-gray-200 py-3",
                      )}
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-600")}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveAddress}
                      disabled={addressSaving}
                      style={[
                        twStyle("flex-1 items-center justify-center rounded-xl bg-gray-900 py-3"),
                        addressSaving ? { opacity: 0.6 } : undefined,
                      ]}
                    >
                      <Text style={twStyle("text-sm font-semibold text-white")}>
                        {addressSaving ? "Saving…" : "Save address"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : customer.default_address?.address_line1 ? (
                <View>
                  <Text style={twStyle("text-sm text-gray-600 leading-relaxed")}>
                    {[customer.default_address.address_line1, customer.default_address.city]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                  {homeAddressLocked ? (
                    <Text style={twStyle("mt-2 text-xs text-gray-500 leading-relaxed")}>
                      Saved by the customer in their account. Only they can change it.
                    </Text>
                  ) : null}
                </View>
              ) : homeAddressLocked ? null : (
                <TouchableOpacity
                  onPress={() => {
                    resetAddressFormFromClient(client);
                    setAddressEditing(true);
                  }}
                  style={twStyle(
                    "flex-row items-center rounded-xl border border-dashed border-gray-200 px-3 py-3",
                  )}
                  accessibilityLabel="Set home address"
                  accessibilityRole="button"
                >
                  <Ionicons name="location-outline" size={16} color="#9ca3af" />
                  <Text style={twStyle("ml-2 text-sm text-gray-400")}>
                    Tap to set home address (Mapbox) for house calls…
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Booking & sale history ── */}
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white overflow-hidden")}>
            <View style={twStyle("border-b border-gray-100 px-4 py-3")}>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>History</Text>
              <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>
                {history.length} {history.length === 1 ? "item" : "items"}
              </Text>
            </View>
            {history.length === 0 ? (
              <View style={twStyle("items-center justify-center py-12 px-4")}>
                <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
                <Text style={twStyle("mt-3 text-sm font-medium text-gray-400")}>No history yet</Text>
              </View>
            ) : (
              history.map((item) => {
                const isAppointment = item.type === "appointment";
                const statusColor = item.status
                  ? STATUS_COLORS[item.status] ?? "text-gray-600"
                  : "text-gray-600";
                const statusBg = item.status
                  ? STATUS_BG[item.status] ?? "bg-gray-50"
                  : "bg-gray-50";

                return (
                  <TouchableOpacity
                    key={`${item.type}-${item.id}`}
                    onPress={() => {
                      if (isAppointment) {
                        router.push(`/(app)/(tabs)/more/bookings/${item.id}` as never);
                      }
                    }}
                    disabled={!isAppointment}
                    activeOpacity={isAppointment ? 0.7 : 1}
                    style={twStyle(
                      "flex-row items-center border-b border-gray-50 px-4 py-3 last:border-b-0"
                    )}
                  >
                    <View
                      style={twStyle(
                        `mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                          isAppointment ? "bg-indigo-50" : "bg-emerald-50"
                        }`
                      )}
                    >
                      <Ionicons
                        name={isAppointment ? "calendar" : "receipt"}
                        size={19}
                        color={isAppointment ? "#6366f1" : "#10b981"}
                      />
                    </View>
                    <View style={twStyle("flex-1 min-w-0")}>
                      <Text
                        style={twStyle("text-sm font-medium text-gray-900")}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                      <View style={twStyle("mt-0.5 flex-row flex-wrap items-center gap-x-2")}>
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {formatDate(item.scheduled_at ?? item.date, "MMM d, yyyy")}
                          {item.scheduled_at ? ` · ${formatTime(item.scheduled_at)}` : ""}
                        </Text>
                        {item.status ? (
                          <View
                            style={[
                              twStyle(`rounded-full px-2 py-0.5 ${statusBg}`),
                            ]}
                          >
                            <Text
                              style={twStyle(`text-xs font-medium capitalize ${statusColor}`)}
                            >
                              {item.status.replace(/_/g, " ")}
                            </Text>
                          </View>
                        ) : null}
                        {item.team_member_name ? (
                          <Text style={twStyle("text-xs text-gray-400")}>
                            with {item.team_member_name}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={twStyle("items-end ml-2")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {formatCurrency(item.amount)}
                      </Text>
                      {isAppointment ? (
                        <Ionicons name="chevron-forward" size={14} color="#d1d5db" style={{ marginTop: 4 }} />
                      ) : (
                        <Text style={twStyle("text-xs text-gray-400 mt-1")}>Sale</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit client details — full_name / email / phone / DOB / opt-ins.
          The PATCH endpoint already writes these to the `users` row so we
          stay in parity with provider-web's ClientFormData dialog. */}
      <BottomSheet
        visible={detailsSheetOpen}
        onClose={() => {
          setDetailsSheetOpen(false);
          setShowDobPicker(false);
        }}
        title="Edit client details"
        subtitle="These fields are saved on the customer's profile."
        snapHeight="full"
      >
        <View style={twStyle("gap-4")}>
          <View>
            <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Full name
            </Text>
            <TextInput
              value={formFullName}
              onChangeText={setFormFullName}
              placeholder="First Last"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
              style={{
                borderWidth: 1.5,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: "#111827",
                backgroundColor: "#fafafa",
              }}
              accessibilityLabel="Client full name"
            />
          </View>

          <View>
            <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Email
            </Text>
            <TextInput
              value={formEmail}
              onChangeText={setFormEmail}
              placeholder="client@example.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                borderWidth: 1.5,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: "#111827",
                backgroundColor: "#fafafa",
              }}
              accessibilityLabel="Client email"
            />
          </View>

          <View>
            <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Phone
            </Text>
            <TextInput
              value={formPhone}
              onChangeText={setFormPhone}
              placeholder="+27 82 123 4567"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              style={{
                borderWidth: 1.5,
                borderColor: "#e5e7eb",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: "#111827",
                backgroundColor: "#fafafa",
              }}
              accessibilityLabel="Client phone"
            />
          </View>

          <View>
            <Text style={twStyle("mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Date of birth
            </Text>
            <View style={twStyle("flex-row items-center gap-2")}>
              <TouchableOpacity
                onPress={() => setShowDobPicker((v) => !v)}
                style={[
                  twStyle("flex-1 flex-row items-center rounded-xl border border-gray-200 px-3.5 py-3"),
                  { backgroundColor: "#fafafa" },
                ]}
                accessibilityLabel="Pick date of birth"
                accessibilityRole="button"
              >
                <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                <Text
                  style={twStyle(
                    `ml-2 text-sm ${formDob ? "text-gray-900" : "text-gray-400"}`,
                  )}
                >
                  {dobLabel || "Select birthday"}
                </Text>
              </TouchableOpacity>
              {formDob ? (
                <TouchableOpacity
                  onPress={() => {
                    setFormDob("");
                    setShowDobPicker(false);
                  }}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-3")}
                  accessibilityLabel="Clear date of birth"
                >
                  <Ionicons name="close" size={16} color="#6b7280" />
                </TouchableOpacity>
              ) : null}
            </View>
            {showDobPicker ? (
              <View style={{ marginTop: 8 }}>
                <DateTimePicker
                  value={formDob ? new Date(formDob) : new Date(2000, 0, 1)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={new Date()}
                  onChange={(_, d) => {
                    setShowDobPicker(Platform.OS === "ios");
                    if (d) setFormDob(formatDateFns(d, "yyyy-MM-dd"));
                  }}
                />
              </View>
            ) : null}
          </View>

          <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-3")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Communication preferences
            </Text>
            <View style={twStyle("flex-row items-center justify-between py-1.5")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>Email marketing</Text>
                <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>
                  Promotions, reminders and receipts.
                </Text>
              </View>
              <Switch
                value={formEmailOptIn}
                onValueChange={(v) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFormEmailOptIn(v);
                }}
                trackColor={{ false: "#e5e7eb", true: "#1f2937" }}
                thumbColor="#ffffff"
                accessibilityLabel="Email marketing toggle"
              />
            </View>
            <View style={twStyle("flex-row items-center justify-between py-1.5")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>SMS messages</Text>
                <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>
                  Booking confirmations and reminders.
                </Text>
              </View>
              <Switch
                value={formSmsOptIn}
                onValueChange={(v) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFormSmsOptIn(v);
                }}
                trackColor={{ false: "#e5e7eb", true: "#1f2937" }}
                thumbColor="#ffffff"
                accessibilityLabel="SMS messages toggle"
              />
            </View>
          </View>

          <View style={twStyle("mt-2 flex-row gap-2")}>
            <TouchableOpacity
              onPress={() => {
                setDetailsSheetOpen(false);
                setShowDobPicker(false);
              }}
              style={twStyle(
                "flex-1 items-center justify-center rounded-xl border border-gray-200 py-3",
              )}
              accessibilityLabel="Cancel client edit"
            >
              <Text style={twStyle("text-sm font-medium text-gray-600")}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveDetails}
              disabled={detailsSaving}
              style={[
                twStyle("flex-1 items-center justify-center rounded-xl bg-gray-900 py-3"),
                detailsSaving ? { opacity: 0.6 } : undefined,
              ]}
              accessibilityLabel="Save client details"
            >
              <Text style={twStyle("text-sm font-semibold text-white")}>
                {detailsSaving ? "Saving…" : "Save changes"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
