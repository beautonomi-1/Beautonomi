import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { twStyle } from "@/lib/twStyle";
import type { PayModelValue, PayPlanFormState } from "@/lib/pay-plan-form-state";

const PAY_MODELS: PayModelValue[] = [
  "commission_only",
  "base_plus_commission",
  "base_or_commission_higher",
  "commission_above_threshold",
  "hourly",
  "hourly_plus_commission",
  "salary",
  "booth_renter",
];

const EMPLOYMENT_TYPES: PayPlanFormState["employment_type"][] = [
  "employee",
  "contractor",
  "apprentice",
];

type Props = {
  value: PayPlanFormState;
  onChange: (next: PayPlanFormState) => void;
  disabled?: boolean;
  label: (key: string) => string;
};

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
  labelFor,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (v: T) => void;
  disabled?: boolean;
  labelFor: (v: T) => string;
}) {
  return (
    <View style={twStyle("mb-3 flex-row flex-wrap")}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          disabled={disabled}
          onPress={() => onSelect(opt)}
          style={[
            twStyle("rounded-full border px-3 py-1.5 mb-1"),
            {
              marginEnd: 6,
              borderColor: selected === opt ? "#6366f1" : "#e5e7eb",
              backgroundColor: selected === opt ? "#eef2ff" : "#fff",
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={twStyle(
              selected === opt ? "text-xs font-semibold text-indigo-700" : "text-xs text-gray-600",
            )}
          >
            {labelFor(opt)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function StaffPayPlanForm({ value, onChange, disabled, label }: Props) {
  const set = (patch: Partial<PayPlanFormState>) => onChange({ ...value, ...patch });

  const usesCommission = [
    "commission_only",
    "base_plus_commission",
    "base_or_commission_higher",
    "commission_above_threshold",
    "hourly_plus_commission",
  ].includes(value.pay_model);
  const usesBase = ["salary", "base_plus_commission", "base_or_commission_higher"].includes(
    value.pay_model,
  );
  const usesHourly = value.pay_model === "hourly" || value.pay_model === "hourly_plus_commission";
  const usesThreshold = value.pay_model === "commission_above_threshold";
  const usesTierMode = usesCommission;

  const inputStyle = twStyle(
    "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
  );

  return (
    <ScrollView style={twStyle("max-h-80")} nestedScrollEnabled>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("payModel")}</Text>
      <ChipRow
        options={PAY_MODELS}
        selected={value.pay_model}
        onSelect={(m) => set({ pay_model: m })}
        disabled={disabled}
        labelFor={(m) => label(`payModel_${m}`)}
      />

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("employmentType")}</Text>
      <ChipRow
        options={EMPLOYMENT_TYPES}
        selected={value.employment_type}
        onSelect={(t) => set({ employment_type: t })}
        disabled={disabled}
        labelFor={(t) => label(`employment_${t}`)}
      />

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("effectiveFrom")}</Text>
      <TextInput
        style={[inputStyle, twStyle("mb-3")]}
        value={value.effective_from}
        onChangeText={(v) => set({ effective_from: v })}
        editable={!disabled}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("statutoryMode")}</Text>
      <ChipRow
        options={["auto", "manual", "none"] as const}
        selected={value.statutory_mode}
        onSelect={(mode) => set({ statutory_mode: mode })}
        disabled={disabled}
        labelFor={(mode) => label(`statutory_${mode}`)}
      />

      {usesBase ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("baseAmount")}</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={String(value.base_amount || "")}
            onChangeText={(v) => set({ base_amount: Number(v) || 0 })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
        </>
      ) : null}

      {usesHourly ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("hourlyRate")}</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={String(value.hourly_rate || "")}
            onChangeText={(v) => set({ hourly_rate: Number(v) || 0 })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
        </>
      ) : null}

      {usesCommission ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("serviceRate")}</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={String(value.service_rate || "")}
            onChangeText={(v) => set({ service_rate: Number(v) || 0 })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("productRate")}</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={String(value.product_rate || "")}
            onChangeText={(v) => set({ product_rate: Number(v) || 0 })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
        </>
      ) : null}

      {usesThreshold ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("thresholdAmount")}</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={String(value.threshold_amount || "")}
            onChangeText={(v) => set({ threshold_amount: Number(v) || 0 })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
        </>
      ) : null}

      {usesTierMode ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("tierMode")}</Text>
          <ChipRow
            options={["retroactive", "marginal"] as const}
            selected={value.tier_mode}
            onSelect={(mode) => set({ tier_mode: mode })}
            disabled={disabled}
            labelFor={(mode) => label(mode === "marginal" ? "tierModeMarginal" : "tierModeRetroactive")}
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            {label(value.tier_mode === "marginal" ? "tierModeMarginalHint" : "tierModeRetroactiveHint")}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}
