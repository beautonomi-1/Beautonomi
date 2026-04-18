/**
 * Wave 4.4 (audit 2026-04 final 100/100): provider mobile advanced pricing.
 *
 * Surface parity with web's `AdvancedPricingModal` — providers can list the
 * services they have on the platform, drill into a service, see the rules
 * created on web, enable / disable them, delete them, and add a basic
 * time-based (peak / off-peak) rule right from mobile.
 *
 * Complex rule editing (client-type, seasonal with calendars, location
 * scoping across many salons, etc.) still happens on the web portal —
 * that's intentional because the mobile form factor can't match a
 * multi-tabbed modal cleanly. But every provider can at least:
 *   - audit which services have live surcharges / discounts
 *   - toggle them off during a promo
 *   - add a quick "weekend peak" rule without opening a laptop
 */

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Switch,
  Alert,
  TextInput,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

interface AdvancedPricingRule {
  id: string;
  type:
    | "time_based"
    | "location_based"
    | "client_type"
    | "package"
    | "seasonal";
  name: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  priceAdjustment: {
    type: "fixed" | "percentage";
    value: number;
  };
}

interface ServiceItem {
  id: string;
  title?: string;
  name?: string;
  price?: number;
  duration_minutes?: number;
  advanced_pricing_rules?: AdvancedPricingRule[] | null;
  is_active?: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * §Wave 4.4 follow-up (audit 2026-04 final 100/100 no-deferrals pass):
 * render a human-readable summary for EVERY rule type, not just
 * time-based. This closes the "🔗 deferred" item on the parity matrix
 * for client-type / package / seasonal — providers can now see what
 * those rules do, toggle them, and delete them right from mobile. Web
 * remains the best place to CREATE the complex ones, but nothing is
 * invisible on mobile anymore.
 */
function describeRule(rule: AdvancedPricingRule): string {
  const adj =
    rule.priceAdjustment.type === "percentage"
      ? `${rule.priceAdjustment.value > 0 ? "+" : ""}${rule.priceAdjustment.value}%`
      : `${rule.priceAdjustment.value > 0 ? "+" : ""}${rule.priceAdjustment.value}`;
  const c = rule.conditions as Record<string, unknown>;
  switch (rule.type) {
    case "time_based": {
      const days = Array.isArray(c.days) ? (c.days as number[]) : [];
      const dayLabel = days.length
        ? days.map((d) => DAY_LABELS[d] ?? `D${d}`).join(", ")
        : "";
      const window =
        c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : "";
      return [adj, dayLabel, window].filter(Boolean).join(" · ");
    }
    case "client_type": {
      const kinds = Array.isArray(c.clientTypes)
        ? (c.clientTypes as string[]).join(", ")
        : typeof c.clientType === "string"
          ? (c.clientType as string)
          : "selected clients";
      return `${adj} · ${kinds}`;
    }
    case "location_based": {
      const loc = typeof c.locationLabel === "string" ? c.locationLabel : "location-scoped";
      return `${adj} · ${loc}`;
    }
    case "package": {
      const min = typeof c.minServices === "number" ? c.minServices : null;
      return `${adj}${min ? ` · ${min}+ services in booking` : " · package rule"}`;
    }
    case "seasonal": {
      const start = typeof c.startDate === "string" ? c.startDate : "";
      const end = typeof c.endDate === "string" ? c.endDate : "";
      const range = start && end ? `${start} → ${end}` : "seasonal window";
      return `${adj} · ${range}`;
    }
    default:
      return adj;
  }
}

function labelForRuleType(type: AdvancedPricingRule["type"]): string {
  switch (type) {
    case "time_based":
      return "Time-based";
    case "client_type":
      return "Client type";
    case "location_based":
      return "Location";
    case "package":
      return "Package";
    case "seasonal":
      return "Seasonal";
    default:
      return type;
  }
}

function countActive(rules?: AdvancedPricingRule[] | null): number {
  if (!Array.isArray(rules)) return 0;
  return rules.filter((r) => r.enabled).length;
}

export default function AdvancedPricingScreen() {
  const router = useRouter();
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleDays, setRuleDays] = useState<number[]>([]);
  const [ruleStart, setRuleStart] = useState("18:00");
  const [ruleEnd, setRuleEnd] = useState("21:00");
  const [ruleAdjustmentType, setRuleAdjustmentType] = useState<
    "percentage" | "fixed"
  >("percentage");
  const [ruleAdjustmentValue, setRuleAdjustmentValue] = useState("15");
  const [ruleName, setRuleName] = useState("Peak hours");

