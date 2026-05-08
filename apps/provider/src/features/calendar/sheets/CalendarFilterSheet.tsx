import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import type { CalendarFilters } from "@/features/calendar/types/filters";

interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  visible: boolean;
  filters: CalendarFilters;
  staffOptions: FilterOption[];
  locationOptions: FilterOption[];
  offersMobileServices?: boolean;
  onApply: (f: CalendarFilters) => void;
  onClose: () => void;
}

export function CalendarFilterSheet({
  visible,
  filters,
  staffOptions,
  locationOptions,
  offersMobileServices,
  onApply,
  onClose,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters" snapHeight="auto" showHandle>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {locationOptions.length > 1 && (
          <FilterSection title="Location">
            {locationOptions.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                selected={filters.locationFilter === o.value}
                onPress={() => onApply({ ...filters, locationFilter: o.value })}
              />
            ))}
          </FilterSection>
        )}

        {staffOptions.length > 1 && (
          <FilterSection title="Staff">
            {staffOptions.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                selected={filters.staffFilter === o.value}
                onPress={() => onApply({ ...filters, staffFilter: o.value })}
              />
            ))}
          </FilterSection>
        )}

        <FilterSection title="Payment">
          {[
            { value: "all", label: "All" },
            { value: "attention", label: "Needs Attention" },
            { value: "paid", label: "Paid" },
          ].map((o) => (
            <OptionRow
              key={o.value}
              label={o.label}
              selected={filters.paymentFilter === o.value}
              onPress={() => onApply({ ...filters, paymentFilter: o.value as CalendarFilters["paymentFilter"] })}
            />
          ))}
        </FilterSection>

        {offersMobileServices && (
          <FilterSection title="Mode">
            <OptionRow
              label="At Home"
              selected={filters.showAtHome}
              onPress={() => onApply({ ...filters, showAtHome: !filters.showAtHome })}
            />
          </FilterSection>
        )}

        <TouchableOpacity
          style={{
            marginTop: 8,
            borderRadius: 12,
            paddingVertical: 12,
            backgroundColor: Colors.gray[100],
            alignItems: "center",
          }}
          onPress={() =>
            onApply({
              staffFilter: "all",
              locationFilter: "all",
              statusFilters: [],
              paymentFilter: "all",
              showAtHome: false,
            })
          }
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[700] }}>Clear All</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.gray[400], letterSpacing: 0.8, marginBottom: 10 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.gray[100],
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={{ fontSize: 15, color: selected ? Colors.primary : Colors.gray[800], fontWeight: selected ? "700" : "400" }}>
        {label}
      </Text>
      {selected && (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 12, color: Colors.white, fontWeight: "700" }}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
