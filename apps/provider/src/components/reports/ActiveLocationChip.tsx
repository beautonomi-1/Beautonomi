import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";

/**
 * Small "Showing: <branch>" chip for report/dashboard headers. Only renders when
 * the provider has more than one location AND a specific branch is selected, so
 * switching the global location filter is never silent. Renders nothing for the
 * org-wide (all locations) view to avoid clutter.
 */
export function ActiveLocationChip({ style }: { style?: object }) {
  const { provider, selectedLocationId } = useProvider();
  const locations = provider?.locations ?? [];
  if (locations.length <= 1 || !selectedLocationId) return null;
  const active = locations.find((l) => l.id === selectedLocationId);
  if (!active) return null;
  return (
    <View
      style={[
        twStyle(
          "mb-3 self-start flex-row items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1",
        ),
        style,
      ]}
    >
      <Ionicons name="location-outline" size={13} color="#6b7280" />
      <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")} numberOfLines={1}>
        Showing: {active.name}
      </Text>
    </View>
  );
}
