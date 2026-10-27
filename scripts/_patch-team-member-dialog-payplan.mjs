import fs from "node:fs";
const p =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/web/src/app/provider/team/members/components/TeamMemberCreateEditDialog.tsx";
let s = fs.readFileSync(p, "utf8");
if (!s.includes("StaffPayPlanFields")) {
  s = s.replace(
    'import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";',
    `import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { StaffPayPlanFields } from "@/components/provider/team/StaffPayPlanFields";
import {
  defaultPayPlanFormState,
  payPlanFromApiRow,
  payPlanToPostBody,
} from "@/lib/payroll/pay-plan-form-state";`,
  );
}
if (!s.includes("canManagePayroll")) {
  s = s.replace(
    "  const { salons, selectedLocationId } = useProviderPortal();",
    `  const { salons, selectedLocationId } = useProviderPortal();
  const { hasPermission, isOwner } = usePermissions();
  const canManagePayroll = isOwner || hasPermission("manage_payroll");`,
  );
}
if (!s.includes("[payPlan, setPayPlan]")) {
  s = s.replace(
    "  const [serviceIds, setServiceIds] = useState<string[]>([]);",
    `  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [payPlan, setPayPlan] = useState(defaultPayPlanFormState);`,
  );
}
if (!s.includes("payPlansResponse")) {
  s = s.replace(
    `            const [settingsResponse, notifResponse] = await Promise.all([
              fetcher.get<{ data: any }>(\`/api/provider/staff/\${member.id}/settings\`),
              fetcher.get<{ data: any }>(\`/api/provider/staff/\${member.id}/notifications\`).catch(() => null),
            ]);`,
    `            const [settingsResponse, notifResponse, commissionResponse, payPlansResponse] =
              await Promise.all([
              fetcher.get<{ data: any }>(\`/api/provider/staff/\${member.id}/settings\`),
              fetcher.get<{ data: any }>(\`/api/provider/staff/\${member.id}/notifications\`).catch(() => null),
              fetcher
                .get<{
                  data: {
                    serviceCommissionRate?: number;
                    productCommissionRate?: number;
                    hourlyRate?: number;
                    salary?: number;
                  };
                }>(\`/api/provider/staff/\${member.id}/commission\`)
                .catch(() => null),
              fetcher
                .get<{ data: Record<string, unknown>[] }>(
                  \`/api/provider/staff/\${member.id}/pay-plans\`,
                )
                .catch(() => null),
            ]);`,
  );
  s = s.replace(
    `            const settings = settingsResponse.data;
            const notif = notifResponse?.data;

            setFormData({`,
    `            const settings = settingsResponse.data;
            const notif = notifResponse?.data;
            const commission = commissionResponse?.data;
            setPayPlan(
              payPlanFromApiRow(payPlansResponse?.data?.[0], {
                service_rate: commission?.serviceCommissionRate ?? settings?.commission_rate ?? 0,
                product_rate: commission?.productCommissionRate ?? 0,
                hourly_rate: commission?.hourlyRate ?? settings?.hourly_rate ?? 0,
                base_amount: commission?.salary ?? settings?.salary ?? 0,
              }),
            );

            setFormData({`,
  );
}
if (!s.includes("payPlanToPostBody(payPlan")) {
  s = s.replace(
    `        toast.success(t("web.provider.teamMemberDialog.updated"));
      } else {`,
    `        if (canManagePayroll) {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            const commissionRes = await fetcher
              .get<{
                data: { tiers?: { minRevenue: number; commissionRate: number; tierOrder?: number }[] };
              }>(\`/api/provider/staff/\${member.id}/commission\`)
              .catch(() => null);
            const tiers = (commissionRes?.data?.tiers ?? []).map((tier, i) => ({
              min_revenue: tier.minRevenue,
              commission_rate: tier.commissionRate,
              tier_order: tier.tierOrder ?? i,
            }));
            await fetcher.post(
              \`/api/provider/staff/\${member.id}/pay-plans\`,
              payPlanToPostBody(payPlan, tiers),
            );
          } catch (payPlanErr) {
            console.error("Failed to save pay plan:", payPlanErr);
            toast.warning(t("web.provider.settings.pages.team/commissions.failedToSave"));
          }
        }

        toast.success(t("web.provider.teamMemberDialog.updated"));
      } else {`,
  );
}
if (!s.includes("<StaffPayPlanFields")) {
  s = s.replace(
    `                <TabsContent value="compensation" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.teamMemberDialog.compensationSettings")}</h3>`,
    `                <TabsContent value="compensation" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.settings.pages.team/commissions.payPlanSection")}</h3>
                {!canManagePayroll && (
                  <p className="text-xs text-gray-500 mb-3">
                    {t("web.provider.settings.pages.team/commissions.payPlanReadOnly")}
                  </p>
                )}
                <StaffPayPlanFields
                  value={payPlan}
                  onChange={setPayPlan}
                  disabled={!canManagePayroll}
                />
              </div>
              <Separator />
              <fieldset disabled={!canManagePayroll} className="min-w-0 border-0 p-0 m-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.teamMemberDialog.compensationSettings")}</h3>`,
  );
  s = s.replace(
    `                </div>
              </div>
            </TabsContent>

                <TabsContent value="settings" className="mt-0 space-y-6">`,
    `                </div>
              </div>
              </fieldset>
            </TabsContent>

                <TabsContent value="settings" className="mt-0 space-y-6">`,
  );
}
fs.writeFileSync(p, s);
console.log("patched TeamMemberCreateEditDialog");
