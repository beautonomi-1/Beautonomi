"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, Download } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import { MAINTENANCE_SCOPES } from "@/lib/maintenance-types";

interface SignUpRow {
  id: string;
  email: string;
  scope: string;
  created_at: string;
}

export default function MaintenanceSignUpsPage() {
  const [scope, setScope] = useState<string>("all");
  const [list, setList] = useState<SignUpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (scope !== "all") params.set("scope", scope);
    params.set("limit", "500");
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: SignUpRow[] }>(`/api/admin/maintenance-notify?${params}`);
        setList(res.data ?? []);
      } catch {
        toast.error("Failed to load sign-ups");
        setList([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [scope]);

  const exportCsv = () => {
    const headers = ["email", "scope", "created_at"];
    const rows = list.map((r) => [r.email, r.scope, r.created_at].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-notify-${scope === "all" ? "all" : scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/admin/control-plane/maintenance">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Maintenance notify sign-ups</h1>
            <p className="text-muted-foreground">Emails collected from the maintenance page &quot;Notify me&quot; CTA.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Sign-ups</CardTitle>
                <CardDescription>Filter by scope and export CSV.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All scopes</SelectItem>
                    {MAINTENANCE_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-muted-foreground">No sign-ups yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Email</th>
                      <th className="text-left py-2 font-medium">Scope</th>
                      <th className="text-left py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2">{r.email}</td>
                        <td className="py-2">{r.scope}</td>
                        <td className="py-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
