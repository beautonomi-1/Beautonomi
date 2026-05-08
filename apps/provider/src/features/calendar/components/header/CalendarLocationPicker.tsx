import { Text, TouchableOpacity, View, ScrollView } from "react-native";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface Location {
  id: string;
  name: string;
}

interface Props {
  locations: Location[];
  selectedLocationId: string | null;
  onSelect: (id: string | null) => void;
}

export function CalendarLocationPicker({ locations, selectedLocationId, onSelect }: Props) {
  if (locations.length <= 1) return null;
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: Colors.gray[100],
        backgroundColor: Colors.white,
        paddingVertical: 6,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row" }}
      >
        <TouchableOpacity
          onPress={() => onSelect(null)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: !selectedLocationId ? Colors.primary : Colors.gray[100],
            minHeight: 34,
          }}
          accessibilityRole="button"
        >
          <Ionicons
            name="location-outline"
            size={13}
            color={!selectedLocationId ? Colors.white : Colors.gray[600]}
          />
          <Text
            style={{
              marginLeft: 5,
              fontSize: 13,
              fontWeight: "600",
              color: !selectedLocationId ? Colors.white : Colors.gray[700],
            }}
          >
            All
          </Text>
        </TouchableOpacity>
        {locations.map((loc) => {
          const active = selectedLocationId === loc.id;
          return (
            <TouchableOpacity
              key={loc.id}
              onPress={() => onSelect(loc.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: active ? Colors.primary : Colors.gray[100],
                minHeight: 34,
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: active ? Colors.white : Colors.gray[700] }}>
                {loc.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
