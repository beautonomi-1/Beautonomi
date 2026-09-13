import { useMemo } from "react";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { PayrollContent } from "./payroll";
import { TeamTotalsContent } from "./team-totals";
import { MyEarningsContent } from "./my-earnings";
import { useTranslation } from "@beautonomi/i18n";

type TeamAccessPayload = {
  is_business_owner?: boolean;
};

function isOwnerRole(role: string | null, teamAccess?: TeamAccessPayload | null): boolean {
  return role === "provider_owner" || role === "superadmin" || teamAccess?.is_business_owner === true;
}

export default function TeamPayHubScreen() {
  const { t } = useTranslation();
  const tp = (key: string) => t(`provider.mobile.screens.teamPay.${key}`) as string;
  const { role } = useProvider();
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const isOwner = isOwnerRole(role, teamAccess);

  const tabs = useMemo(() => {
    if (isOwner) {
      return [
        { id: "payroll", label: tp("payroll"), render: () => <PayrollContent embedded /> },
        { id: "team", label: tp("teamTotals"), render: () => <TeamTotalsContent embedded /> },
      ];
    }
    return [{ id: "my-earnings", label: tp("myEarnings"), render: () => <MyEarningsContent embedded /> }];
  }, [isOwner, t]);

  return (
    <FinanceHubShell
      title={tp("title")}
      subtitle={isOwner ? tp("subtitleOwner") : tp("subtitleStaff")}
      tabs={tabs}
      defaultTab={isOwner ? "payroll" : "my-earnings"}
    />
  );
}
