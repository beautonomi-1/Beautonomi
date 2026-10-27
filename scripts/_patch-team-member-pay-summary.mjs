import fs from "node:fs";
const p =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/team-member/[id].tsx";
let s = fs.readFileSync(p, "utf8");
if (!s.includes("pay-plans")) {
  s = s.replace(
    `  const { data: weeklyStats } = useApi<WeeklyStat[]>(
    id ? \`/api/provider/staff/\${id}/stats/weekly\` : "",
    { enabled: !!id }
  );`,
    `  const { data: weeklyStats } = useApi<WeeklyStat[]>(
    id ? \`/api/provider/staff/\${id}/stats/weekly\` : "",
    { enabled: !!id }
  );
  const { data: payPlanRows } = useApi<{ data?: { pay_model?: string; statutory_mode?: string }[] }>(
    id && canManageTeam ? \`/api/provider/staff/\${id}/pay-plans\` : "",
    { enabled: Boolean(id && canManageTeam) },
  );
  const latestPayPlan = payPlanRows?.data?.[0];`,
  );
}
if (!s.includes("payPlanSummary")) {
  s = s.replace(
    `        {canManageTeam ? (
          <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-2")}>`,
    `        {canManageTeam && latestPayPlan ? (
          <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-sm font-semibold text-gray-900")}>{tm("payPlanSummary")}</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600 capitalize")}>
              {(latestPayPlan.pay_model ?? "commission_only").replace(/_/g, " ")}
              {latestPayPlan.statutory_mode ? \` · \${latestPayPlan.statutory_mode} statutory\` : ""}
            </Text>
            <Text style={twStyle("mt-2 text-xs text-gray-500")}>{tm("payPlanEditHint")}</Text>
          </View>
        ) : null}

        {canManageTeam ? (
          <View style={twStyle("mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-2")}>`,
  );
}
fs.writeFileSync(p, s);
console.log("team-member pay summary patched");
