import fs from "node:fs";

const permPath =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/web/src/app/provider/settings/team/permissions/page.tsx";
let perm = fs.readFileSync(permPath, "utf8");
perm = perm.replace(
  `  const handlePermissionToggle = (permissionId: string) => {
    if (!canManageTeam) return;`,
  `  const handlePermissionToggle = (permissionId: string) => {
    if (!permissionsEditable) return;`,
);
perm = perm.replace(
  `    if (!canManageTeam) return;

    const doSave = async () => {`,
  `    if (!permissionsEditable) return;

    const doSave = async () => {`,
);
fs.writeFileSync(permPath, perm);

const staffPath =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/settings/staff-permissions/[id].tsx";
let staff = fs.readFileSync(staffPath, "utf8");
if (!staff.includes("role_id?: string")) {
  staff = staff.replace(
    `interface PermissionsResponse {
  permissions: Record<string, boolean>;
}`,
    `interface PermissionsResponse {
  permissions: Record<string, boolean | string>;
  role_id?: string | null;
  role_name?: string | null;
}`,
  );
}
if (!staff.includes("setAttachedRoleId(data.role_id")) {
  staff = staff.replace(
    `      setLocal(booleans);
    }
  }, [data, defaultPermissions]);`,
    `      setLocal(booleans);
      setAttachedRoleId(data.role_id ?? null);
      setAttachedRoleName(data.role_name ?? null);
    }
  }, [data, defaultPermissions]);`,
  );
}
if (!staff.includes("detachRoleTitle")) {
  staff = staff.replace(
    `  const handleSave = useCallback(async () => {
    if (!id) return;
    if (!canEdit) {
      Alert.alert(pe("readOnlyTitle"), readOnlyReason ?? pe("readOnlyFallback"));
      return;
    }
    const { error } = await updatePerms(
      \`/api/provider/staff/\${id}/permissions\`,
      { permissions: local, calendar_scope: calendarScope }
    );
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(pe("couldNotSave"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
    // §Provider-audit 2026-04: previously this screen only fired a haptic on
    // success, so staff owners pressing Save saw no visible confirmation and
    // repeatedly re-tapped. Surface a short confirmation alert mirroring the
    // feedback pattern used across the provider app.
    Alert.alert(pe("updatedTitle"), pe("updatedBody"));
  }, [id, local, updatePerms, refresh, canEdit, readOnlyReason, t]);`,
    `  const handleSave = useCallback(async () => {
    if (!id) return;
    if (!canEdit) {
      Alert.alert(pe("readOnlyTitle"), readOnlyReason ?? pe("readOnlyFallback"));
      return;
    }
    const saveNow = async () => {
      const { error } = await updatePerms(
        \`/api/provider/staff/\${id}/permissions\`,
        { permissions: local, calendar_scope: calendarScope },
      );
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(pe("couldNotSave"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      Alert.alert(pe("updatedTitle"), pe("updatedBody"));
    };
    if (attachedRoleId && attachedRoleName) {
      Alert.alert(
        pe("detachRoleTitle"),
        pe("detachRoleBody", { role: attachedRoleName }),
        [
          { text: pe("cancel"), style: "cancel" },
          { text: pe("continueSave"), onPress: () => void saveNow() },
        ],
      );
      return;
    }
    await saveNow();
  }, [
    id,
    local,
    calendarScope,
    updatePerms,
    refresh,
    canEdit,
    readOnlyReason,
    attachedRoleId,
    attachedRoleName,
    pe,
  ]);`,
  );
}
fs.writeFileSync(staffPath, staff);

