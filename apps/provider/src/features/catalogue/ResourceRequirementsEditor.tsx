import { View, Text, TouchableOpacity } from "react-native";
import { twStyle } from "@/lib/twStyle";
import type { OfferingResourceEntry } from "./types";

interface ProviderResource {
  id: string;
  name: string;
  group_name?: string | null;
}

interface ResourceRequirementsEditorProps {
  resources: ProviderResource[];
  offeringResources: OfferingResourceEntry[];
  onChange: (entries: OfferingResourceEntry[]) => void;
}

export function ResourceRequirementsEditor({
  resources,
  offeringResources,
  onChange,
}: ResourceRequirementsEditorProps) {
  if (resources.length === 0) return null;

  const setEntry = (resourceId: string, required: boolean | null) => {
    const filtered = offeringResources.filter((e) => e.resource_id !== resourceId);
    if (required === null) {
      onChange(filtered);
      return;
    }
    onChange([...filtered, { resource_id: resourceId, required }]);
  };

  const getState = (resourceId: string): "none" | "required" | "optional" => {
    const entry = offeringResources.find((e) => e.resource_id === resourceId);
    if (!entry) return "none";
    return entry.required ? "required" : "optional";
  };

  return (
    <View style={twStyle("mb-4")}>
      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Resource requirements</Text>
      {resources.map((res) => {
        const state = getState(res.id);
        return (
          <View
            key={res.id}
            style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3")}
          >
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-900")}>
              {res.name}
              {res.group_name ? (
                <Text style={twStyle("text-xs text-gray-500")}> · {res.group_name}</Text>
              ) : null}
            </Text>
            <View style={twStyle("flex-row gap-2")}>
              {(["none", "required", "optional"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={twStyle(
                    `rounded-full px-3 py-1.5 ${state === opt ? "bg-indigo-600" : "bg-gray-200"}`,
                  )}
                  onPress={() =>
                    setEntry(res.id, opt === "none" ? null : opt === "required")
                  }
                >
                  <Text
                    style={twStyle(
                      `text-xs capitalize ${state === opt ? "text-white" : "text-gray-700"}`,
                    )}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
