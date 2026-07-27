import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type RuleRow = { source: string; points: number; label?: string; display_order?: number; id?: string };

type Payload = { rules: RuleRow[] };

export function GamificationPointRulesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.gamificationPointRules(),
    queryFn: () => adminApi.getJson<Payload>("/api/admin/gamification/point-rules", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = q.data?.rules ?? [];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of rows) {
      if (r.source) next[r.source] = String(r.points ?? "");
    }
    setDraft(next);
    setInputErrors({});
  }, [rows]);

  const dirty = useMemo(() => {
    for (const r of rows) {
      const s = r.source;
      if (!s) continue;
      if (inputErrors[s]) return false;
      const cur = parseInt(draft[s] ?? "", 10);
      if (Number.isNaN(cur) || cur !== Number(r.points)) return true;
    }
    return false;
  }, [rows, draft, inputErrors]);

  const hasInputErrors = Object.keys(inputErrors).length > 0;

  function handlePointsChange(source: string, raw: string) {
    setDraft((d) => ({ ...d, [source]: raw }));
    if (raw.trim() === "") {
      setInputErrors((e) => {
        const next = { ...e };
        delete next[source];
        return next;
      });
      return;
    }
    if (!/^\d+$/.test(raw.trim())) {
      setInputErrors((e) => ({ ...e, [source]: "Enter a whole number 0 or greater." }));
    } else {
      setInputErrors((e) => {
        const next = { ...e };
        delete next[source];
        return next;
      });
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const rules = rows
        .filter((r) => r.source)
        .map((r) => {
          const p = parseInt(draft[r.source] ?? "", 10);
          if (Number.isNaN(p) || p < 0) {
            throw new Error(`Invalid points for ${r.source}`);
          }
          return { source: r.source, points: p };
        });
      return adminApi.patchJson<unknown>("/api/admin/gamification/point-rules", { rules });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.gamificationPointRules() });
      adminToast.success("Point rules saved");
    },
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Point rules" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const err = save.error instanceof Error ? save.error.message : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Gamification · Point rules"
        description={
          <>
            Adjust points per activity source; changes are audited. Platform-wide backfill and per-provider tools live on{" "}
            <Link className="text-gray-900 underline" to={adminSpaTo("/admin/gamification/operations")}>
              Gamification ops
            </Link>
            .
          </>
        }
      />
      <AdminPanel>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={!dirty || save.isPending || hasInputErrors}
            onClick={() => save.mutate()}
          >
            Save changes
          </button>
          {err ? <span className="text-sm text-red-600">{err}</span> : null}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No rules" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Source</AdminTh>
              <AdminTh>Points</AdminTh>
              <AdminTh>Label</AdminTh>
              <AdminTh>Order</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const src = String(r.source ?? "");
              return (
                <tr key={String(r.id ?? src)}>
                  <AdminTd className="font-mono text-xs">{src}</AdminTd>
                  <AdminTd>
                    <input
                      className={`w-20 rounded border px-2 py-1 text-sm tabular-nums ${
                        inputErrors[src] ? "border-red-500" : "border-gray-300"
                      }`}
                      value={draft[src] ?? ""}
                      onChange={(e) => handlePointsChange(src, e.target.value)}
                      inputMode="numeric"
                    />
                    {inputErrors[src] ? (
                      <p className="mt-1 text-xs text-red-600">{inputErrors[src]}</p>
                    ) : null}
                  </AdminTd>
                  <AdminTd>{String(r.label ?? "")}</AdminTd>
                  <AdminTd>{String(r.display_order ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
