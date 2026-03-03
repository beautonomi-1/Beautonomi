import { ScrollView, TouchableOpacity, Text } from "react-native";

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
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            className={`min-h-[40px] items-center justify-center rounded-full px-5 py-2.5 ${
              isActive ? "bg-gray-900" : "border border-gray-200 bg-white"
            }`}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
          >
            <Text
              className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-600"}`}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
