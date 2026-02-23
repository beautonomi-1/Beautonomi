"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

interface LogEntry {
  id: string;
  changed_by: string | null;
  area: string;
  record_key: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export default function ConfigChangeLogPage() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [area, setArea] = useState<string>("");
  const [recordKey, setRecordKey] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (area) params.set("area", area);
        if (recordKey) params.set("record_key", recordKey);
        const res = await fetcher.get<{ data: { items: LogEntry[]; total: number } }>(
          `/api/admin/control-plane/config-change-log?${params}`
        );
        setItems(res.data?.items ?? []);
        setTotal(res.data?.total ?? 0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, limit, area, recordKey]);

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Config Change Log</h1>
          <p className="text-muted-foreground">Audit trail for flags, integrations, and module changes.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label>Area</Label>
          <Select value={area || "all"} onValueChange={(v) => setArea(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="flags">flags</SelectItem>
              <SelectItem value="integration">integration</SelectItem>
              <SelectItem value="module">module</SelectItem>
              <SelectItem value="ai_template">ai_template</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Record key</Label>
          <Input
            placeholder="e.g. gemini.production"
            value={recordKey}
            onChange={(e) => setRecordKey(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
          <CardDescription>Total: {total}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">No entries.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((entry) => (
                <li key={entry.id} className="border rounded p-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{entry.area} · {entry.record_key}</span>
                    <span>{new Date(entry.created_at).toISOString()}</span>
                  </div>
                  <div className="grid gap-2 mt-2 md:grid-cols-2">
                    <div>
                      <p className="font-medium">Before</p>
                      <pre className="bg-muted p-2 rounded overflow-auto max-h-24 text-xs">{JSON.stringify(entry.before_state, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="font-medium">After</p>
                      <pre className="bg-muted p-2 rounded overflow-auto max-h-24 text-xs">{JSON.stringify(entry.after_state, null, 2)}</pre>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {total > limit && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </RoleGuard>
  );
}
