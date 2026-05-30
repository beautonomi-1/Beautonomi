import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import type { AdvancedPricingRule } from "./types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const TABS = [
  {
    key: "time_based" as const,
    label: "Time",
    icon: "time-outline" as const,
    title: "Time-based rules",
    hint: "Adjust price during specific hours and days — e.g. peak hours or weekends.",
  },
  {
    key: "client_type" as const,
    label: "Client",
    icon: "people-outline" as const,
    title: "Client-type rules",
    hint: "Offer different pricing for new, returning, or VIP clients.",
  },
  {
    key: "seasonal" as const,
    label: "Seasonal",
    icon: "calendar-outline" as const,
    title: "Seasonal rules",
    hint: "Apply pricing for holidays or custom date ranges.",
  },
];

const CLIENT_TYPES = [
  { value: "new", label: "New", description: "First-time bookers" },
  { value: "returning", label: "Returning", description: "Repeat clients" },
  { value: "vip", label: "VIP", description: "Tagged VIP clients" },
] as const;

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

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={twStyle("mb-2")}>
      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{label}</Text>
      {hint ? <Text style={twStyle("mt-0.5 text-xs leading-4 text-gray-500")}>{hint}</Text> : null}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "numbers-and-punctuation";
}) {
  return (
    <TextInput
      style={twStyle(
        "rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900",
      )}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.gray[400]}
      keyboardType={keyboardType}
    />
  );
}

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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("time_based");
  const [validationError, setValidationError] = useState<string | null>(null);
  const currencyCode = getTenantDefaultCurrency();

  useEffect(() => {
    if (visible) {
      setRules(initialRules);
      setValidationError(null);
    }
  }, [visible, initialRules]);

  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;
  const tabRules = useMemo(() => rules.filter((r) => r.type === activeTab), [rules, activeTab]);
  const enabledCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

  const ruleCountByTab = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) {
      counts[tab.key] = rules.filter((r) => r.type === tab.key).length;
    }
    return counts;
  }, [rules]);

  const addRule = (type: AdvancedPricingRule["type"]) => {
    setValidationError(null);
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
    setValidationError(null);
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateCondition = (id: string, key: string, value: unknown) => {
    setValidationError(null);
    setRules(
      rules.map((r) =>
        r.id === id ? { ...r, conditions: { ...r.conditions, [key]: value } } : r,
      ),
    );
  };

  const removeRule = (id: string) => {
    setValidationError(null);
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    const invalid = rules.filter((r) => !r.name.trim() || (r.enabled && r.priceAdjustment.value === 0));
    if (invalid.length > 0) {
      const message = "Give each enabled rule a name and a non-zero adjustment.";
      setValidationError(message);
      Alert.alert("Incomplete rules", message);
      return;
    }
    onSave(rules);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Advanced pricing"
      subtitle="Adjust your base price automatically when conditions match."
      snapHeight="full"
      footer={
        <View style={twStyle("gap-3")}>
          <ActionButton label="Save rules" onPress={handleSave} fullWidth />
          <ActionButton label="Cancel" onPress={onClose} variant="outline" fullWidth />
        </View>
      }
    >
      <View
        style={twStyle(
          "mb-4 flex-row items-start rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5",
        )}
      >
        <View
          style={[twStyle("mr-3 rounded-full p-2"), { backgroundColor: Colors.primaryLight }]}
        >
          <Ionicons name="sparkles-outline" size={18} color={Colors.primary} />
        </View>
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-sm font-semibold text-gray-900")}>
            {enabledCount === 0 ? "No active rules yet" : `${enabledCount} active rule${enabledCount === 1 ? "" : "s"}`}
          </Text>
          <Text style={twStyle("mt-1 text-xs leading-5 text-gray-500")}>
            Rules apply on top of your base booking price. Disabled rules are saved but not used at checkout.
          </Text>
        </View>
      </View>

      {validationError ? (
        <View
          style={twStyle(
            "mb-4 flex-row items-start rounded-2xl border border-red-200 bg-red-50 px-4 py-3",
          )}
        >
          <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginTop: 1, marginRight: 10 }} />
          <Text style={twStyle("flex-1 text-sm leading-5 text-red-700")}>{validationError}</Text>
        </View>
      ) : null}

      <View style={twStyle("mb-4 flex-row rounded-2xl border border-gray-200 bg-gray-50 p-1")}>
        {TABS.map((tab) => {
          const selected = activeTab === tab.key;
          const count = ruleCountByTab[tab.key] ?? 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                twStyle("flex-1 items-center rounded-xl px-2 py-3"),
                selected
                  ? {
                      backgroundColor: Colors.white,
                      shadowColor: "#000",
                      shadowOpacity: 0.06,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 2,
                    }
                  : null,
              ]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${tab.label} rules${count ? `, ${count} configured` : ""}`}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={selected ? Colors.primary : Colors.gray[500]}
              />
              <Text
                style={twStyle(
                  `mt-1 text-xs font-semibold ${selected ? "text-gray-900" : "text-gray-500"}`,
                )}
              >
                {tab.label}
              </Text>
              {count > 0 ? (
                <View
                  style={[
                    twStyle("mt-1 min-w-[18px] items-center rounded-full px-1.5 py-0.5"),
                    { backgroundColor: selected ? Colors.primarySoft : Colors.gray[200] },
                  ]}
                >
                  <Text
                    style={twStyle(
                      `text-[10px] font-bold ${selected ? "text-pink-700" : "text-gray-600"}`,
                    )}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={twStyle("mb-5")}>
        <Text style={twStyle("text-base font-semibold text-gray-900")}>{activeTabMeta.title}</Text>
        <Text style={twStyle("mt-1 text-sm leading-5 text-gray-500")}>{activeTabMeta.hint}</Text>
      </View>

      {tabRules.length === 0 ? (
        <View
          style={twStyle(
            "mb-5 items-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10",
          )}
        >
          <View style={[twStyle("mb-3 rounded-full bg-white p-4"), { borderWidth: 1, borderColor: Colors.gray[200] }]}>
            <Ionicons name={activeTabMeta.icon} size={28} color={Colors.gray[400]} />
          </View>
          <Text style={twStyle("text-base font-semibold text-gray-800")}>No {activeTabMeta.label.toLowerCase()} rules</Text>
          <Text style={twStyle("mt-2 text-center text-sm leading-5 text-gray-500")}>
            Add a rule to change pricing when these conditions are met.
          </Text>
        </View>
      ) : (
        tabRules.map((rule, index) => (
          <View
            key={rule.id}
            style={twStyle(
              "mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white",
            )}
          >
            <View
              style={twStyle(
                "flex-row items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3",
              )}
            >
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                  Rule {index + 1}
                </Text>
                <Text style={twStyle("mt-0.5 text-base font-semibold text-gray-900")} numberOfLines={1}>
                  {rule.name.trim() || "Untitled rule"}
                </Text>
              </View>
              <View style={twStyle("flex-row items-center gap-3")}>
                <View style={twStyle("flex-row items-center gap-2")}>
                  <Text style={twStyle("text-xs font-medium text-gray-500")}>Active</Text>
                  <Switch
                    value={rule.enabled}
                    onValueChange={(v) => updateRule(rule.id, { enabled: v })}
                    trackColor={{ false: Colors.gray[300], true: Colors.primaryRing }}
                    thumbColor={Colors.white}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => removeRule(rule.id)}
                  hitSlop={8}
                  accessibilityLabel="Remove rule"
                  accessibilityRole="button"
                  style={twStyle("rounded-full bg-red-50 p-2")}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={twStyle("gap-4 p-4")}>
              <View>
                <FieldLabel label="Rule name" hint="Shown only to you — helps identify this rule later." />
                <TextField
                  value={rule.name}
                  onChangeText={(t) => updateRule(rule.id, { name: t })}
                  placeholder="e.g. Peak hours, Weekend premium"
                />
              </View>

              {rule.type === "time_based" ? (
                <>
                  <View>
                    <FieldLabel label="Time window" hint="Use 24-hour format, e.g. 09:00 and 17:00." />
                    <View style={twStyle("flex-row gap-3")}>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("mb-1.5 text-xs font-medium text-gray-500")}>From</Text>
                        <TextField
                          value={String(rule.conditions.startTime ?? "09:00")}
                          onChangeText={(t) => updateCondition(rule.id, "startTime", t)}
                          placeholder="09:00"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("mb-1.5 text-xs font-medium text-gray-500")}>To</Text>
                        <TextField
                          value={String(rule.conditions.endTime ?? "17:00")}
                          onChangeText={(t) => updateCondition(rule.id, "endTime", t)}
                          placeholder="17:00"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    </View>
                  </View>

                  <View>
                    <FieldLabel label="Days of week" hint="Tap to select which days this rule applies." />
                    <View style={twStyle("flex-row justify-between gap-1")}>
                      {DAYS.map((day, dayIndex) => {
                        const selected = ((rule.conditions.days as string[]) ?? []).includes(day);
                        return (
                          <TouchableOpacity
                            key={day}
                            style={[
                              twStyle("min-h-[44px] flex-1 items-center justify-center rounded-xl border"),
                              selected
                                ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
                                : { backgroundColor: Colors.white, borderColor: Colors.gray[200] },
                            ]}
                            onPress={() => {
                              const days = (rule.conditions.days as string[]) ?? [];
                              const next = selected ? days.filter((d) => d !== day) : [...days, day];
                              updateCondition(rule.id, "days", next);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={day}
                          >
                            <Text
                              style={twStyle(
                                `text-[11px] font-bold ${selected ? "text-white" : "text-gray-600"}`,
                              )}
                            >
                              {DAY_SHORT[dayIndex]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : null}

              {rule.type === "client_type" ? (
                <View>
                  <FieldLabel label="Client type" hint="Which client segment should receive this adjustment." />
                  <View style={twStyle("gap-2")}>
                    {CLIENT_TYPES.map((ct) => {
                      const selected = rule.conditions.clientType === ct.value;
                      return (
                        <TouchableOpacity
                          key={ct.value}
                          style={[
                            twStyle("flex-row items-center rounded-xl border px-4 py-3"),
                            selected
                              ? { borderColor: Colors.primary, backgroundColor: Colors.primaryLight }
                              : { borderColor: Colors.gray[200], backgroundColor: Colors.white },
                          ]}
                          onPress={() => updateCondition(rule.id, "clientType", ct.value)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                        >
                          <View
                            style={[
                              twStyle("mr-3 h-5 w-5 items-center justify-center rounded-full border-2"),
                              selected
                                ? { borderColor: Colors.primary, backgroundColor: Colors.primary }
                                : { borderColor: Colors.gray[300], backgroundColor: Colors.white },
                            ]}
                          >
                            {selected ? <View style={twStyle("h-2 w-2 rounded-full bg-white")} /> : null}
                          </View>
                          <View style={twStyle("flex-1")}>
                            <Text style={twStyle("text-sm font-semibold text-gray-900")}>{ct.label}</Text>
                            <Text style={twStyle("text-xs text-gray-500")}>{ct.description}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {rule.type === "seasonal" ? (
                <View>
                  <FieldLabel label="Date range" hint="Use YYYY-MM-DD format for start and end dates." />
                  <View style={twStyle("flex-row gap-3")}>
                    <View style={twStyle("flex-1")}>
                      <Text style={twStyle("mb-1.5 text-xs font-medium text-gray-500")}>Start date</Text>
                      <TextField
                        value={String(rule.conditions.startDate ?? "")}
                        onChangeText={(t) => updateCondition(rule.id, "startDate", t)}
                        placeholder="2026-12-01"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={twStyle("flex-1")}>
                      <Text style={twStyle("mb-1.5 text-xs font-medium text-gray-500")}>End date</Text>
                      <TextField
                        value={String(rule.conditions.endDate ?? "")}
                        onChangeText={(t) => updateCondition(rule.id, "endDate", t)}
                        placeholder="2026-12-31"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <View>
                <FieldLabel
                  label="Price adjustment"
                  hint={
                    rule.priceAdjustment.type === "percentage"
                      ? "Positive adds to the base price; negative gives a discount."
                      : "Fixed amount added to or subtracted from the base price."
                  }
                />
                <View style={twStyle("mb-3 flex-row rounded-xl border border-gray-200 bg-gray-50 p-1")}>
                  {(["percentage", "fixed"] as const).map((type) => {
                    const selected = rule.priceAdjustment.type === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          twStyle("flex-1 items-center rounded-lg py-2.5"),
                          selected
                            ? {
                                backgroundColor: Colors.white,
                                shadowColor: "#000",
                                shadowOpacity: 0.05,
                                shadowRadius: 3,
                                elevation: 1,
                              }
                            : null,
                        ]}
                        onPress={() =>
                          updateRule(rule.id, {
                            priceAdjustment: { ...rule.priceAdjustment, type },
                          })
                        }
                      >
                        <Text
                          style={twStyle(
                            `text-sm font-semibold ${selected ? "text-gray-900" : "text-gray-500"}`,
                          )}
                        >
                          {type === "percentage" ? "Percentage (%)" : "Fixed amount"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-white px-4 py-3")}>
                  <Text style={twStyle("mr-2 text-sm font-semibold text-gray-500")}>
                    {rule.priceAdjustment.type === "percentage" ? "%" : currencyCode}
                  </Text>
                  <TextInput
                    style={twStyle("flex-1 text-base text-gray-900")}
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
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>
              </View>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={[
          twStyle("mb-2 flex-row items-center justify-center rounded-2xl border border-dashed py-4"),
          { borderColor: Colors.primaryRing, backgroundColor: Colors.primaryLight },
        ]}
        onPress={() => addRule(activeTab)}
        accessibilityRole="button"
        accessibilityLabel={`Add ${activeTabMeta.label.toLowerCase()} rule`}
      >
        <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
        <Text style={[twStyle("ml-2 text-sm font-semibold"), { color: Colors.primary }]}>
          Add {activeTabMeta.label.toLowerCase()} rule
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}
