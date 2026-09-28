import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { adminToolbarButtonClass } from "@/lib/adminUi";

type RuleSet = {
  id: string;
  jurisdiction_code: string;
  rule_type: string;
  effective_from: string;
  effective_to: string | null;
  status: string;
  verified_by: string | null;
  verified_by_secondary: string | null;
  published_at: string | null;
};

type GoldenTestResult = { name: string; passed: boolean; failures: string[] };

type VerifyResponse = { verified: boolean; goldenTests: GoldenTestResult[] };

type PayrollHealth = {
  payroll_v2_providers: number;
  staff_manual_statutory: number;
  rules_past_effective_to: Array<{ jurisdiction_code: string; rule_type: string; effective_to: string }>;
};

function verificationCount(r: RuleSet): number {
  return (r.verified_by ? 1 : 0) + (r.verified_by_secondary ? 1 : 0);
}

/**
 * Admin: review payroll jurisdiction rule sets (two distinct verifiers, then publish).
 */
export function PayrollRulesPage() {
  useAdminDocumentTitle("Payroll rule sets");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const qc = useQueryClient();
  const [failedTests, setFailedTests] = useState<{ ruleSetId: string; tests: GoldenTestResult[] } | null>(null);

  const listQ = useQuery({
    queryKey: adminQueryKeys.payrollRuleSets(),
    queryFn: () => adminApi.getJson<RuleSet[]>("/api/admin/payroll/rule-sets"),
    enabled: allowed,
  });

  const healthQ = useQuery({
    queryKey: adminQueryKeys.payrollHealth(),
    queryFn: () => adminApi.getJson<PayrollHealth>("/api/admin/payroll/health"),
    enabled: allowed,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.payrollRuleSets() });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.payrollHealth() });
  };

  const verifyMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson<VerifyResponse>(`/api/admin/payroll/rule-sets/${id}/verify`, {}),
    onSuccess: (res, id) => {
      if (res?.verified) {
        setFailedTests(null);
        adminToast.success("Verification recorded");
      } else {
        const failed = (res?.goldenTests ?? []).filter((t) => !t.passed);
        setFailedTests({ ruleSetId: id, tests: failed });
        adminToast.error(`Golden tests failed (${failed.length}). Rule set was not verified.`);
      }
      refresh();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payroll/rule-sets/${id}/publish`, {}),
    onSuccess: () => {
      adminToast.success("Rule set published");
      refresh();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (listQ.isLoading) return <AdminPageSkeleton rows={6} />;
  if (listQ.error) return <AdminRetryBlock message={listQ.error.message} onRetry={() => void listQ.refetch()} />;

  const rows = listQ.data ?? [];
  const busy = verifyMut.isPending || publishMut.isPending;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Payroll rule sets"
        description="Published sets drive statutory calculations per jurisdiction. Two different admins must verify a set before it can be published."
      />

      {healthQ.data ? (
        <div className="grid gap-3 md:grid-cols-3">
          <AdminMetricCard label="Providers on payroll v2" value={healthQ.data.payroll_v2_providers} />
          <AdminMetricCard label="Staff on manual statutory" value={healthQ.data.staff_manual_statutory} />
          <AdminMetricCard
            label="Published sets past end date"
            value={healthQ.data.rules_past_effective_to.length}
          />
        </div>
      ) : null}

      {failedTests ? (
        <AdminPanel title="Golden test failures">
          <ul className="space-y-1 text-sm text-red-800">
            {failedTests.tests.map((t, i) => (
              <li key={`${t.name}-${i}`}>
                <span className="font-medium">{t.name}</span>
                {t.failures.length ? `: ${t.failures.join("; ")}` : ""}
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No rule sets" description="Rule sets are seeded by payroll migrations." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Jurisdiction</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>From</AdminTh>
              <AdminTh>To</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Verifications</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const verifications = verificationCount(r);
              const canVerify = r.status !== "published" && r.status !== "retired" && verifications < 2;
              const canPublish = r.status === "verified" && verifications >= 2;
              return (
                <tr key={r.id}>
                  <AdminTd>{r.jurisdiction_code}</AdminTd>
                  <AdminTd>{r.rule_type}</AdminTd>
                  <AdminTd>{r.effective_from}</AdminTd>
                  <AdminTd>{r.effective_to ?? "—"}</AdminTd>
                  <AdminTd>{r.status}</AdminTd>
                  <AdminTd>{r.status === "published" ? "—" : `${verifications} of 2`}</AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      {canVerify ? (
                        <button
                          type="button"
                          className={adminToolbarButtonClass(busy)}
                          disabled={busy}
                          onClick={() => verifyMut.mutate(r.id)}
                        >
                          Verify
                        </button>
                      ) : null}
                      {canPublish ? (
                        <button
                          type="button"
                          className={adminToolbarButtonClass(busy)}
                          disabled={busy}
                          onClick={() => publishMut.mutate(r.id)}
                        >
                          Publish
                        </button>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
