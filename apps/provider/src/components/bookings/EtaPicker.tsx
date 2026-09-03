import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { twStyle } from "@/lib/twStyle";

const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

export type EtaPickerProps = {
  value: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
};

export function EtaPicker({ value, onChange, disabled }: EtaPickerProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const isCustom =
    value != null && !PRESET_MINUTES.includes(value as (typeof PRESET_MINUTES)[number]);

  const selectPreset = (minutes: number) => {
    setCustomMode(false);
    onChange(minutes);
  };

  const applyCustom = () => {
    const n = Math.round(Number(customValue));
    if (Number.isFinite(n) && n >= 1 && n <= 240) {
      onChange(n);
    }
  };

  return (
    <View>
      <Text style={twStyle("text-xs text-gray-500 mb-2")}>Estimated arrival</Text>
      <View style={twStyle("flex-row flex-wrap")}>
        {PRESET_MINUTES.map((min) => (
          <TouchableOpacity
            key={min}
            disabled={disabled}
            onPress={() => selectPreset(min)}
            style={[
              twStyle(
                `rounded-lg border px-3 py-2 ${
                  value === min ? "bg-primary border-primary" : "bg-white border-gray-300"
                }`,
              ),
              { marginRight: 8, marginBottom: 8, opacity: disabled ? 0.5 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${min} minutes`}
            accessibilityState={{ selected: value === min }}
          >
            <Text style={twStyle(`text-sm font-medium ${value === min ? "text-white" : "text-gray-700"}`)}>
              {min} min
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          disabled={disabled}
          onPress={() => {
            setCustomMode(false);
            onChange(null);
          }}
          style={[
            twStyle(
              `rounded-lg border px-3 py-2 ${
                value === null ? "bg-primary border-primary" : "bg-white border-gray-300"
              }`,
            ),
            { marginRight: 8, marginBottom: 8, opacity: disabled ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Not sure"
          accessibilityState={{ selected: value === null }}
        >
          <Text style={twStyle(`text-sm font-medium ${value === null ? "text-white" : "text-gray-700"}`)}>
            Not sure
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => setCustomMode((v) => !v)}
          style={[
            twStyle(
              `rounded-lg border px-3 py-2 ${
                customMode || isCustom ? "bg-primary/10 border-primary" : "bg-white border-gray-300"
              }`,
            ),
            { marginRight: 8, marginBottom: 8, opacity: disabled ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Custom ETA"
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Custom</Text>
        </TouchableOpacity>
      </View>
      {customMode ? (
        <View style={twStyle("flex-row items-center mb-2")}>
          <TextInput
            value={customValue}
            onChangeText={setCustomValue}
            placeholder="Minutes"
            keyboardType="number-pad"
            editable={!disabled}
            style={twStyle("border border-gray-300 rounded-lg px-3 py-2 w-24 mr-2 bg-white")}
          />
          <TouchableOpacity
            disabled={disabled}
            onPress={applyCustom}
            style={twStyle("rounded-lg bg-primary px-3 py-2")}
            accessibilityRole="button"
            accessibilityLabel="Set custom ETA"
          >
            <Text style={twStyle("text-white text-sm font-semibold")}>Set</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
