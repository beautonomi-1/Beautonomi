import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  filterVerificationCountries,
  findVerificationCountry,
  mergeVerificationCountries,
  STATIC_VERIFICATION_COUNTRIES,
  type VerificationCountryOption,
} from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { RADIUS_INPUT } from "@/constants/layout";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

export interface AddressCountryPickerProps {
  /** Display name as stored on the address (e.g. "South Africa"), not an ISO code. */
  value: string;
  onChange: (countryName: string) => void;
  label?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Searchable country picker for address forms. Unlike CountryOfIssuePicker
 * (which stores ISO codes for KYC), this returns the full display name since
 * address `country` fields are persisted as names elsewhere in the app.
 */
export function AddressCountryPicker({
  value,
  onChange,
  label = "Country",
  disabled = false,
  required = false,
}: AddressCountryPickerProps) {
  const [countries, setCountries] = useState<VerificationCountryOption[]>(
    STATIC_VERIFICATION_COUNTRIES,
  );
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<Array<{ code: string; name: string }>>("/api/public/countries");
        if (!cancelled && res.data) {
          setCountries(mergeVerificationCountries(res.data));
        }
      } catch {
        // Keep static fallback.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the stored value against the known list so legacy free-text
  // entries (typos, alternate spellings) still render sensibly.
  const selected = useMemo(() => findVerificationCountry(countries, value), [countries, value]);
  const displayText = selected?.name ?? value?.trim() ?? "";

  const filtered = useMemo(() => filterVerificationCountries(countries, search), [countries, search]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>
        {label}
        {required && <Text style={{ color: Colors.primary }}> *</Text>}
      </Text>
      <TouchableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={displayText ? `Country: ${displayText}` : "Select country"}
        style={{
          borderRadius: RADIUS_INPUT,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          backgroundColor: disabled ? Colors.gray[50] : "#fff",
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, color: displayText ? "#1E293B" : "#94A3B8" }}>
          {loading && !displayText ? "Loading countries…" : displayText || "Select country"}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#94A3B8" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={close}
        >
          <Pressable
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "75%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
              <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>
                Select country
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F3F4F6",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, color: "#111827" }}
                  placeholder="Search country..."
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search country"
                />
              </View>
            </View>
            <FlatList<VerificationCountryOption>
              {...verticalFlatListPerf}
              data={filtered}
              keyExtractor={(item: VerificationCountryOption) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: VerificationCountryOption }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange(item.name);
                    close();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.name}`}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: item.code === selected?.code ? Colors.primary : "#111827",
                      fontWeight: item.code === selected?.code ? "700" : "400",
                    }}
                  >
                    {item.name}
                  </Text>
                  {item.code === selected?.code ? (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
