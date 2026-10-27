import fs from "node:fs";
const p =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/settings/team-commissions.tsx";
let s = fs.readFileSync(p, "utf8");
if (!s.includes("<StaffPayPlanForm")) {
  const insert = `            <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>
              {tc("payPlanSection")}
            </Text>
            {!canManagePayroll ? (
              <Text style={twStyle("mb-3 text-xs text-gray-500")}>{tc("payPlanReadOnly")}</Text>
            ) : null}
            <StaffPayPlanForm
              value={payPlan}
              onChange={setPayPlan}
              disabled={!canManagePayroll}
              label={(key) => tc(key)}
            />

            <Text style={twStyle("mb-1 mt-4 text-sm font-medium text-gray-700")}>
              {tc("serviceCommission")}
            </Text>`;
  s = s.replace(
    `            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              {tc("serviceCommission")}
            </Text>`,
    insert,
  );
}
if (!s.includes("editable={canManagePayroll}") || !s.match(/serviceRate[\s\S]{0,400}editable={canManagePayroll}/)) {
  s = s.replace(
    /placeholderTextColor="#9ca3af"\n            \/>\n            <Text style={twStyle\("mb-1 text-sm font-medium text-gray-700"\)}>\n              {tc\("productCommission"\)}/,
    `placeholderTextColor="#9ca3af"
              editable={canManagePayroll}
            />
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              {tc("productCommission")}`,
  );
}
if (!s.includes("disabled={!canManagePayroll}")) {
  s = s.replace(
    "<TouchableOpacity onPress={addTier}>",
    "<TouchableOpacity onPress={addTier} disabled={!canManagePayroll}>",
  );
}
if (s.includes('label={tc("saveCommission")}')) {
  s = s.replace(
    `label={tc("saveCommission")}
                onPress={handleSave}
                loading={saving}
                fullWidth`,
    `label={canManagePayroll ? tc("savePaySettings") : tc("payPlanReadOnly")}
                onPress={handleSave}
                loading={saving || savingPlan}
                fullWidth
                disabled={!canManagePayroll}`,
  );
}
fs.writeFileSync(p, s);
console.log("patched", s.includes("<StaffPayPlanForm"));