  const { data: services, loading, error, refresh } =
    useApi<ServiceItem[]>("/api/provider/services");
  const { execute: updateService, loading: savingService } =
    useApiMutation("patch");

  const servicesList = useMemo(() => {
    const raw = services as unknown;
    if (Array.isArray(raw)) return raw as ServiceItem[];
    const data = (raw as { data?: ServiceItem[] } | null)?.data;
    return Array.isArray(data) ? data : [];
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const openService = useCallback((svc: ServiceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(svc);
  }, []);

  const saveRules = useCallback(
    async (svc: ServiceItem, rules: AdvancedPricingRule[]) => {
      const { data, error: saveErr } = await updateService(
        `/api/provider/services/${svc.id}`,
        { advanced_pricing_rules: rules },
      );
      if (saveErr) {
        Alert.alert("Couldn't save", saveErr);
        return null;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const updatedSvc: ServiceItem = {
        ...svc,
        advanced_pricing_rules: rules,
        ...((data as ServiceItem) ?? {}),
      };
      setSelectedService(updatedSvc);
      await refresh();
      return updatedSvc;
    },
    [updateService, refresh],
  );

  const toggleRule = useCallback(
    async (svc: ServiceItem, ruleId: string, enabled: boolean) => {
      const rules = (svc.advanced_pricing_rules ?? []).map((r) =>
        r.id === ruleId ? { ...r, enabled } : r,
      );
      await saveRules(svc, rules);
    },
    [saveRules],
  );

  const deleteRule = useCallback(
    (svc: ServiceItem, ruleId: string) => {
      Alert.alert("Delete rule", "This pricing rule will be removed.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const rules = (svc.advanced_pricing_rules ?? []).filter(
              (r) => r.id !== ruleId,
            );
            await saveRules(svc, rules);
          },
        },
      ]);
    },
    [saveRules],
  );

  const toggleDay = useCallback((day: number) => {
    setRuleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }, []);

  const openAddRule = useCallback(() => {
    setRuleDays([5, 6]); // Sat/Sun default
    setRuleStart("09:00");
    setRuleEnd("18:00");
    setRuleAdjustmentType("percentage");
    setRuleAdjustmentValue("15");
    setRuleName("Weekend peak");
    setShowAddRule(true);
  }, []);

  const handleAddRule = useCallback(async () => {
    if (!selectedService) return;
    if (ruleDays.length === 0) {
      Alert.alert("Select days", "Choose at least one day for this rule.");
      return;
    }
    const hhmm = /^\d{2}:\d{2}$/;
    if (!hhmm.test(ruleStart) || !hhmm.test(ruleEnd)) {
      Alert.alert("Invalid time", "Start / end must be HH:MM.");
      return;
    }
    const value = Number(ruleAdjustmentValue);
    if (!Number.isFinite(value) || value === 0) {
      Alert.alert("Invalid amount", "Adjustment must be a non-zero number.");
      return;
    }
    const newRule: AdvancedPricingRule = {
      id: `rule-${Date.now()}`,
      type: "time_based",
      name: ruleName.trim() || "Time-based rule",
      enabled: true,
      conditions: {
        days: ruleDays,
        startTime: ruleStart,
        endTime: ruleEnd,
      },
      priceAdjustment: {
        type: ruleAdjustmentType,
        value,
      },
    };
    const rules = [...(selectedService.advanced_pricing_rules ?? []), newRule];
    const result = await saveRules(selectedService, rules);
    if (result) setShowAddRule(false);
  }, [
    selectedService,
    ruleDays,
    ruleStart,
    ruleEnd,
    ruleAdjustmentValue,
    ruleAdjustmentType,
    ruleName,
    saveRules,
  ]);

  const renderService = useCallback(
    ({ item }: { item: ServiceItem }) => {
      const activeCount = countActive(item.advanced_pricing_rules);
      const totalCount = (item.advanced_pricing_rules ?? []).length;
      return (
        <TouchableOpacity
          style={twStyle(
            "mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4",
          )}
          onPress={() => openService(item)}
          accessibilityLabel={`Manage pricing for ${item.title ?? item.name}`}
        >
          <View
            style={twStyle(
              "h-10 w-10 items-center justify-center rounded-xl bg-indigo-50",
            )}
          >
            <Ionicons name="pricetags-outline" size={18} color="#4338ca" />
          </View>
          <View style={[twStyle("flex-1"), { marginLeft: 12 }]}>
            <Text style={twStyle("text-base font-semibold text-gray-900")} numberOfLines={1}>
              {item.title ?? item.name ?? "Service"}
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {totalCount === 0
                ? "No pricing rules"
                : `${activeCount}/${totalCount} active rule${totalCount > 1 ? "s" : ""}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
        </TouchableOpacity>
      );
    },
    [openService],
  );

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Advanced pricing"
        showBack
        subtitle="Peak, off-peak & tiered rules"
      />

      {loading && servicesList.length === 0 ? (
        <SkeletonList rows={5} />
      ) : error && servicesList.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : servicesList.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No services yet"
          description="Add a service first to configure pricing rules."
          actionLabel="Add service"
          onAction={() =>
            router.push("/(app)/(tabs)/more/service-form" as never)
          }
        />
      ) : (
        <FlatList
          data={servicesList}
          keyExtractor={(s: ServiceItem) => s.id}
          renderItem={renderService}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshing={loading}
          onRefresh={refresh}
        />
      )}

      <BottomSheet
        visible={!!selectedService && !showAddRule}
        onClose={() => setSelectedService(null)}
        title={selectedService?.title ?? selectedService?.name ?? "Service pricing"}
      >
        {selectedService && (
          <View>
            <Text style={twStyle("mb-3 text-xs uppercase text-gray-400")}>
              Active rules
            </Text>
            {(selectedService.advanced_pricing_rules ?? []).length === 0 ? (
              <View style={twStyle("mb-3 rounded-lg bg-gray-50 p-4")}>
                <Text style={twStyle("text-sm text-gray-500")}>
                  No pricing rules yet. Add a time-based rule to charge peak-hour
                  surcharges or off-peak discounts.
                </Text>
              </View>
            ) : (
              (selectedService.advanced_pricing_rules ?? []).map((rule) => (
                <View
                  key={rule.id}
                  style={twStyle(
                    "mb-2 rounded-lg border border-gray-200 bg-white p-3",
                  )}
                >
                  <View style={twStyle("flex-row items-center")}>
                    <View style={twStyle("flex-1")}>
                      <View style={twStyle("mb-1 flex-row items-center")}>
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {rule.name || labelForRuleType(rule.type)}
                        </Text>
                        <View
                          style={twStyle(
                            "ml-2 rounded-full bg-indigo-50 px-2 py-0.5",
                          )}
                        >
                          <Text style={twStyle("text-[10px] font-medium text-indigo-700")}>
                            {labelForRuleType(rule.type)}
                          </Text>
                        </View>
                      </View>
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {describeRule(rule)}
                      </Text>
                    </View>
                    <Switch
                      value={rule.enabled}
                      onValueChange={(v) =>
                        toggleRule(selectedService, rule.id, v)
                      }
                      disabled={savingService}
                    />
                    <TouchableOpacity
                      onPress={() => deleteRule(selectedService, rule.id)}
                      hitSlop={8}
                      style={{ marginLeft: 8 }}
                      accessibilityLabel={`Delete rule ${rule.name}`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            {(selectedService.advanced_pricing_rules ?? []).some(
              (r) => r.type !== "time_based",
            ) ? (
              <View style={twStyle("mt-1 mb-3 rounded-lg bg-amber-50 p-3")}>
                <Text style={twStyle("text-xs text-amber-900")}>
                  You have client-type, package, location or seasonal rules.
                  You can toggle and delete them here; to edit their
                  conditions, use the web provider portal.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={openAddRule}
              style={twStyle(
                "mt-2 flex-row items-center justify-center rounded-lg bg-indigo-50 py-3",
              )}
              accessibilityRole="button"
              accessibilityLabel="Add time-based rule"
            >
              <Ionicons
                name="add-circle-outline"
                size={16}
                color="#4338ca"
                style={{ marginRight: 6 }}
              />
              <Text style={twStyle("text-sm font-semibold text-indigo-700")}>
                Add time-based rule
              </Text>
            </TouchableOpacity>

            <Text
              style={[
                twStyle("text-xs text-gray-400"),
                { marginTop: 12, textAlign: "center" },
              ]}
            >
              Need client-type, package, or seasonal rules? Open the web portal
              for the full rule editor.
            </Text>
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={showAddRule}
        onClose={() => setShowAddRule(false)}
        title="New time-based rule"
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Label</Text>
          <TextInput
            style={twStyle(
              "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
            )}
            value={ruleName}
            onChangeText={setRuleName}
            placeholder="e.g. Weekend peak"
            placeholderTextColor="#9ca3af"
          />

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Days</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {DAY_LABELS.map((label, idx) => {
              const selected = ruleDays.includes(idx);
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => toggleDay(idx)}
                  style={[
                    twStyle(
                      `mb-2 rounded-full border px-3 py-1.5 ${
                        selected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 bg-white"
                      }`,
                    ),
                    { marginRight: 8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${selected ? "selected" : "unselected"}`}
                >
                  <Text
                    style={twStyle(
                      `text-xs font-medium ${
                        selected ? "text-indigo-700" : "text-gray-600"
                      }`,
                    )}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                Start (HH:MM)
              </Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                )}
                value={ruleStart}
                onChangeText={setRuleStart}
                placeholder="09:00"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                End (HH:MM)
              </Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                )}
                value={ruleEnd}
                onChangeText={setRuleEnd}
                placeholder="18:00"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Adjustment
          </Text>
          <View style={twStyle("mb-3 flex-row")}>
            <TouchableOpacity
              onPress={() => setRuleAdjustmentType("percentage")}
              style={[
                twStyle(
                  `flex-1 items-center rounded-lg border py-2 ${
                    ruleAdjustmentType === "percentage"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 bg-white"
                  }`,
                ),
                { marginRight: 8 },
              ]}
            >
              <Text
                style={twStyle(
                  `text-sm font-medium ${
                    ruleAdjustmentType === "percentage"
                      ? "text-indigo-700"
                      : "text-gray-700"
                  }`,
                )}
              >
                Percentage
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRuleAdjustmentType("fixed")}
              style={twStyle(
                `flex-1 items-center rounded-lg border py-2 ${
                  ruleAdjustmentType === "fixed"
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white"
                }`,
              )}
            >
              <Text
                style={twStyle(
                  `text-sm font-medium ${
                    ruleAdjustmentType === "fixed"
                      ? "text-indigo-700"
                      : "text-gray-700"
                  }`,
                )}
              >
                Fixed amount
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={twStyle(
              "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
            )}
            value={ruleAdjustmentValue}
            onChangeText={setRuleAdjustmentValue}
            keyboardType="decimal-pad"
            placeholder={
              ruleAdjustmentType === "percentage" ? "15 (for +15%)" : "25 (for +25)"
            }
            placeholderTextColor="#9ca3af"
          />

          <Text style={[twStyle("mb-3 text-xs text-gray-500")]}>
            Positive values add a surcharge. Negative values apply a discount
            (e.g. -10 for a 10% off-peak discount).
          </Text>

          <ActionButton
            label="Save rule"
            onPress={handleAddRule}
            loading={savingService}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
