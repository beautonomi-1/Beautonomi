import { ScrollView, TouchableOpacity, Text } from "react-native";
import { Colors } from "@/constants/colors";

interface FilterChipGroupProps {
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
}

export function FilterChipGroup({ options, selected, onSelect }: FilterChipGroupProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4, flexDirection: "row" }}
    >
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={{
              minHeight: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              paddingHorizontal: 20,
              paddingVertical: 10,
              marginRight: 8,
              ...(isActive ? { backgroundColor: Colors.primary } : { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" }),
            }}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: isActive ? "#fff" : "#4b5563" }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
