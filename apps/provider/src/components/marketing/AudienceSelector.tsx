/**
 * Campaign audience picker for the provider mobile app.
 *
 * Mirrors the web SegmentBuilder + ClientSelector so providers can target all
 * clients, a behavioural segment, or a hand-picked list — feeding the same
 * `recipient_type` / `segment_criteria` / `recipient_ids` the campaigns API
 * already understands.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";

/** Indigo accent to match the surrounding campaign create sheet. */
const ACCENT = "#4338ca";

export type RecipientType = "all_clients" | "segment" | "custom";

export interface SegmentCriteria {
  min_bookings?: number;
  min_spent?: number;
  last_booking_days?: number;
  is_favorite?: boolean;
}

interface ProviderClient {
  id: string;
  customer_id: string;
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  total_bookings?: number | null;
  total_spent?: number | null;
  is_favorite?: boolean | null;
}

type ClientsResponse = ProviderClient[] | { data?: ProviderClient[] };

const LAST_BOOKING_OPTIONS = [
  { labelKey: "lastAnyTime", value: undefined as number | undefined },
  { labelKey: "last7Days", value: 7 },
  { labelKey: "last30Days", value: 30 },
  { labelKey: "last90Days", value: 90 },
  { labelKey: "last6Months", value: 180 },
];

export interface AudienceValue {
  recipientType: RecipientType;
  segmentCriteria: SegmentCriteria;
  recipientIds: string[];
}

interface Props {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ marginBottom: 4, fontSize: 12, color: Colors.gray[500] }}>{label}</Text>
      <TextInput
        value={value != null ? String(value) : ""}
        onChangeText={(t) => {
          const cleaned = t.replace(/[^0-9.]/g, "");
          onChange(cleaned ? Number(cleaned) : undefined);
        }}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        style={{ borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: Colors.gray[900] }}
      />
    </View>
  );
}

export function AudienceSelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const as = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.components.audienceSelector.${key}`, opts) as string,
    [t],
  );
  const { recipientType, segmentCriteria, recipientIds } = value;
  const [search, setSearch] = useState("");
  const clientsApi = useApi<ClientsResponse>("/api/provider/clients?limit=200", {
    enabled: recipientType === "custom",
    staleTimeMs: 60_000,
  });

  const clients: ProviderClient[] = useMemo(() => {
    const raw = clientsApi.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [clientsApi.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = c.customer?.full_name?.toLowerCase() ?? "";
      const email = c.customer?.email?.toLowerCase() ?? "";
      const phone = c.customer?.phone ?? "";
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [clients, search]);

  const setType = useCallback(
    (t: RecipientType) => onChange({ ...value, recipientType: t }),
    [onChange, value],
  );
  const setCriteria = useCallback(
    (patch: Partial<SegmentCriteria>) =>
      onChange({ ...value, segmentCriteria: { ...segmentCriteria, ...patch } }),
    [onChange, value, segmentCriteria],
  );
  const toggleClient = useCallback(
    (customerId: string) => {
      const next = recipientIds.includes(customerId)
        ? recipientIds.filter((id) => id !== customerId)
        : [...recipientIds, customerId];
      onChange({ ...value, recipientIds: next });
    },
    [onChange, value, recipientIds],
  );

  const TYPE_OPTIONS: { key: RecipientType; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "all_clients", labelKey: "allClients", icon: "people-outline" },
    { key: "segment", labelKey: "segment", icon: "filter-outline" },
    { key: "custom", labelKey: "specific", icon: "person-add-outline" },
  ];

  return (
    <View>
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{as("audience")}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TYPE_OPTIONS.map((opt) => {
          const active = recipientType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setType(opt.key)}
              style={{ flex: 1, alignItems: "center", gap: 4, borderRadius: 12, borderWidth: 1, borderColor: active ? ACCENT : Colors.gray[200], backgroundColor: active ? "#eef2ff" : Colors.white, paddingVertical: 10 }}
            >
              <Ionicons name={opt.icon} size={18} color={active ? ACCENT : Colors.gray[500]} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: active ? ACCENT : Colors.gray[600] }}>{as(opt.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {recipientType === "all_clients" ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: Colors.gray[500] }}>
          {as("allClientsHint")}
        </Text>
      ) : null}

      {recipientType === "segment" ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <NumberField
              label={as("minBookings")}
              value={segmentCriteria.min_bookings}
              onChange={(n) => setCriteria({ min_bookings: n })}
              placeholder={as("placeholderZero")}
            />
            <NumberField
              label={as("minSpent")}
              value={segmentCriteria.min_spent}
              onChange={(n) => setCriteria({ min_spent: n })}
              placeholder={as("placeholderZero")}
            />
          </View>
          <View>
            <Text style={{ marginBottom: 6, fontSize: 12, color: Colors.gray[500] }}>{as("lastBookingWithin")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {LAST_BOOKING_OPTIONS.map((opt) => {
                const active = segmentCriteria.last_booking_days === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.labelKey}
                    onPress={() => setCriteria({ last_booking_days: opt.value })}
                    style={{ borderRadius: 9999, borderWidth: 1, borderColor: active ? ACCENT : Colors.gray[200], backgroundColor: active ? "#eef2ff" : Colors.white, paddingHorizontal: 12, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: active ? ACCENT : Colors.gray[600] }}>{as(opt.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setCriteria({ is_favorite: segmentCriteria.is_favorite ? undefined : true })}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Ionicons
              name={segmentCriteria.is_favorite ? "checkbox" : "square-outline"}
              size={20}
              color={segmentCriteria.is_favorite ? ACCENT : Colors.gray[400]}
            />
            <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{as("onlyFavourites")}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
            {as("recipientCountHint")}
          </Text>
        </View>
      ) : null}

      {recipientType === "custom" ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
              {as("selectedCount", { count: recipientIds.length })}
            </Text>
            {recipientIds.length > 0 ? (
              <TouchableOpacity onPress={() => onChange({ ...value, recipientIds: [] })}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: ACCENT }}>{as("clear")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 10 }}>
            <Ionicons name="search" size={16} color={Colors.gray[400]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={as("searchClients")}
              placeholderTextColor="#9ca3af"
              style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, color: Colors.gray[900] }}
            />
          </View>
          <View style={{ marginTop: 8, maxHeight: 240, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
            {clientsApi.loading && clients.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: Colors.gray[500] }}>
                  {search ? as("noMatch") : as("noClients")}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filtered.map((c) => {
                  const selected = recipientIds.includes(c.customer_id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => toggleClient(c.customer_id)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], backgroundColor: selected ? "#eef2ff" : Colors.white }}
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={20}
                        color={selected ? ACCENT : Colors.gray[400]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                          {c.customer?.full_name || as("clientFallback")}
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[500] }} numberOfLines={1}>
                          {c.customer?.email || c.customer?.phone || as("noContact")}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
          {clientsApi.error ? (
            <Text style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{as("loadFailed")}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
