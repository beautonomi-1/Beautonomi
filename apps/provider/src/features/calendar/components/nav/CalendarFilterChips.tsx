import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import type { CalendarFilters } from "@/features/calendar/types/filters";

export interface FilterOption {
  value: string;
  label: string;
  avatar?: string | null;
}

interface Props {
  staffOptions: FilterOption[];
  locationOptions: FilterOption[];
  filters: CalendarFilters;
  onFiltersChange: (f: Partial<CalendarFilters>) => void;
  offersMobileServices?: boolean;
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        marginRight: 8,
        backgroundColor: active ? Colors.primary : Colors.gray[100],
        borderWidth: active ? 0 : 1,
        borderColor: Colors.gray[200],
        minHeight: 36,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{ fontSize: 13, fontWeight: "600", color: active ? Colors.white : Colors.gray[700] }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function CalendarFilterChips({
  staffOptions,
  locationOptions,
  filters,
  onFiltersChange,
  offersMobileServices,
}: Props) {
  const hasFilters = filters.staffFilter !== "all" || filters.locationFilter !== "all";
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: Colors.gray[100],
        backgroundColor: Colors.white,
        paddingVertical: 8,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        {hasFilters && (
          <TouchableOpacity
            onPress={() => onFiltersChange({ staffFilter: "all", locationFilter: "all" })}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: Colors.gray[200],
              minHeight: 36,
            }}
          >
            <Ionicons name="close" size={14} color={Colors.gray[700]} />
            <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[700], fontWeight: "600" }}>
              Clear
            </Text>
          </TouchableOpacity>
        )}
        {locationOptions.length > 1 &&
          locationOptions.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={filters.locationFilter === o.value}
              onPress={() => onFiltersChange({ locationFilter: o.value })}
            />
          ))}
        {staffOptions.length > 1 &&
          staffOptions.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={filters.staffFilter === o.value}
              onPress={() => onFiltersChange({ staffFilter: o.value })}
            />
          ))}
        {offersMobileServices && (
          <Chip
            label="At Home"
            active={filters.showAtHome}
            onPress={() => onFiltersChange({ showAtHome: !filters.showAtHome })}
          />
        )}
        <Chip
          label="Needs Payment"
          active={filters.paymentFilter === "attention"}
          onPress={() =>
            onFiltersChange({
              paymentFilter: filters.paymentFilter === "attention" ? "all" : "attention",
            })
          }
        />
      </ScrollView>
    </View>
  );
}
