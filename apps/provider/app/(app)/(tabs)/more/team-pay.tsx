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
  can_manage_payroll?: boolean;
};

export default function TeamPayHubScreen() {
  const { t } = useTranslation();
  const tp = (key: string) => t(`provider.mobile.screens.teamPay.${key}`) as string;
  const { role, provider } = useProvider();
  const isFreelancer = provider?.business_type === "freelancer";
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const canManagePayroll = teamAccess?.can_manage_payroll === true;

  const tabs = useMemo(() => {
    if (isFreelancer) {
      return [];
    }
    if (canManagePayroll) {
      return [
        { id: "payroll", label: tp("payroll"), render: () => <PayrollContent embedded /> },
        { id: "team", label: tp("teamTotals"), render: () => <TeamTotalsContent embedded /> },
        {
          id: "my-earnings",
          label: tp("myEarnings"),
          render: () => <MyEarningsContent embedded />,
        },
      ];
    }
    return [{ id: "my-earnings", label: tp("myEarnings"), render: () => <MyEarningsContent embedded /> }];
  }, [canManagePayroll, isFreelancer]);

  if (isFreelancer) {
    return (
      <FinanceHubShell
        title={tp("title")}
        subtitle={tp("freelancerUnavailable")}
        tabs={[{ id: "info", label: tp("title"), render: () => null }]}
        defaultTab="info"
      />
    );
  }

  return (
    <FinanceHubShell
      title={tp("title")}
      subtitle={canManagePayroll ? tp("subtitleOwner") : tp("subtitleStaff")}
      tabs={tabs}
      defaultTab={canManagePayroll ? "payroll" : "my-earnings"}
    />
  );
}
