import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSection } from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";
import {
  ALL_SECTIONS,
  SECTION_LABELS,
  ALL_ADMIN_ROLES,
  ADMIN_SECTION_ROLES,
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
  const [isDirty, setIsDirty] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.sectionPermissions(),
    queryFn: () =>
      adminApi.getJson<{ sectionRoles: Record<AdminSection, UserRole[]> }>(
        "/api/admin/settings/section-permissions",
        { timeoutMs: 30_000 }
      ),
    enabled: allowed,
    // Disable background refetch while user has unsaved changes
    refetchOnWindowFocus: !isDirty,
    staleTime: 30_000,
  });

  const matrix = q.data?.sectionRoles;

  // Only initialise draft once when data first loads; never overwrite with background refetch
  useEffect(() => {
    if (matrix && draft === null) setDraft(cloneMatrix(matrix));
  }, [matrix, draft]);

  const save = useMutation({
    mutationFn: async (sectionRoles: Record<AdminSection, UserRole[]>) => {
      return adminApi.putJson<{ message?: string }>("/api/admin/settings/section-permissions", {
        sectionRoles,
      });
    },
    onSuccess: async (_data, savedRoles) => {
      setSaveMsg("Saved.");
      setIsDirty(false);
      // Re-seed the draft from the exact payload we persisted (superadmin
      // force-included) so local state matches the server without waiting for
      // the refetch to settle.
      setDraft(cloneMatrix(savedRoles));
      adminToast.success("Team permissions saved");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.sectionPermissions() });
    },
    onError: (e: Error) => {
      setSaveMsg(e.message);
      adminToast.error(e.message);
    },
  });

  const roles = useMemo(() => ALL_ADMIN_ROLES, []);

  // Warn before leaving with unsaved changes (refresh / tab close).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function toggle(section: AdminSection, role: UserRole) {
    // Superadmin always has full access (canAccessSection short-circuits on
    // superadmin), so the column is locked on and not user-editable.
    if (role === "superadmin") return;
    setDraft((d) => {
      if (!d) return d;
      const cur = d[section] ?? [];
      const has = cur.includes(role);
      const nextRoles = has ? cur.filter((r) => r !== role) : [...cur, role];
      return { ...d, [section]: nextRoles };
    });
    setIsDirty(true);
    setSaveMsg(null);
  }

  function discard() {
    if (!matrix) return;
    setDraft(cloneMatrix(matrix));
    setIsDirty(false);
    setSaveMsg(null);
  }

  /**
   * Build the save payload. Superadmin is always implied at runtime, so we
   * persist it in every section to keep stored data consistent with the
   * effective access model (avoids a stored matrix that looks like superadmin
   * was removed).
   */
  function buildSavePayload(d: Record<AdminSection, UserRole[]>): Record<AdminSection, UserRole[]> {
    const out = {} as Record<AdminSection, UserRole[]>;
    for (const section of ALL_SECTIONS) {
      const set = new Set<UserRole>(d[section] ?? []);
      set.add("superadmin");
      out[section] = [...set];
    }
    return out;
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

  // Guard against brief flash before useEffect seeds draft from query data
  if (!draft) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Team permissions" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
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
          className={adminToolbarButtonClass(!draft || !isDirty || save.isPending)}
          disabled={!draft || !isDirty || save.isPending}
          onClick={() => {
            if (!draft) return;
            setSaveMsg(null);
            void save.mutate(buildSavePayload(draft));
          }}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        {isDirty && !save.isPending && (
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={discard}
          >
            Discard changes
          </button>
        )}
        {isDirty && !save.isPending && (
          <span className="text-sm font-medium text-amber-600">Unsaved changes</span>
        )}
        {saveMsg ? <span className="text-sm text-gray-600">{saveMsg}</span> : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        <span className="font-medium text-gray-800">Superadmin</span> always has full
        access and cannot be unassigned. A section with no roles selected becomes{" "}
        <span className="font-medium">superadmin-only</span>. Cells outlined in amber differ
        from the built-in defaults.
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
                {roles.map((role) => {
                  const isSuper = role === "superadmin";
                  const checked = isSuper || (draft?.[section] ?? []).includes(role);
                  const defaultHas = (ADMIN_SECTION_ROLES[section] ?? []).includes(role);
                  const differsFromDefault = !isSuper && checked !== defaultHas;
                  return (
                    <AdminTd
                      key={role}
                      className={`text-center ${differsFromDefault ? "bg-amber-50 ring-1 ring-inset ring-amber-300" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                        checked={checked}
                        disabled={isSuper}
                        title={isSuper ? "Superadmin always has full access" : undefined}
                        onChange={() => toggle(section, role)}
                        aria-label={`${SECTION_LABELS[section]} — ${roleLabel(role)}${isSuper ? " (always on)" : ""}`}
                      />
                    </AdminTd>
                  );
                })}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminPanel>
    </div>
  );
}