const payrollPath =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/payroll.tsx";
let payroll = fs.readFileSync(payrollPath, "utf8");
if (!payroll.includes("pay-period-presets")) {
  payroll = payroll.replace(
    `import { format, startOfMonth, endOfMonth, subDays } from "date-fns";`,
    `import { format } from "date-fns";
import {
  boundsForPayPeriodPreset,
  type PayPeriodTypePreset,
} from "@/lib/pay-period-presets";`,
  );
  payroll = payroll.replace(
    `  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [periodDate, setPeriodDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);`,
    `  const [periodType, setPeriodType] = useState<PayPeriodTypePreset>("weekly");
  const [periodDate, setPeriodDate] = useState(() => new Date());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customEndPicker, setCustomEndPicker] = useState(false);

  useEffect(() => {
    if (periodType === "custom") return;
    const bounds = boundsForPayPeriodPreset(periodType, periodDate);
    setPeriodStart(bounds.start);
    setPeriodEnd(bounds.end);
  }, [periodType, periodDate]);`,
  );
  payroll = payroll.replace(
    `  const getPeriodBounds = useCallback(() => {
    if (periodType === "monthly") {
      const start = startOfMonth(periodDate);
      const end = endOfMonth(periodDate);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    }
    const end = periodDate;
    const start = subDays(end, 6);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [periodType, periodDate]);`,
    `  const getPeriodBounds = useCallback(() => {
    if (periodType === "custom") {
      return { start: periodStart, end: periodEnd };
    }
    return boundsForPayPeriodPreset(periodType, periodDate);
  }, [periodType, periodDate, periodStart, periodEnd]);`,
  );
  payroll = payroll.replace(
    `  const periodLabel =
    periodType === "monthly"
      ? format(periodDate, "MMMM yyyy")
      : \`\${format(subDays(periodDate, 6), "MMM d")} – \${format(periodDate, "MMM d, yyyy")}\`;`,
    `  const periodLabel =
    periodStart && periodEnd
      ? \`\${format(new Date(periodStart + "T12:00:00"), "MMM d, yyyy")} – \${format(new Date(periodEnd + "T12:00:00"), "MMM d, yyyy")}\`
      : pr("emptyValue");`,
  );
  const periodTypes = [
    "weekly",
    "biweekly",
    "semi_monthly",
    "monthly",
    "custom",
  ];
  const periodTypeLabels = {
    weekly: "weekly",
    biweekly: "biweekly",
    semi_monthly: "semiMonthly",
    monthly: "monthly",
    custom: "custom",
  };
  payroll = payroll.replace(
    `        <View style={twStyle("mb-4 flex-row")}>
          <TouchableOpacity
            onPress={() => setPeriodType("weekly")}
            style={[twStyle(\`flex-1 rounded-xl py-3 \${periodType === "weekly" ? "bg-emerald-600" : "bg-gray-100"}\`), { marginEnd: 12 }]}
          >
            <Text
              style={twStyle(\`text-center text-sm font-medium \${periodType === "weekly" ? "text-white" : "text-gray-700"}\`)}
            >
              {pr("weekly")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPeriodType("monthly")}
            style={twStyle(\`flex-1 rounded-xl py-3 \${periodType === "monthly" ? "bg-emerald-600" : "bg-gray-100"}\`)}
          >
            <Text
              style={twStyle(\`text-center text-sm font-medium \${periodType === "monthly" ? "text-white" : "text-gray-700"}\`)}
            >
              {pr("monthly")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
          {periodType === "monthly" ? pr("month") : pr("periodEndDate")}
        </Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        >
          <Text style={twStyle("text-base text-gray-900")}>{periodLabel}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={periodDate}
            mode={periodType === "monthly" ? "date" : "date"}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowDatePicker(Platform.OS === "ios");
              if (d) setPeriodDate(d);
            }}
          />
        )}`,
    `        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-3")}>
          <View style={twStyle("flex-row")}>
            ${periodTypes
              .map(
                (pt) => `<TouchableOpacity
              key="${pt}"
              onPress={() => setPeriodType("${pt}")}
              style={[twStyle(\`rounded-xl py-2.5 px-4 \${periodType === "${pt}" ? "bg-emerald-600" : "bg-gray-100"}\`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(\`text-sm font-medium \${periodType === "${pt}" ? "text-white" : "text-gray-700"}\`)}>
                {pr("${periodTypeLabels[pt]}")}
              </Text>
            </TouchableOpacity>`,
              )
              .join("\n            ")}
          </View>
        </ScrollView>
        <Text style={twStyle("mb-1 text-xs text-gray-500")}>{pr("periodRangeLabel")}</Text>
        <Text style={twStyle("mb-3 text-base font-medium text-gray-900")}>{periodLabel}</Text>
        {periodType === "custom" ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pr("periodStart")}</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            >
              <Text style={twStyle("text-base text-gray-900")}>{periodStart || pr("emptyValue")}</Text>
            </TouchableOpacity>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pr("periodEnd")}</Text>
            <TouchableOpacity
              onPress={() => setCustomEndPicker(true)}
              style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            >
              <Text style={twStyle("text-base text-gray-900")}>{periodEnd || pr("emptyValue")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {periodType === "monthly" ? pr("month") : pr("periodEndDate")}: {format(periodDate, "MMM d, yyyy")}
            </Text>
          </TouchableOpacity>
        )}
        {showDatePicker && (
          <DateTimePicker
            value={periodDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowDatePicker(Platform.OS === "ios");
              if (!d) return;
              if (periodType === "custom") {
                setPeriodStart(format(d, "yyyy-MM-dd"));
              } else {
                setPeriodDate(d);
              }
            }}
          />
        )}
        {customEndPicker && (
          <DateTimePicker
            value={periodEnd ? new Date(periodEnd + "T12:00:00") : periodDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setCustomEndPicker(Platform.OS === "ios");
              if (d) setPeriodEnd(format(d, "yyyy-MM-dd"));
            }}
          />
        )}`,
  );
}
fs.writeFileSync(payrollPath, payroll);

const payRunPath =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/pay-runs/[id].tsx";
let prd = fs.readFileSync(payRunPath, "utf8");
if (!prd.includes("commission_clawback")) {
  prd = prd.replace(
    `  net_pay: number;
  notes: string | null;
}`,
    `  net_pay: number;
  notes: string | null;
  commission_clawback?: number | null;
  carry_forward_in?: number | null;
  carry_forward_out?: number | null;
}`,
  );
}
if (!prd.includes("compliance-warnings")) {
  prd = prd.replace(
    `import { useCallback, useMemo, useState } from "react";`,
    `import { useCallback, useEffect, useMemo, useState } from "react";`,
  );
  prd = prd.replace(
    `  const { execute: patchItem, loading: saving } = useApiMutation("patch");`,
    `  const { execute: patchItem, loading: saving } = useApiMutation("patch");
  const [complianceWarnings, setComplianceWarnings] = useState<
    { staffId: string; warnings: { code: string; message: string; suggestedTopUp?: number }[] }[]
  >([]);`,
  );
  prd = prd.replace(
    `  const isDraft = data?.status === "draft";
  const canEdit = canManagePayroll && isDraft;`,
    `  const isDraft = data?.status === "draft";
  const canEdit = canManagePayroll && isDraft;

  useEffect(() => {
    if (!id || !canManagePayroll || !isDraft) {
      setComplianceWarnings([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { api } = await import("@/lib/api-client");
        const res = await api.get<{ data?: { warnings?: typeof complianceWarnings } }>(
          \`/api/provider/pay-runs/\${id}/compliance-warnings\`,
        );
        if (!cancelled) setComplianceWarnings(res.data?.warnings ?? []);
      } catch {
        if (!cancelled) setComplianceWarnings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, canManagePayroll, isDraft]);`,
  );
  prd = prd.replace(
    `          {canEdit && (
            <View style={twStyle("mt-3 rounded-xl bg-blue-50 p-3")}>
              <Text style={twStyle("text-xs text-blue-900")}>
                {pr("draftHint")}
              </Text>
            </View>
          )}
        </View>

        {items.length === 0 ? (`,
    `          {canEdit && (
            <View style={twStyle("mt-3 rounded-xl bg-blue-50 p-3")}>
              <Text style={twStyle("text-xs text-blue-900")}>
                {pr("draftHint")}
              </Text>
            </View>
          )}
        </View>

        {canManagePayroll && isDraft && complianceWarnings.length > 0 ? (
          <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("text-sm font-semibold text-amber-900 mb-2")}>
              {pr("complianceWarningsTitle")}
            </Text>
            {complianceWarnings.map((row) =>
              row.warnings.map((w, idx) => {
                const name = items.find((i) => i.staff_id === row.staffId)?.staff_name ?? row.staffId;
                return (
                  <Text key={\`\${row.staffId}-\${w.code}-\${idx}\`} style={twStyle("text-xs text-amber-950 mb-1")}>
                    {name}: {w.message}
                  </Text>
                );
              }),
            )}
          </View>
        ) : null}

        {items.length === 0 ? (`,
  );
  prd = prd.replace(
    `                  {Number(item.tips_amount ?? 0) > 0 && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {pr("tips", { amount: formatMoneySafe(item.tips_amount) })}
                    </Text>
                  )}
                </View>`,
    `                  {Number(item.tips_amount ?? 0) > 0 && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {pr("tips", { amount: formatMoneySafe(item.tips_amount) })}
                    </Text>
                  )}
                  {Number(item.commission_clawback ?? 0) !== 0 && (
                    <Text style={twStyle("text-xs text-red-600")}>
                      {pr("clawback", { amount: formatMoneySafe(item.commission_clawback) })}
                    </Text>
                  )}
                  {Number(item.carry_forward_in ?? 0) !== 0 && (
                    <Text style={twStyle("text-xs text-gray-600")}>
                      {pr("carryForwardIn", { amount: formatMoneySafe(item.carry_forward_in) })}
                    </Text>
                  )}
                  {Number(item.carry_forward_out ?? 0) !== 0 && (
                    <Text style={twStyle("text-xs text-gray-600")}>
                      {pr("carryForwardOut", { amount: formatMoneySafe(item.carry_forward_out) })}
                    </Text>
                  )}
                </View>`,
  );
}
fs.writeFileSync(payRunPath, prd);

console.log("batch2 done");
