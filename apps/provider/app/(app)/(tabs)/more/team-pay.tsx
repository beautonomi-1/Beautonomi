import { useMemo } from "react";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { PayrollContent } from "./payroll";
import { TeamTotalsContent } from "./team-totals";
import { MyEarningsContent } from "./my-earnings";

type TeamAccessPayload = {
  is_business_owner?: boolean;
};

function isOwnerRole(role: string | null, teamAccess?: TeamAccessPayload | null): boolean {
  return role === "provider_owner" || role === "superadmin" || teamAccess?.is_business_owner === true;
}

export default function TeamPayHubScreen() {
  const { role } = useProvider();
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const isOwner = isOwnerRole(role, teamAccess);

  const tabs = useMemo(() => {
    if (isOwner) {
      return [
        { id: "payroll", label: "Payroll", render: () => <PayrollContent embedded /> },
        { id: "team", label: "Team totals", render: () => <TeamTotalsContent embedded /> },
      ];
    }
    return [{ id: "my-earnings", label: "My earnings", render: () => <MyEarningsContent embedded /> }];
  }, [isOwner]);

  return (
    <FinanceHubShell
      title="Team & pay"
      subtitle={isOwner ? "Payroll & staff performance" : "Your pay stubs"}
      tabs={tabs}
      defaultTab={isOwner ? "payroll" : "my-earnings"}
    />
  );
}
