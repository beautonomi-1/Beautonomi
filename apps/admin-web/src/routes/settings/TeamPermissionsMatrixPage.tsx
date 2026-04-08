import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSection } from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";
import {
  ALL_SECTIONS,
  SECTION_LABELS,
  ALL_ADMIN_ROLES,
  ROLE_LABELS,
} from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";

function roleLabel(role: UserRole): string {
  if (role === "superadmin") return "Superadmin";
  return ROLE_LABELS[role] ?? role;
}

function cloneMatrix(src: Record<AdminSection, UserRole[]> | undefined): Record<AdminSection, UserRole[]> {
  const out = {} as Record<AdminSection, UserRole[]>;
  for (const section of ALL_SECTIONS) {
    out[section] = [...(src?.[section] ?? [])];
  }
  return out;
}

export function TeamPermissionsMatrixPage() {
  const { allowed, denied } = useSuperadminPage("Team permissions matrix is superadmin-only in nav.");
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<AdminSection, UserRole[]> | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.sectionPermissions(),
    queryFn: () =>
      adminApi.getJson<{ sectionRoles: Record<AdminSection, UserRole[]> }>(
        "/api/admin/settings/section-permissions",
        { timeoutMs: 30_000 }
      ),
    enabled: allowed,
  });

  const matrix = q.data?.sectionRoles;

  useEffect(() => {
    if (matrix) setDraft(cloneMatrix(matrix));
  }, [matrix]);

  const save = useMutation({
    mutationFn: async (sectionRoles: Record<AdminSection, UserRole[]>) => {
      return adminApi.putJson<{ message?: string }>("/api/admin/settings/section-permissions", {
        sectionRoles,
      });
    },
    onSuccess: async () => {
      setSaveMsg("Saved.");
      adminToast.success("Team permissions saved");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.sectionPermissions() });
    },
    onError: (e: Error) => {
      setSaveMsg(e.message);
      adminToast.error(e.message);
    },
  });

  const roles = useMemo(() => ALL_ADMIN_ROLES, []);

  function toggle(section: AdminSection, role: UserRole) {
    setDraft((d) => {
      if (!d) return d;
      const cur = d[section] ?? [];
      const has = cur.includes(role);
      const nextRoles = has ? cur.filter((r) => r !== role) : [...cur, role];
      return { ...d, [section]: nextRoles };
    });
    setSaveMsg(null);
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Team permissions" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Team permissions"
        description="Effective section → roles from GET /api/admin/settings/section-permissions. Changes are saved with PUT (superadmin only)."
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={adminToolbarButtonClass(!draft || save.isPending)}
          disabled={!draft || save.isPending}
          onClick={() => {
            if (!draft) return;
            setSaveMsg(null);
            void save.mutate(draft);
          }}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        {saveMsg ? <span className="text-sm text-gray-600">{saveMsg}</span> : null}
      </div>
      <AdminPanel className="overflow-x-auto">
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh className="sticky left-0 z-10 min-w-[160px] bg-white">Section</AdminTh>
              {roles.map((role) => (
                <AdminTh key={role} className="min-w-[100px] whitespace-normal text-center text-xs font-medium">
                  {roleLabel(role)}
                </AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {ALL_SECTIONS.map((section) => (
              <tr key={section}>
                <AdminTd className="sticky left-0 z-10 bg-white font-medium">{SECTION_LABELS[section]}</AdminTd>
                {roles.map((role) => (
                  <AdminTd key={role} className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={(draft?.[section] ?? []).includes(role)}
                      onChange={() => toggle(section, role)}
                      aria-label={`${SECTION_LABELS[section]} — ${roleLabel(role)}`}
                    />
                  </AdminTd>
                ))}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminPanel>
    </div>
  );
}
