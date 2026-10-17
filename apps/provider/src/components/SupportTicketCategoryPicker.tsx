import { useState, useCallback, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import {
  groupForCategory,
  groupLabelForSupportTicketCategoryI18n,
  labelForSupportTicketCategoryI18n,
  labelForSupportTicketGroupI18n,
  listGroupsForAudience,
  searchCategories,
  type SupportTicketCategoryAudience,
} from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

const GROUP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  account_security: "person-circle-outline",
  bookings: "calendar-outline",
  payments: "card-outline",
  messaging_providers: "chatbubbles-outline",
  products: "cube-outline",
  tech: "phone-portrait-outline",
  safety: "shield-outline",
  partners: "storefront-outline",
  feedback: "bulb-outline",
};

interface SupportTicketCategoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  audience?: SupportTicketCategoryAudience;
}

export function SupportTicketCategoryPicker({
  value,
  onChange,
  audience = "provider",
}: SupportTicketCategoryPickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sc = (key: string) => t(`provider.mobile.components.supportTicketCategory.${key}`) as string;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const groups = useMemo(() => listGroupsForAudience(audience), [audience]);
  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const searchHits = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return searchCategories(q, audience);
  }, [query, audience]);

  const select = useCallback(
    (v: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(v);
      setOpen(false);
      setQuery("");
      setActiveGroupId(null);
    },
    [onChange],
  );

  const displayLabel = value ? labelForSupportTicketCategoryI18n(value, t) : "";
  const displayGroup = value ? groupLabelForSupportTicketCategoryI18n(value, t) : null;

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setQuery("");
          setActiveGroupId(value ? groupForCategory(value)?.id ?? null : null);
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          backgroundColor: Colors.white,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
        accessibilityLabel={sc("chooseCategoryA11y")}
        accessibilityRole="button"
      >
        <View style={{ flex: 1, marginEnd: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], marginBottom: 2 }}>
            {sc("categoryFieldLabel")}
          </Text>
          {value ? (
            <>
              {displayGroup ? (
                <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                  {displayGroup.toUpperCase()}
                </Text>
              ) : null}
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={2}>
                {displayLabel}
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 14, color: Colors.gray[400] }}>{sc("searchPlaceholder")}</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={20} color={Colors.gray[400]} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }} behavior="padding">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: Colors.gray[100],
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              {activeGroup && !query.trim() ? (
                <TouchableOpacity onPress={() => setActiveGroupId(null)} hitSlop={12} style={{ marginEnd: 8 }}>
                  <Ionicons name="chevron-back" size={24} color={Colors.gray[700]} />
                </TouchableOpacity>
              ) : null}
              <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900], flex: 1 }} numberOfLines={1}>
                {activeGroup && !query.trim() ? activeGroup.label : sc("modalTitle")}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel={sc("closeA11y")}>
              <Ionicons name="close" size={26} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: Colors.gray[100],
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="search" size={18} color={Colors.gray[400]} />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, color: Colors.gray[900] }}
                placeholder={sc("searchPlaceholder")}
                placeholderTextColor={Colors.gray[400]}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12 }}
          >
            {query.trim() ? (
              searchHits.length === 0 ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: Colors.gray[500], textAlign: "center", marginBottom: 16 }}>{sc("noCategoriesMatch")}</Text>
                  <TouchableOpacity
                    onPress={() => select("general_inquiry")}
                    style={{
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>General question</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                searchHits.map((hit) => {
                  const selected = hit.value === value;
                  return (
                    <Pressable
                      key={hit.value}
                      onPress={() => select(hit.value)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        borderRadius: 12,
                        marginBottom: 4,
                        backgroundColor: pressed ? Colors.gray[50] : selected ? `${Colors.primary}14` : "#fff",
                      })}
                    >
                      <Text style={{ fontSize: 15, fontWeight: selected ? "700" : "500", color: Colors.gray[900] }}>
                        {labelForSupportTicketCategoryI18n(hit.value, t)}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>{hit.groupLabel}</Text>
                    </Pressable>
                  );
                })
              )
            ) : activeGroup ? (
              activeGroup.items.map((item) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => select(item.value)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 14,
                      borderRadius: 12,
                      marginBottom: 4,
                      backgroundColor: pressed ? Colors.gray[50] : selected ? `${Colors.primary}14` : "#fff",
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          color: selected ? Colors.primary : Colors.gray[900],
                          fontWeight: selected ? "700" : "400",
                        }}
                      >
                        {labelForSupportTicketCategoryI18n(item.value, t)}
                      </Text>
                      {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : null}
                    </View>
                  </Pressable>
                );
              })
            ) : (
              groups.map((g) => {
                const iconName = GROUP_ICONS[g.id] ?? "help-circle-outline";
                const safety = g.id === "safety";
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => setActiveGroupId(g.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 14,
                      marginBottom: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: safety ? "#FECACA" : Colors.gray[200],
                      backgroundColor: pressed ? Colors.gray[50] : safety ? "#FEF2F2" : "#fff",
                    })}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: safety ? "#FEE2E2" : `${Colors.primary}18`,
                        marginEnd: 12,
                      }}
                    >
                      <Ionicons name={iconName} size={22} color={safety ? "#B91C1C" : Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>
                        {labelForSupportTicketGroupI18n(g.id, g.label, t)}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }} numberOfLines={2}>
                        {g.description}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
