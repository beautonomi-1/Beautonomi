import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { twStyle } from "@/lib/twStyle";
import {
  payModelUsesCommission,
  type PayModelValue,
  type PayPlanFormState,
} from "@/lib/pay-plan-form-state";

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

  const usesCommission = payModelUsesCommission(value.pay_model);
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
      <Text style={twStyle("mb-3 text-xs text-gray-500")}>
          {value.pay_model === "commission_only"
            ? "A percentage of the services and products they sell. No salary. For an employee, PAYE and UIF are calculated on that commission."
            : value.pay_model === "base_plus_commission"
              ? "A monthly salary plus a percentage of what they sell. Commission is what they earned in the period."
              : value.pay_model === "base_or_commission_higher"
                ? "They receive the monthly salary or the commission, whichever is higher that period."
                : value.pay_model === "commission_above_threshold"
                  ? "Service and product percentages apply only to the sales above the target."
                  : value.pay_model === "hourly"
                    ? "Paid for the hours they work."
                    : value.pay_model === "hourly_plus_commission"
                      ? "Paid for hours worked, plus a percentage of what they sell."
                      : value.pay_model === "salary"
                        ? "A monthly salary only. Commission is not added."
                        : "Booth renters are not included on a pay run or a payslip. They keep their own takings."}
      </Text>

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("employmentType")}</Text>
      <ChipRow
        options={EMPLOYMENT_TYPES}
        selected={value.employment_type}
        onSelect={(employmentType) =>
          set(
            employmentType === "contractor"
              ? { employment_type: employmentType, statutory_mode: "none" }
              : { employment_type: employmentType },
          )
        }
        disabled={disabled}
        labelFor={(employmentType) => label(`employment_${employmentType}`)}
      />
      <Text style={twStyle("mb-3 text-xs text-gray-500")}>
        {value.employment_type === "contractor"
          ? "Contractors stay on the pay run. PAYE and UIF are not calculated."
          : "Employees and apprentices are taxed on what the pay run pays them, including commission. PAYE is an estimate and UIF is the employee contribution. Apprentices use the same calculation, without a learnership allowance."}
      </Text>

      {value.pay_model !== "booth_renter" ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Employment start</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-3")]}
            value={value.employment_start_date}
            onChangeText={(v) => set({ employment_start_date: v })}
            editable={!disabled}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Employment end</Text>
          <TextInput
            style={[inputStyle, twStyle("mb-1")]}
            value={value.employment_end_date}
            onChangeText={(v) => set({ employment_end_date: v })}
            editable={!disabled}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            {value.employment_type === "contractor"
              ? "Leave the end date empty for an ongoing contract. A date inside a pay period limits pay. Contractors still get a payslip, without calculated PAYE or UIF."
              : "Leave the end date empty for an ongoing role. A date inside a pay period reduces a monthly salary. Commission is still what they earned in that period."}
          </Text>
        </>
      ) : null}

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label("effectiveFrom")}</Text>
      <TextInput
        style={[inputStyle, twStyle("mb-3")]}
        value={value.effective_from}
        onChangeText={(v) => set({ effective_from: v })}
        editable={!disabled}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tax</Text>
      <ChipRow
        options={["auto", "manual", "none"] as const}
        selected={value.employment_type === "contractor" ? "none" : value.statutory_mode}
        onSelect={(mode) => set({ statutory_mode: mode })}
        disabled={disabled || value.employment_type === "contractor"}
        labelFor={(mode) =>
          mode === "auto"
            ? "Calculate PAYE and UIF"
            : mode === "manual"
              ? "I'll enter PAYE and UIF"
              : "Don't calculate tax"
        }
      />

      {usesBase ? (
        <>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Monthly salary</Text>
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
