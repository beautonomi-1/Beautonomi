import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SECURITY_COMPLIANCE, type GrcColumn, type GrcField } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";

export type Row = Record<string, unknown>;
export type DirectoryUser = { id: string; full_name: string | null; email: string | null; role: string };

export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
export const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

export function useGrcGate() {
  return useAdminSectionPage(ADMIN_SECTION_SECURITY_COMPLIANCE, "You do not have access to Security & Compliance.");
}

export function useGrcPermissions() {
  const s = useAdminSession();
  return { has: s.hasGrc, roles: s.grcRoles, userId: s.bootstrap?.userId ?? null };
}

export function useDirectory(enabled = true) {
  const q = useQuery({
    queryKey: ["grc", "directory"],
    queryFn: () => adminApi.getJson<{ users: DirectoryUser[] }>("/api/admin/grc/directory"),
    enabled,
    staleTime: 5 * 60_000,
  });
  const byId = useMemo(() => new Map((q.data?.users ?? []).map((u) => [u.id, u])), [q.data]);
  return { users: q.data?.users ?? [], byId };
}

export function userLabel(u: DirectoryUser | undefined, fallback?: unknown): string {
  if (!u) return fallback ? `${String(fallback).slice(0, 8)}…` : "—";
  return u.full_name || u.email || u.id.slice(0, 8);
}

export function grcAction<T = unknown>(name: string, body: Record<string, unknown>) {
  return adminApi.postJson<{ result: T }>(`/api/admin/grc/actions/${name}`, body);
}

/** Mutation that refreshes every GRC query on success, so counts and lists never go stale. */
export function useGrcMutation<V, R = unknown>(fn: (v: V) => Promise<R>, onSuccess?: (r: R) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["grc"] });
      onSuccess?.(r);
    },
  });
}

const BADGE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800", operating: "bg-emerald-100 text-emerald-800", implemented: "bg-emerald-50 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-800", accepted: "bg-emerald-100 text-emerald-800", published: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-700", completed: "bg-gray-100 text-gray-700", ready: "bg-emerald-100 text-emerald-800", keep: "bg-emerald-100 text-emerald-800",
  in_review: "bg-blue-100 text-blue-800", in_progress: "bg-blue-100 text-blue-800", treating: "bg-blue-100 text-blue-800", building: "bg-blue-100 text-blue-800",
  pending: "bg-amber-100 text-amber-800", draft: "bg-amber-100 text-amber-800", open: "bg-amber-100 text-amber-800", queued: "bg-amber-100 text-amber-800",
  submitted: "bg-amber-100 text-amber-800", warn: "bg-amber-100 text-amber-800", not_started: "bg-amber-50 text-amber-700", modify: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800", failed: "bg-red-100 text-red-800", fail: "bg-red-100 text-red-800", revoke: "bg-red-100 text-red-800",
  critical: "bg-red-600 text-white", high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-800", low: "bg-gray-100 text-gray-700", info: "bg-gray-50 text-gray-600",
  lapsed: "bg-gray-100 text-gray-600", superseded: "bg-gray-100 text-gray-600", risk_accepted: "bg-purple-100 text-purple-800", not_applicable: "bg-gray-100 text-gray-500",
};

export function Badge({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-gray-400">—</span>;
  const s = String(value);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[s] ?? "bg-gray-100 text-gray-700"}`}>{s.replace(/_/g, " ")}</span>;
}

export function fmtDate(v: unknown, withTime = false): string {
  if (!v) return "—";
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

export function Cell({ value, format, byId }: { value: unknown; format?: GrcColumn["format"]; byId: Map<string, DirectoryUser> }) {
  switch (format) {
    case "badge":
      return <Badge value={value} />;
    case "date":
      return <>{fmtDate(value)}</>;
    case "datetime":
      return <>{fmtDate(value, true)}</>;
    case "boolean":
      return value === true ? <span className="font-medium text-red-700">Yes</span> : <span className="text-gray-500">No</span>;
    case "user":
      return <>{value ? userLabel(byId.get(String(value)), value) : "—"}</>;
    case "score": {
      const n = Number(value);
      if (!value && value !== 0) return <span className="text-gray-400">—</span>;
      const cls = n >= 15 ? "bg-red-100 text-red-800" : n >= 8 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
      return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{n}</span>;
    }
    default:
      if (value == null || value === "") return <span className="text-gray-400">—</span>;
      return <>{typeof value === "object" ? JSON.stringify(value) : String(value)}</>;
  }
}

export function Field({ label, help, children, required }: { label: string; help?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {help ? <span className="mt-1 block text-xs text-gray-500">{help}</span> : null}
    </label>
  );
}

export function UserSelect({ value, onChange, users, disabled }: { value: string; onChange: (v: string) => void; users: DirectoryUser[]; disabled?: boolean }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">— Unassigned —</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {userLabel(u)}
          {u.email && u.full_name ? ` (${u.email})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Renders one config-driven field. Values are kept as strings/booleans in the form and sent as-is; the API validates. */
export function FieldInput({
  field, value, onChange, users, refOptions, disabled,
}: {
  field: GrcField;
  value: unknown;
  onChange: (v: unknown) => void;
  users: DirectoryUser[];
  refOptions?: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const str = value == null ? "" : String(value);
  switch (field.type) {
    case "textarea":
    case "markdown":
      return <textarea className={`${inputCls} min-h-[96px] ${field.type === "markdown" ? "font-mono" : ""}`} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={field.maxLength} />;
    case "number":
      return <input type="number" className={inputCls} value={str} min={field.min} max={field.max} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} disabled={disabled} />;
    case "date":
      return <input type="date" className={inputCls} value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "datetime": {
      const local = str ? toLocalInput(str) : "";
      return <input type="datetime-local" className={inputCls} value={local} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")} disabled={disabled} />;
    }
    case "boolean":
      return (
        <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={value === true} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      );
    case "select":
      return (
        <select className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">{field.required ? "Choose…" : "—"}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case "user":
      return <UserSelect value={str} onChange={onChange} users={users} disabled={disabled} />;
    case "ref":
      return (
        <select className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {(refOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    default:
      return <input type="text" className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={field.maxLength} />;
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function sha256File(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="text-sm text-red-700" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
