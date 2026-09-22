import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";

export type RequirementChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
};

/** Shared checklist rows (create readiness + booking completion). */
export function RequirementChecklist({
  items,
  onPressItem,
  title,
}: {
  items: RequirementChecklistItem[];
  title?: string;
  onPressItem?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={twStyle("rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
      {title ?
        <Text style={twStyle("text-xs font-semibold uppercase text-amber-900")}>{title}</Text>
      : null}
      {items.map((item) => {
        const row = (
          <View key={item.id} style={twStyle("mt-1 flex-row items-center")}>
            <Ionicons
              name={item.done ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={item.done ? "#16a34a" : "#d97706"}
            />
            <Text style={twStyle("ms-1.5 flex-1 text-xs text-amber-950")}>
              {item.label}
              {!item.done && item.detail ? ` — ${item.detail}` : ""}
            </Text>
          </View>
        );
        if (onPressItem && !item.done) {
          return (
            <TouchableOpacity key={item.id} onPress={() => onPressItem(item.id)} accessibilityRole="button">
              {row}
            </TouchableOpacity>
          );
        }
        return row;
      })}
    </View>
  );
}
