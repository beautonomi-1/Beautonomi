import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  SectionList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS,
  labelForSupportTicketCategory,
  SUPPORT_TICKET_ALL_ITEMS,
} from "@/lib/supportTicketCategoryPresets";
import { useTranslation } from "@beautonomi/i18n";

type CategoryRow = { value: string; label: string };
type CategorySection = { title: string; data: CategoryRow[] };

interface SupportTicketCategoryPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function SupportTicketCategoryPicker({ value, onChange }: SupportTicketCategoryPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sections: CategorySection[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return SUPPORT_TICKET_CATEGORY_GROUPS.map((g) => ({ title: g.label, data: g.items }));
    }
    const matches = SUPPORT_TICKET_ALL_ITEMS.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.value.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q),
    );
    return matches.length === 0
      ? []
      : [
          {
            title: t("customer.mobile.components.supportTicketCategory.searchResultsSection"),
            data: matches.map(({ value: v, label: l }) => ({ value: v, label: l })),
          },
        ];
  }, [query, t]);

  const select = useCallback(
    (v: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(v);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setQuery("");
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
        accessibilityLabel={t("customer.mobile.components.supportTicketCategory.chooseCategoryA11y")}
        accessibilityRole="button"
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], marginBottom: 2 }}>
            {t("customer.mobile.components.supportTicketCategory.categoryFieldLabel")}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={2}>
            {labelForSupportTicketCategory(value)}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color={Colors.gray[400]} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#fff" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
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
            <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900] }}>
              {t("customer.mobile.components.supportTicketCategory.modalTitle")}
            </Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityLabel={t("customer.mobile.components.supportTicketCategory.closeA11y")}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.primary }}>
                {t("customer.mobile.components.supportTicketCategory.done")}
              </Text>
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
                placeholder={t("customer.mobile.components.supportTicketCategory.searchPlaceholder")}
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

          <SectionList<CategoryRow, CategorySection>
            sections={sections}
            keyExtractor={(item: CategoryRow) => item.value}
            keyboardShouldPersistTaps="handled"
            renderSectionHeader={({ section }: { section: CategorySection }) => (
              <View
                style={{
                  backgroundColor: "#f9fafb",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.gray[100],
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.5 }}>
                  {section.title.toUpperCase()}
                </Text>
              </View>
            )}
            renderItem={({ item }: { item: CategoryRow }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  onPress={() => select(item.value)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: pressed ? Colors.gray[50] : "#fff",
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.gray[50],
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
                      {item.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : null}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: Colors.gray[500], textAlign: "center" }}>No categories match your search.</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
