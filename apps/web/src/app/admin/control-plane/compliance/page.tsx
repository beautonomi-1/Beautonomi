"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher } from "@/lib/http/fetcher";
import { CompliancePurgeUserDialog } from "@/components/admin/CompliancePurgeUserDialog";
import { CompliancePurgeProviderDialog } from "@/components/admin/CompliancePurgeProviderDialog";

type PurgeAuditEntry = {
  id: string;
  created_at: string;
  purge_type: string | null;
  target_user_id: string | null;
  provider_id: string | null;
  reason: string | null;
};

export default function ControlPlaneCompliancePage() {
  const [entries, setEntries] = useState<PurgeAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditErr, setAuditErr] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditErr(null);
    try {
      const res = (await fetcher.get("/api/admin/compliance/purge-audit?limit=50")) as {
        data?: { entries?: PurgeAuditEntry[] };
      };
      setEntries(Array.isArray(res.data?.entries) ? res.data!.entries! : []);
    } catch (e) {
      setAuditErr(e instanceof Error ? e.message : "Failed to load audit log");
      setEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const [userIdInput, setUserIdInput] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userLoadBusy, setUserLoadBusy] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const loadUser = async () => {
    const id = userIdInput.trim();
    if (!id) return;
    setUserLoadBusy(true);
    try {
      const res = (await fetcher.get(`/api/admin/users/${encodeURIComponent(id)}`)) as {
        data?: { email?: string | null };
      };
      setUserEmail(res.data?.email?.trim() ?? "");
    } catch {
      setUserEmail("");
    } finally {
      setUserLoadBusy(false);
    }
  };

  const [providerIdInput, setProviderIdInput] = useState("");
  const [providerBizEmail, setProviderBizEmail] = useState("");
  const [providerOwnerEmail, setProviderOwnerEmail] = useState("");
  const [providerLoadBusy, setProviderLoadBusy] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);

  const loadProvider = async () => {
    const id = providerIdInput.trim();
    if (!id) return;
    setProviderLoadBusy(true);
    try {
      const res = (await fetcher.get(`/api/admin/providers/${encodeURIComponent(id)}`)) as {
        data?: { email?: string | null; owner?: { email?: string | null } | null };
      };
      const d = res.data;
      setProviderBizEmail(d?.email?.trim() ?? "");
      setProviderOwnerEmail(d?.owner?.email?.trim() ?? "");
    } catch {
      setProviderBizEmail("");
      setProviderOwnerEmail("");
    } finally {
      setProviderLoadBusy(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Compliance purge</h1>
          <p className="text-muted-foreground">
            Superadmin-only erasure with immutable audit logging. The Vite admin SPA exposes the same route for
            operators on the standalone shell; this Next.js page keeps parity for legacy embedded admin.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent purge audit</CardTitle>
            <CardDescription>Read-only log from GET /api/admin/compliance/purge-audit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadAudit()} disabled={auditLoading}>
                {auditLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            {auditErr ? <p className="text-sm text-destructive">{auditErr}</p> : null}
            {!auditErr && entries.length === 0 && !auditLoading ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : null}
            {entries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-2">When</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Target</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row) => (
                      <tr key={row.id} className="border-b border-muted">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString(undefined, { hour12: false })}
                        </td>
                        <td className="py-2 pr-2 capitalize">{row.purge_type ?? "—"}</td>
                        <td className="py-2 pr-2 font-mono text-xs">
                          {row.target_user_id ? (
                            <Link className="underline" href={`/admin/users/${row.target_user_id}`}>
                              user…
                            </Link>
                          ) : null}{" "}
                          {row.provider_id ? (
                            <Link className="underline" href={`/admin/providers/${row.provider_id}`}>
                              provider…
                            </Link>
                          ) : null}
                        </td>
                        <td className="max-w-xs truncate py-2 text-muted-foreground">{row.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Purge platform user</CardTitle>
            <CardDescription>Load the account, then open the confirmation dialog.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">User id</label>
              <Input
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                className="font-mono text-sm"
                placeholder="UUID"
              />
            </div>
            <Button type="button" variant="secondary" disabled={userLoadBusy} onClick={() => void loadUser()}>
              {userLoadBusy ? "Loading…" : "Load"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!userIdInput.trim() || !userEmail}
              onClick={() => setUserDialogOpen(true)}
            >
              Open purge dialog
            </Button>
            {userEmail ? <p className="w-full text-sm text-muted-foreground">Email on file: {userEmail}</p> : null}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Purge provider organization</CardTitle>
            <CardDescription>Load provider emails, then open the confirmation dialog.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Provider id</label>
              <Input
                value={providerIdInput}
                onChange={(e) => setProviderIdInput(e.target.value)}
                className="font-mono text-sm"
                placeholder="UUID"
              />
            </div>
            <Button type="button" variant="secondary" disabled={providerLoadBusy} onClick={() => void loadProvider()}>
              {providerLoadBusy ? "Loading…" : "Load"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!providerIdInput.trim() || (!providerBizEmail && !providerOwnerEmail)}
              onClick={() => setProviderDialogOpen(true)}
            >
              Open purge dialog
            </Button>
            {(providerBizEmail || providerOwnerEmail) && (
              <p className="w-full text-sm text-muted-foreground">
                Business: {providerBizEmail || "—"} · Owner: {providerOwnerEmail || "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <CompliancePurgeUserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        userId={userIdInput.trim()}
        userEmail={userEmail}
        onComplete={() => void loadAudit()}
      />
      <CompliancePurgeProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        providerId={providerIdInput.trim()}
        providerEmail={providerBizEmail}
        ownerEmail={providerOwnerEmail}
        onComplete={() => void loadAudit()}
      />
    </RoleGuard>
  );
}
