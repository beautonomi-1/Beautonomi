import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import type { AdvancedPricingRule } from "./types";

function getDefaultConditions(type: AdvancedPricingRule["type"]): Record<string, unknown> {
  switch (type) {
    case "time_based":
      return { days: [], startTime: "09:00", endTime: "17:00" };
    case "client_type":
      return { clientType: "new" };
    case "seasonal":
      return { startDate: "", endDate: "" };
    default:
      return {};
  }
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface AdvancedPricingRulesEditorProps {
  visible: boolean;
  rules: AdvancedPricingRule[];
  onClose: () => void;
  onSave: (rules: AdvancedPricingRule[]) => void;
}

export function AdvancedPricingRulesEditor({
  visible,
  rules: initialRules,
  onClose,
  onSave,
}: AdvancedPricingRulesEditorProps) {
  const [rules, setRules] = useState<AdvancedPricingRule[]>(initialRules);
  const [activeTab, setActiveTab] = useState<"time_based" | "client_type" | "seasonal">("time_based");

  useEffect(() => {
    if (visible) setRules(initialRules);
  }, [visible, initialRules]);

  const addRule = (type: AdvancedPricingRule["type"]) => {
    setRules([
      ...rules,
      {
        id: `rule-${Date.now()}`,
        type,
        name: "",
        enabled: true,
        conditions: getDefaultConditions(type),
        priceAdjustment: { type: "percentage", value: 0 },
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<AdvancedPricingRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateCondition = (id: string, key: string, value: unknown) => {
    setRules(
      rules.map((r) =>
        r.id === id ? { ...r, conditions: { ...r.conditions, [key]: value } } : r,
      ),
    );
  };

  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));

  const handleSave = () => {
    const invalid = rules.filter((r) => !r.name.trim() || (r.enabled && r.priceAdjustment.value === 0));
    if (invalid.length > 0) return;
    onSave(rules);
    onClose();
  };

  const tabRules = rules.filter((r) => r.type === activeTab);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Advanced pricing">
      <ScrollView style={twStyle("max-h-[70%]")}>
        <View style={twStyle("mb-3 flex-row gap-2")}>
          {(["time_based", "client_type", "seasonal"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={twStyle(
                `rounded-full px-3 py-1.5 ${activeTab === tab ? "bg-indigo-600" : "bg-gray-100"}`,
              )}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={twStyle(
                  `text-xs font-medium ${activeTab === tab ? "text-white" : "text-gray-700"}`,
                )}
              >
                {tab === "time_based" ? "Time" : tab === "client_type" ? "Client" : "Seasonal"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tabRules.map((rule) => (
          <View key={rule.id} style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Switch value={rule.enabled} onValueChange={(v) => updateRule(rule.id, { enabled: v })} />
              <TouchableOpacity onPress={() => removeRule(rule.id)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Rule name *</Text>
            <TextInput
              style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base")}
              value={rule.name}
              onChangeText={(t) => updateRule(rule.id, { name: t })}
              placeholder="e.g. Peak hours"
            />

            {rule.type === "time_based" ? (
              <>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Start / End time</Text>
                <View style={twStyle("mb-2 flex-row gap-2")}>
                  <TextInput
                    style={twStyle("flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2")}
                    value={String(rule.conditions.startTime ?? "09:00")}
                    onChangeText={(t) => updateCondition(rule.id, "startTime", t)}
                    placeholder="09:00"
                  />
                  <TextInput
                    style={twStyle("flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2")}
                    value={String(rule.conditions.endTime ?? "17:00")}
                    onChangeText={(t) => updateCondition(rule.id, "endTime", t)}
                    placeholder="17:00"
                  />
                </View>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Days</Text>
                <View style={twStyle("mb-2 flex-row flex-wrap gap-1")}>
                  {DAYS.map((day) => {
                    const selected = ((rule.conditions.days as string[]) ?? []).includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={twStyle(
                          `rounded-full px-2 py-1 ${selected ? "bg-indigo-600" : "bg-gray-200"}`,
                        )}
                        onPress={() => {
                          const days = (rule.conditions.days as string[]) ?? [];
                          const next = selected ? days.filter((d) => d !== day) : [...days, day];
                          updateCondition(rule.id, "days", next);
                        }}
                      >
                        <Text
                          style={twStyle(`text-xs ${selected ? "text-white" : "text-gray-700"}`)}
                        >
                          {day.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {rule.type === "client_type" ? (
              <>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Client type</Text>
                <View style={twStyle("mb-2 flex-row gap-2")}>
                  {(["new", "returning", "vip"] as const).map((ct) => (
                    <TouchableOpacity
                      key={ct}
                      style={twStyle(
                        `rounded-full px-3 py-1.5 ${rule.conditions.clientType === ct ? "bg-indigo-600" : "bg-gray-200"}`,
                      )}
                      onPress={() => updateCondition(rule.id, "clientType", ct)}
                    >
                      <Text
                        style={twStyle(
                          `text-xs capitalize ${rule.conditions.clientType === ct ? "text-white" : "text-gray-700"}`,
                        )}
                      >
                        {ct}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {rule.type === "seasonal" ? (
              <View style={twStyle("mb-2 flex-row gap-2")}>
                <TextInput
                  style={twStyle("flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2")}
                  value={String(rule.conditions.startDate ?? "")}
                  onChangeText={(t) => updateCondition(rule.id, "startDate", t)}
                  placeholder="Start YYYY-MM-DD"
                />
                <TextInput
                  style={twStyle("flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2")}
                  value={String(rule.conditions.endDate ?? "")}
                  onChangeText={(t) => updateCondition(rule.id, "endDate", t)}
                  placeholder="End YYYY-MM-DD"
                />
              </View>
            ) : null}

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Adjustment</Text>
            <View style={twStyle("flex-row gap-2")}>
              <TouchableOpacity
                style={twStyle(
                  `rounded-full px-3 py-1.5 ${rule.priceAdjustment.type === "percentage" ? "bg-indigo-600" : "bg-gray-200"}`,
                )}
                onPress={() =>
                  updateRule(rule.id, {
                    priceAdjustment: { ...rule.priceAdjustment, type: "percentage" },
                  })
                }
              >
                <Text
                  style={twStyle(
                    `text-xs ${rule.priceAdjustment.type === "percentage" ? "text-white" : "text-gray-700"}`,
                  )}
                >
                  %
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle(
                  `rounded-full px-3 py-1.5 ${rule.priceAdjustment.type === "fixed" ? "bg-indigo-600" : "bg-gray-200"}`,
                )}
                onPress={() =>
                  updateRule(rule.id, {
                    priceAdjustment: { ...rule.priceAdjustment, type: "fixed" },
                  })
                }
              >
                <Text
                  style={twStyle(
                    `text-xs ${rule.priceAdjustment.type === "fixed" ? "text-white" : "text-gray-700"}`,
                  )}
                >
                  Fixed
                </Text>
              </TouchableOpacity>
              <TextInput
                style={twStyle("flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2")}
                value={String(rule.priceAdjustment.value)}
                onChangeText={(t) =>
                  updateRule(rule.id, {
                    priceAdjustment: {
                      ...rule.priceAdjustment,
                      value: parseFloat(t) || 0,
                    },
                  })
                }
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={twStyle("mb-4 flex-row items-center justify-center rounded-xl border border-dashed border-indigo-300 py-3")}
          onPress={() => addRule(activeTab)}
        >
          <Ionicons name="add" size={18} color="#4f46e5" />
          <Text style={twStyle("ml-1 text-sm font-medium text-indigo-600")}>Add rule</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={twStyle("mb-2 rounded-xl bg-indigo-600 py-3")}
          onPress={handleSave}
        >
          <Text style={twStyle("text-center font-semibold text-white")}>Save rules</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}
