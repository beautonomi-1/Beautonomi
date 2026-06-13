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
  mergeVerificationCountries,
  resolveDefaultVerificationCountryIso,
  STATIC_VERIFICATION_COUNTRIES,
  type VerificationCountryOption,
} from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

type CountryOfIssuePickerProps = {
  value: string;
  onChange: (isoCode: string) => void;
  label?: string;
  disabled?: boolean;
  tenantRegionCode?: string | null;
  tenantRegionName?: string | null;
};

export function CountryOfIssuePicker({
  value,
  onChange,
  label = "Country of issue",
  disabled = false,
  tenantRegionCode,
  tenantRegionName,
}: CountryOfIssuePickerProps) {
  const { screenPadding } = useResponsive();
  const [countries, setCountries] = useState<VerificationCountryOption[]>(
    STATIC_VERIFICATION_COUNTRIES,
  );
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const defaultIso = useMemo(
    () =>
      resolveDefaultVerificationCountryIso({
        tenantRegionCode,
        tenantRegionName,
        deviceIso: getDeviceRegionCountryIso(),
      }),
    [tenantRegionCode, tenantRegionName],
  );

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

  useEffect(() => {
    if (!value && defaultIso && countries.some((c) => c.code === defaultIso)) {
      onChange(defaultIso);
    }
  }, [value, defaultIso, countries, onChange]);

  const selected = useMemo(
    () => countries.find((c) => c.code === value) ?? null,
    [countries, value],
  );

  const filtered = useMemo(
    () => filterVerificationCountries(countries, search),
    [countries, search],
  );

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  return (
    <View>
      <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2")}>{label}</Text>
      <TouchableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Country of issue: ${selected.name}` : "Select country of issue"}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          backgroundColor: disabled ? Colors.gray[50] : "#fff",
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 16, color: selected ? Colors.gray[900] : Colors.gray[400] }}>
          {loading ? "Loading countries…" : selected?.name ?? "Select country"}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.gray[400]} />
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
            <View
              style={{
                paddingHorizontal: screenPadding,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
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
                    onChange(item.code);
                    close();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: screenPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: value === item.code ? Colors.primary : "#111827",
                      fontWeight: value === item.code ? "700" : "400",
                    }}
                  >
                    {item.name}
                  </Text>
                  {value === item.code ? (
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
