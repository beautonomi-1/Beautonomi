import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
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
import { AdminModal } from "@/components/admin/AdminModal";

type Tab = "countries" | "currencies" | "languages" | "locales" | "timezones";

const TABS: Tab[] = ["countries", "currencies", "languages", "locales", "timezones"];

const API: Record<Tab, string> = {
  countries: "/api/admin/iso-codes/countries",
  currencies: "/api/admin/iso-codes/currencies",
  languages: "/api/admin/iso-codes/languages",
  locales: "/api/admin/iso-codes/locales",
  timezones: "/api/admin/iso-codes/timezones",
};

// Columns to show per tab (trim to the most useful)
const TAB_DISPLAY_COLS: Record<Tab, string[]> = {
  countries: ["code", "code3", "name", "phone_country_code", "is_active"],
  currencies: ["code", "name", "symbol", "decimal_places", "is_active"],
  languages: ["code", "name", "native_name", "is_active"],
  locales: ["code", "language_code", "country_code", "name", "is_active"],
  timezones: ["code", "name", "utc_offset", "country_code", "is_active"],
};

// Fields needed to create/edit each tab's entity
const TAB_CREATE_FIELDS: Record<Tab, { field: string; label: string; type?: string }[]> = {
  countries: [
    { field: "code", label: "ISO 2-letter code (e.g. ZA)" },
    { field: "code3", label: "ISO 3-letter code (e.g. ZAF)" },
    { field: "name", label: "Country name" },
    { field: "phone_country_code", label: "Phone code (e.g. +27)" },
    { field: "is_active", label: "Active", type: "checkbox" },
  ],
  currencies: [
    { field: "code", label: "ISO code (e.g. ZAR)" },
    { field: "name", label: "Currency name" },
    { field: "symbol", label: "Symbol (e.g. R)" },
    { field: "decimal_places", label: "Decimal places", type: "number" },
    { field: "is_active", label: "Active", type: "checkbox" },
  ],
  languages: [
    { field: "code", label: "ISO code (e.g. en)" },
    { field: "name", label: "Language name" },
    { field: "native_name", label: "Native name (e.g. English)" },
    { field: "is_active", label: "Active", type: "checkbox" },
  ],
  locales: [
    { field: "code", label: "Locale code (e.g. en-ZA)" },
    { field: "language_code", label: "Language code" },
    { field: "country_code", label: "Country code" },
    { field: "name", label: "Display name" },
    { field: "is_active", label: "Active", type: "checkbox" },
  ],
  timezones: [
    { field: "code", label: "Timezone code (e.g. Africa/Johannesburg)" },
    { field: "name", label: "Display name (e.g. South Africa Standard Time)" },
    { field: "utc_offset", label: "UTC offset (e.g. +02:00)" },
    { field: "country_code", label: "Country code (e.g. ZA)" },
    { field: "is_active", label: "Active", type: "checkbox" },
  ],
};

function getCodeKey(_tab: Tab): string {
  return "code";
}

