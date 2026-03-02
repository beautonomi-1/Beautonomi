import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useProvider } from "@/providers/ProviderContext";

export function LocationSwitcher() {
  const { provider, selectedLocationId, setSelectedLocationId } = useProvider();
  const [visible, setVisible] = useState(false);

  const locations = provider?.locations ?? [];
  if (locations.length <= 1) return null;

  const current = locations.find((l) => l.id === selectedLocationId);

  function handleSelect(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLocationId(id);
    setVisible(false);
  }

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center rounded-lg bg-gray-50 px-3 py-2"
        onPress={() => {
          Haptics.selectionAsync();
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Current location: ${current?.name ?? "All"}. Tap to switch.`}
      >
        <Ionicons name="location-outline" size={14} color="#6b7280" />
        <Text className="ml-1.5 text-xs font-medium text-gray-700" numberOfLines={1}>
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
          className="flex-1 items-center justify-center bg-black/40"
          onPress={() => setVisible(false)}
        >
          <Pressable
            className="mx-8 w-80 overflow-hidden rounded-2xl bg-white"
            onPress={() => {}}
          >
            {/* Header */}
            <View className="border-b border-gray-100 px-5 py-4">
              <Text className="text-base font-bold text-gray-900">
                Switch Location
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500">
                Data will update for the selected location
              </Text>
            </View>

            {/* Location list */}
            {locations.map((loc, idx) => {
              const isSelected = loc.id === selectedLocationId;
              return (
                <TouchableOpacity
                  key={loc.id}
                  className={`min-h-[56px] flex-row items-center px-5 py-3 ${
                    idx < locations.length - 1 ? "border-b border-gray-50" : ""
                  } ${isSelected ? "bg-indigo-50" : ""}`}
                  onPress={() => handleSelect(loc.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${loc.name}, ${loc.city}`}
                >
                  <View
                    className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${
                      isSelected ? "bg-indigo-100" : "bg-gray-100"
                    }`}
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={isSelected ? "#6366f1" : "#6b7280"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? "text-indigo-700" : "text-gray-900"
                      }`}
                    >
                      {loc.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
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
            <View className="border-t border-gray-100 px-5 py-3">
              <TouchableOpacity
                className="min-h-[44px] items-center justify-center rounded-xl bg-gray-100"
                onPress={() => setVisible(false)}
                accessibilityLabel="Close location switcher"
              >
                <Text className="text-sm font-medium text-gray-700">Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
