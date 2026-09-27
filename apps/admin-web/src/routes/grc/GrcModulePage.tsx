import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGrcModule, type GrcModuleConfig, type GrcModuleKey } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  Cell, Empty, ErrorText, Field, FieldInput, btnPrimary, btnSecondary, inputCls,
  useDirectory, useGrcMutation, useGrcPermissions, type DirectoryUser, type Row,
} from "./grcShared";
import { RecordExtras } from "./GrcRecordExtras";

type ListResponse = { items: Row[]; total: number; truncated: boolean };
type DetailResponse = { item: Row; related: Record<string, Row[]> };

function useRefOptions(mod: GrcModuleConfig, enabled: boolean) {
  const refs = Array.from(new Set(mod.fields.filter((f) => f.type === "ref" && f.ref).map((f) => f.ref as GrcModuleKey)));
  const q = useQuery({
    queryKey: ["grc", "ref-options", refs.join(",")],
    enabled: enabled && refs.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, { value: string; label: string }[]> = {};
      for (const key of refs) {
        const refMod = getGrcModule(key);
        if (!refMod) continue;
        try {
          const res = await adminApi.getJson<ListResponse>(`/api/admin/grc/records/${key}`);
          out[key] = res.items.map((r) => {
            const id = String(r[refMod.idColumn]);
            const label = String(r[refMod.labelColumn] ?? id);
            return { value: id, label: label === id ? id : `${label}${refMod.idColumn === "id" && id.length > 20 ? "" : ` (${id})`}` };
          });
        } catch {
          out[key] = [];
        }
      }
      return out;
    },
  });
  return q.data ?? {};
}

function initialValues(mod: GrcModuleConfig, item: Row | null): Row {
  const v: Row = {};
  for (const f of mod.fields) {
    const raw = item?.[f.key];
    v[f.key] = f.type === "boolean" ? raw === true : raw ?? "";
  }
  return v;
}

function diff(mod: GrcModuleConfig, original: Row, current: Row, mode: "create" | "update"): Row {
  const out: Row = {};
  for (const f of mod.fields) {
    if (f.readOnly || (mode === "update" && f.createOnly)) continue;
    const a = original[f.key] ?? "";
    const b = current[f.key] ?? "";
    if (mode === "create" ? b !== "" && b !== false : String(a) !== String(b)) out[f.key] = b;
  }
  return out;
}

