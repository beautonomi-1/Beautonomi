import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";

export function LocationSwitcher() {
  const { provider, selectedLocationId, setSelectedLocationId } = useProvider();
  const [visible, setVisible] = useState(false);

  const locations = provider?.locations ?? [];
  if (locations.length === 0) return null;

  const current = selectedLocationId ? locations.find((l) => l.id === selectedLocationId) : null;

  function handleSelectBranch(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLocationId(id);
    setVisible(false);
  }

  function handleSelectAll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLocationId(null);
    setVisible(false);
  }

  return (
    <>
      <TouchableOpacity
        style={twStyle("flex-row items-center rounded-lg bg-gray-50 px-3 py-2")}
        onPress={() => {
          Haptics.selectionAsync();
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Current location: ${current?.name ?? "All"}. Tap to switch.`}
      >
        <Ionicons name="location-outline" size={14} color="#6b7280" />
        <Text style={twStyle("ml-1.5 text-xs font-medium text-gray-700")} numberOfLines={1}>
          {current?.name ?? "All Locations"}
        </Text>
        <Ionicons name="chevron-down" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={twStyle("flex-1 items-center justify-center bg-black/40")}
          onPress={() => setVisible(false)}
        >
          <Pressable
            style={twStyle("mx-8 w-80 overflow-hidden rounded-2xl bg-white")}
            onPress={() => {}}
          >
            {/* Header */}
            <View style={twStyle("border-b border-gray-100 px-5 py-4")}>
              <Text style={twStyle("text-base font-bold text-gray-900")}>
                Switch Location
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {locations.length > 1
                  ? "Data will update for the selected location or every branch"
                  : "Filter by this site or see all provider data"}
              </Text>
            </View>

            {/* All locations (org-wide lists) */}
            <TouchableOpacity
              style={twStyle(
                `min-h-[56px] flex-row items-center border-b border-gray-50 px-5 py-3 ${
                  selectedLocationId == null ? "bg-indigo-50" : ""
                }`
              )}
              onPress={handleSelectAll}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedLocationId == null }}
              accessibilityLabel="All locations"
            >
              <View
                style={twStyle(
                  `mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                    selectedLocationId == null ? "bg-indigo-100" : "bg-gray-100"
                  }`
                )}
              >
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={selectedLocationId == null ? "#6366f1" : "#6b7280"}
                />
              </View>
              <View style={twStyle("flex-1")}>
                <Text
                  style={twStyle(
                    `text-sm font-medium ${selectedLocationId == null ? "text-indigo-700" : "text-gray-900"}`
                  )}
                >
                  All locations
                </Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                  Show bookings and data for every branch
                </Text>
              </View>
              {selectedLocationId == null ? (
                <Ionicons name="checkmark-circle" size={20} color="#6366f1" />
              ) : null}
            </TouchableOpacity>

            {/* Per-branch list */}
            {locations.map((loc, idx) => {
              const isSelected = loc.id === selectedLocationId;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={twStyle(`min-h-[56px] flex-row items-center px-5 py-3 ${
                    idx < locations.length - 1 ? "border-b border-gray-50" : ""
                  } ${isSelected ? "bg-indigo-50" : ""}`)}
                  onPress={() => handleSelectBranch(loc.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${loc.name}, ${loc.city}`}
                >
                  <View
                    style={twStyle(`mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                      isSelected ? "bg-indigo-100" : "bg-gray-100"
                    }`)}
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={isSelected ? "#6366f1" : "#6b7280"}
                    />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text
                      style={twStyle(`text-sm font-medium ${
                        isSelected ? "text-indigo-700" : "text-gray-900"
                      }`)}
                    >
                      {loc.name}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {loc.address_line1}, {loc.city}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color="#6366f1" />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Close */}
            <View style={twStyle("border-t border-gray-100 px-5 py-3")}>
              <TouchableOpacity
                style={twStyle("min-h-[44px] items-center justify-center rounded-xl bg-gray-100")}
                onPress={() => setVisible(false)}
                accessibilityLabel="Close location switcher"
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
