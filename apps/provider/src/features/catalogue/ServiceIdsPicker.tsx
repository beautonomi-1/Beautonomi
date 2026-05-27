import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import type { CatalogueServiceItem } from "./types";

interface ServiceIdsPickerProps {
  visible: boolean;
  title: string;
  description?: string;
  services: CatalogueServiceItem[];
  selectedIds: string[];
  /** When editing, exclude the current service from the pick list (web parity). */
  currentServiceId?: string | null;
  onClose: () => void;
  onChange: (ids: string[]) => void;
}

export function ServiceIdsPicker({
  visible,
  title,
  description,
  services,
  selectedIds,
  currentServiceId,
  onClose,
  onChange,
}: ServiceIdsPickerProps) {
  const selectable = services.filter(
    (s) =>
      s.service_type !== "variant" &&
      !s.parent_service_id &&
      s.service_type !== "package" &&
      (!currentServiceId || s.id !== currentServiceId),
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {description ? (
        <Text style={twStyle("mb-3 text-sm text-gray-600")}>{description}</Text>
      ) : null}
      {selectable.length === 0 ? (
        <Text style={twStyle("py-4 text-center text-sm text-gray-500")}>
          No services available to include — add a basic service first.
        </Text>
      ) : (
        selectable.map((svc) => {
          const checked = selectedIds.includes(svc.id);
          const label = svc.title ?? svc.name ?? "Service";
          return (
            <TouchableOpacity
              key={svc.id}
              style={twStyle("flex-row items-center border-b border-gray-100 py-3")}
              onPress={() => toggle(svc.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            >
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={22}
                color={checked ? "#4f46e5" : "#9ca3af"}
              />
              <Text style={twStyle("ml-3 flex-1 text-base text-gray-900")}>{label}</Text>
            </TouchableOpacity>
          );
        })
      )}
      <TouchableOpacity
        style={twStyle("mt-3 rounded-xl bg-indigo-600 py-3")}
        onPress={onClose}
      >
        <Text style={twStyle("text-center font-semibold text-white")}>Done</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

interface ServiceIdsChipsProps {
  label: string;
  selectedIds: string[];
  services: CatalogueServiceItem[];
  onPressEdit: () => void;
  emptyHint: string;
}

export function ServiceIdsChips({
  label,
  selectedIds,
  services,
  onPressEdit,
  emptyHint,
}: ServiceIdsChipsProps) {
  const names = selectedIds
    .map((id) => services.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s!.title ?? s!.name ?? "Service");

  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TouchableOpacity
        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        onPress={onPressEdit}
      >
        {names.length > 0 ? (
          <View style={twStyle("flex-row flex-wrap gap-1")}>
            {names.map((n) => (
              <View key={n} style={twStyle("rounded-full bg-indigo-100 px-2 py-0.5")}>
                <Text style={twStyle("text-xs text-indigo-800")}>{n}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={twStyle("text-sm text-gray-500")}>{emptyHint}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** Package included services picker */
export function IncludedServicesPicker(
  props: Omit<ServiceIdsPickerProps, "title" | "description">,
) {
  return (
    <ServiceIdsPicker
      {...props}
      title="Included services"
      description="Select services included in this package."
    />
  );
}

/** Add-on applicable services picker */
export function ApplicableServicesPicker(
  props: Omit<ServiceIdsPickerProps, "title" | "description">,
) {
  return (
    <ServiceIdsPicker
      {...props}
      title="Applicable services"
      description="Leave empty to apply to all services, or restrict to specific ones."
    />
  );
}