export function RecordForm({
  mod, item, onSaved, onCancel, users,
}: {
  mod: GrcModuleConfig;
  item: Row | null;
  onSaved: (row: Row) => void;
  onCancel?: () => void;
  users: DirectoryUser[];
}) {
  const { has } = useGrcPermissions();
  const mode = item ? "update" : "create";
  const canEdit = !!mod.editPermission && has(mod.editPermission);
  const original = useMemo(() => initialValues(mod, item), [mod, item]);
  const [values, setValues] = useState<Row>(original);
  useEffect(() => setValues(original), [original]);
  const refOptions = useRefOptions(mod, canEdit);

  const save = useGrcMutation(
    async () => {
      const body = diff(mod, original, values, mode);
      if (mode === "create") return adminApi.postJson<{ item: Row }>(`/api/admin/grc/records/${mod.key}`, body);
      return adminApi.patchJson<{ item: Row }>(`/api/admin/grc/records/${mod.key}/${encodeURIComponent(String(item![mod.idColumn]))}`, body);
    },
    (r) => onSaved(r.item),
  );
  const dirty = Object.keys(diff(mod, original, values, mode)).length > 0;

  if (mod.fields.length === 0) return null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {mod.fields.map((f) => {
          const locked = !canEdit || f.readOnly || (mode === "update" && f.createOnly);
          const wide = f.type === "textarea" || f.type === "markdown";
          return (
            <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
              <Field label={f.label} help={f.help} required={f.required && !locked}>
                <FieldInput field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} users={users} refOptions={f.ref ? refOptions[f.ref] : undefined} disabled={locked} />
              </Field>
            </div>
          );
        })}
      </div>
      <ErrorText error={save.error} />
      {canEdit ? (
        <div className="flex justify-end gap-2">
          {onCancel ? <button type="button" className={btnSecondary} onClick={onCancel}>Cancel</button> : null}
          <button type="submit" className={btnPrimary} disabled={save.isPending || !dirty}>
            {save.isPending ? "Saving…" : mode === "create" ? `Create ${mod.singular}` : "Save changes"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function RecordDialog({ mod, id, onClose }: { mod: GrcModuleConfig; id: string; onClose: () => void }) {
  const { users } = useDirectory();
  const q = useQuery({
    queryKey: ["grc", "record", mod.key, id],
    queryFn: () => adminApi.getJson<DetailResponse>(`/api/admin/grc/records/${mod.key}/${encodeURIComponent(id)}`),
  });
  const item = q.data?.item ?? null;
  const title = item ? String(item[mod.labelColumn] ?? id) : mod.singular;
  return (
    <AdminModal open onClose={onClose} title={title} description={mod.title} size="2xl" footer={<button type="button" className={btnSecondary} onClick={onClose}>Close</button>}>
      {q.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {q.isError ? <AdminRetryBlock message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
      {item ? (
        <div className="space-y-6">
          <RecordExtras module={mod.key} item={item} related={q.data?.related ?? {}} users={users} />
          {mod.fields.length ? (
            <section>
              <h4 className="mb-3 text-sm font-semibold text-gray-900">Details</h4>
              <RecordForm mod={mod} item={item} users={users} onSaved={() => undefined} />
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminModal>
  );
}

export function GrcModuleTable({ moduleKey, toolbar }: { moduleKey: GrcModuleKey; toolbar?: ReactNode }) {
  const mod = getGrcModule(moduleKey)!;
  const { has } = useGrcPermissions();
  const { users, byId } = useDirectory();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const statusOptions = mod.fields.find((f) => f.key === mod.statusColumn)?.options ?? [];
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (status) params.set("status", status);
  const q = useQuery({
    queryKey: ["grc", "records", moduleKey, params.toString()],
    queryFn: () => adminApi.getJson<ListResponse>(`/api/admin/grc/records/${moduleKey}${params.toString() ? `?${params}` : ""}`),
    placeholderData: (prev) => prev,
  });
  const canCreate = mod.canCreate && !!mod.editPermission && has(mod.editPermission);

  return (
    <AdminPanel
      title={q.data ? `${q.data.total} ${q.data.total === 1 ? mod.singular : mod.title.toLowerCase()}` : mod.title}
      actions={
        <>
          {toolbar}
          {canCreate ? <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New {mod.singular}</button> : null}
        </>
      }
    >
      <p className="-mt-2 mb-4 text-sm text-gray-600">{mod.description}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {mod.searchColumns?.length ? <input className={`${inputCls} max-w-xs`} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} /> : null}
        {statusOptions.length ? (
          <select className={`${inputCls} max-w-[200px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : null}
      </div>
      {q.isLoading ? <AdminPageSkeleton /> : null}
      {q.isError ? <AdminRetryBlock message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
      {q.data && q.data.items.length === 0 ? <Empty>Nothing here yet.{canCreate ? ` Use “New ${mod.singular}” to add one.` : ""}</Empty> : null}
      {q.data && q.data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                {mod.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {q.data.items.map((r) => {
                const id = String(r[mod.idColumn]);
                return (
                  <tr key={id} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(id)}>
                    {mod.columns.map((c) => <td key={c.key} className="max-w-[320px] truncate px-3 py-2 text-gray-800"><Cell value={r[c.key]} format={c.format} byId={byId} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.data.truncated ? <p className="mt-2 text-xs text-gray-500">Showing the first 500. Narrow with search or status.</p> : null}
        </div>
      ) : null}

      {open ? <RecordDialog mod={mod} id={open} onClose={() => setOpen(null)} /> : null}
      {creating ? (
        <AdminModal open onClose={() => setCreating(false)} title={`New ${mod.singular}`} description={mod.description} size="xl" footer={null}>
          <RecordForm mod={mod} item={null} users={users} onCancel={() => setCreating(false)} onSaved={(row) => { setCreating(false); setOpen(String(row[mod.idColumn])); }} />
        </AdminModal>
      ) : null}
    </AdminPanel>
  );
}
