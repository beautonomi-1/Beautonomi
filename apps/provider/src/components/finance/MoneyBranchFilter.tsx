import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";

type MoneyBranchFilterProps = {
  value: string | null;
  onChange: (locationId: string | null) => void;
};

/**
 * Money-hub branch scope — always visible so filtering is never silent.
 * Defaults to all branches (null); does not reuse the global dashboard location filter.
 */
export function MoneyBranchFilter({ value, onChange }: MoneyBranchFilterProps) {
  const { provider } = useProvider();
  const [visible, setVisible] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetWidth = Math.min(420, windowWidth * 0.92);
  const listMaxHeight = Math.min(windowHeight * 0.55, 420);

  const locations = provider?.locations ?? [];
  const current = value ? locations.find((l) => l.id === value) : null;
  const label = current?.name ?? "All branches";

  function handleSelectAll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(null);
    setVisible(false);
  }

  function handleSelectBranch(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(id);
    setVisible(false);
  }

  return (
    <>
      <TouchableOpacity
        style={[
          twStyle(
            "mb-3 self-start flex-row items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5",
          ),
        ]}
        onPress={() => {
          Haptics.selectionAsync();
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Money scope: ${label}. Tap to change branch filter.`}
      >
        <Ionicons name="location-outline" size={14} color="#6b7280" />
        <Text style={twStyle("ml-1.5 text-xs font-medium text-gray-700")} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={twStyle("flex-1 items-center justify-center bg-black/40")} onPress={() => setVisible(false)}>
          <Pressable
            style={[twStyle("overflow-hidden rounded-2xl bg-white"), { width: sheetWidth, alignSelf: "center" }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={twStyle("border-b border-gray-100 px-5 py-4")}>
              <Text style={twStyle("text-base font-bold text-gray-900")}>Money scope</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                Filter earnings, ledger and sales by branch, or show all branches
              </Text>
            </View>

            <ScrollView style={{ maxHeight: listMaxHeight }} keyboardShouldPersistTaps="handled" bounces={false}>
              <TouchableOpacity
                style={twStyle(
                  `min-h-[56px] flex-row items-center border-b border-gray-50 px-5 py-3 ${
                    value == null ? "bg-indigo-50" : ""
                  }`,
                )}
                onPress={handleSelectAll}
                accessibilityRole="radio"
                accessibilityState={{ selected: value == null }}
              >
                <View
                  style={twStyle(
                    `mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                      value == null ? "bg-indigo-100" : "bg-gray-100"
                    }`,
                  )}
                >
                  <Ionicons name="globe-outline" size={18} color={value == null ? "#6366f1" : "#6b7280"} />
                </View>
                <View style={twStyle("flex-1")}>
                  <Text
                    style={twStyle(
                      `text-sm font-medium ${value == null ? "text-indigo-700" : "text-gray-900"}`,
                    )}
                  >
                    All branches
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Org-wide totals and activity</Text>
                </View>
                {value == null ? <Ionicons name="checkmark-circle" size={20} color="#6366f1" /> : null}
              </TouchableOpacity>

              {locations.map((loc, idx) => {
                const isSelected = loc.id === value;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    style={twStyle(
                      `min-h-[56px] flex-row items-center px-5 py-3 ${
                        idx < locations.length - 1 ? "border-b border-gray-50" : ""
                      } ${isSelected ? "bg-indigo-50" : ""}`,
                    )}
                    onPress={() => handleSelectBranch(loc.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={twStyle(
                        `mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                          isSelected ? "bg-indigo-100" : "bg-gray-100"
                        }`,
                      )}
                    >
                      <Ionicons
                        name="business-outline"
                        size={18}
                        color={isSelected ? "#6366f1" : "#6b7280"}
                      />
                    </View>
                    <View style={twStyle("flex-1")}>
                      <Text
                        style={twStyle(`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`)}
                      >
                        {loc.name}
                      </Text>
                      <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                        {loc.address_line1}, {loc.city}
                      </Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={20} color="#6366f1" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={twStyle("border-t border-gray-100 px-5 py-3")}>
              <TouchableOpacity
                style={twStyle("min-h-[44px] items-center justify-center rounded-xl bg-gray-100")}
                onPress={() => setVisible(false)}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
