import { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { Avatar } from "@/components/ui/Avatar";
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
  default_address?: ClientDefaultAddress | null;
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
  total_bookings: number;
  total_spent: number;
  history: HistoryItem[];
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

  const {
    data: client,
    loading,
    error,
    refresh,
  } = useApi<ClientDetail>(`/api/provider/clients/${clientId}`, {
    enabled: !!clientId,
  });
  const { execute: patchClient } = useApiMutation("patch");

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
    refresh();
  }, [refresh]);

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

  const customer = client.customer ?? {};
  const name = customer.full_name ?? "Client";
  const history = client.history ?? [];
  const clientTags = client.tags ?? [];
  const homeAddressLocked = Boolean(customer.default_address?.customer_managed_home);

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
              <Avatar name={name} size="lg" />
              <View style={twStyle("ml-4 flex-1")}>
                <Text style={twStyle("text-lg font-bold text-gray-900")}>{name}</Text>
                {customer.phone ? (
                  <Text style={twStyle("text-sm text-gray-500 mt-0.5")}>{customer.phone}</Text>
                ) : null}
                {customer.email ? (
                  <Text style={twStyle("text-sm text-gray-500")}>{customer.email}</Text>
                ) : null}
              </View>
            </View>

            {/* Stats row */}
            <View style={twStyle("mt-3 flex-row rounded-xl bg-gray-50 px-3 py-3")}>
              <View style={{ flex: 1 }}>
                <Text style={twStyle("text-xs text-gray-400")}>Bookings</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {client.total_bookings}
                </Text>
              </View>
              <View style={twStyle("h-10 w-px bg-gray-200")} />
              <View style={{ flex: 1, paddingLeft: 16 }}>
                <Text style={twStyle("text-xs text-gray-400")}>Total spent</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {formatCurrency(client.total_spent)}
                </Text>
              </View>
            </View>

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
    </ScreenContainer>
  );
}