export function IsoCodesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations access is required."
  );
  useAdminDocumentTitle("ISO Reference Data");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const rawTab = sp.get("tab") || "countries";
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "countries";
  const qk = useMemo(() => adminQueryKeys.isoCodes(tab), [tab]);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>(API[tab], { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rawList = Array.isArray(q.data) ? q.data : [];
  const rows = rawList.filter((r) => {
    if (!search.trim()) return true;
    const lo = search.toLowerCase();
    return Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(lo));
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk });
  const codeKey = getCodeKey(tab);
  const displayCols = TAB_DISPLAY_COLS[tab];
  const createFields = TAB_CREATE_FIELDS[tab];

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson(API[tab], body),
    onSuccess: () => {
      adminToast.success("Entry created");
      setShowCreate(false);
      setFormData({});
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create"),
  });

  const patchMut = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`${API[tab]}/${encodeURIComponent(code)}`, body),
    onSuccess: () => {
      adminToast.success("Entry updated");
      setEditRow(null);
      setFormData({});
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (code: string) =>
      adminApi.deleteJson(`${API[tab]}/${encodeURIComponent(code)}`),
    onSuccess: () => {
      adminToast.success("Entry deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete"),
  });

  function openCreate() {
    const initial: Record<string, unknown> = {};
    createFields.forEach((f) => { initial[f.field] = f.type === "checkbox" ? true : f.type === "number" ? "" : ""; });
    setFormData(initial);
    setShowCreate(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setFormData({ ...row });
    setEditRow(row);
  }

  function setTab(next: Tab) {
    const n = new URLSearchParams(sp);
    n.set("tab", next);
    setSp(n, { replace: true });
    setSearch("");
  }

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="ISO reference data" />
        <AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="ISO reference data"
        description="Countries, currencies, languages, locales, and timezones used across the platform."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + Add entry
            </button>
          </div>
        }
      />

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t} type="button" className={adminTabButtonClass(tab === t)} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>

      <input
        type="search"
        placeholder={`Search ${tab}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />

      {/* Create modal */}
      <AdminModal open={showCreate} title={`Add ${tab.slice(0, -1)}`} onClose={() => setShowCreate(false)} footer={null}>
        <IsoForm
          fields={createFields}
          formData={formData}
          setFormData={setFormData}
          isPending={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSave={() => {
            const payload: Record<string, unknown> = {};
            createFields.forEach((f) => {
              if (f.type === "number") payload[f.field] = Number(formData[f.field]);
              else payload[f.field] = formData[f.field];
            });
            createMut.mutate(payload);
          }}
          saveLabel="Create"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal open={!!editRow} title={`Edit: ${String(editRow?.[codeKey] ?? "")}`} onClose={() => { setEditRow(null); setFormData({}); }} footer={null}>
        {editRow && (
          <IsoForm
            fields={createFields.filter((f) => f.field !== codeKey)}
            formData={formData}
            setFormData={setFormData}
            isPending={patchMut.isPending}
            onCancel={() => { setEditRow(null); setFormData({}); }}
            onSave={() => {
              const payload: Record<string, unknown> = {};
              createFields.filter((f) => f.field !== codeKey).forEach((f) => {
                if (f.type === "number") payload[f.field] = Number(formData[f.field]);
                else payload[f.field] = formData[f.field];
              });
              patchMut.mutate({ code: String(editRow[codeKey] ?? ""), body: payload });
            }}
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No rows"
          description={
            rawList.length === 0
              ? "No reference data yet. Run DB migrations (including seed migration for ISO tables) or add entries manually."
              : "No matches for your search — clear the search box or add a new entry."
          }
          action={
            <button type="button" onClick={openCreate} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + Add entry
            </button>
          }
        />
      ) : (
        <>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                {displayCols.map((c) => <AdminTh key={c}>{c}</AdminTh>)}
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={String(r.id ?? r[codeKey] ?? i)}>
                  {displayCols.map((c) => (
                    <AdminTd key={c} className="max-w-[10rem] truncate text-xs">
                      {c === "is_active" ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${r[c] ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {r[c] ? "yes" : "no"}
                        </span>
                      ) : (
                        String(r[c] ?? "")
                      )}
                    </AdminTd>
                  ))}
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          const code = String(r[codeKey] ?? "");
                          if (confirm(`Delete "${code}"?`)) deleteMut.mutate(code);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
          {rows.length > 200 && <p className="text-sm text-gray-500">Showing first 200 of {rows.length} rows.</p>}
        </>
      )}
    </div>
  );
}

function IsoForm({
  fields, formData, setFormData, isPending, onCancel, onSave, saveLabel,
}: {
  fields: { field: string; label: string; type?: string }[];
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  isPending: boolean; onCancel: () => void; onSave: () => void; saveLabel: string;
}) {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.field}>
          <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
          {f.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(formData[f.field])}
                onChange={(e) => setFormData((p) => ({ ...p, [f.field]: e.target.checked }))}
                className="accent-gray-900"
              />
              Enabled
            </label>
          ) : (
            <input
              type={f.type ?? "text"}
              value={String(formData[f.field] ?? "")}
              onChange={(e) => setFormData((p) => ({ ...p, [f.field]: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
        <button type="button" disabled={isPending} onClick={onSave} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
