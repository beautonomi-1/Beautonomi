"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

type SafetyEvent = {
  id: string;
  user_id: string;
  booking_id: string | null;
  event_type: string;
  status: string;
  aura_request_id: string | null;
  created_at: string;
};

export default function SafetyLogsPage() {
  const [eventType, setEventType] = useState<string>("");
  const [data, setData] = useState<{ data: SafetyEvent[]; total: number; limit: number; offset: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (eventType) params.set("event_type", eventType);
        const res = await fetcher.get<{ data: { data: SafetyEvent[]; total: number; limit: number; offset: number } }>(`/api/admin/safety/logs?${params}`);
        setData(res.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventType]);

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Safety Logs</h1>
          <p className="text-muted-foreground">Panic, check-in, and escalation events (Aura).</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Label>Event type</Label>
        <Select value={eventType || "all"} onValueChange={(v) => setEventType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="panic">Panic</SelectItem>
            <SelectItem value="check_in">Check-in</SelectItem>
            <SelectItem value="escalation">Escalation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Total: {data.total}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Time</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">User ID</th>
                    <th className="text-left py-2">Booking ID</th>
                    <th className="text-left py-2">Aura ID</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.data || []).map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="py-2">{new Date(e.created_at).toISOString()}</td>
                      <td>{e.event_type}</td>
                      <td>{e.status}</td>
                      <td className="font-mono text-xs">{e.user_id?.slice(0, 8)}…</td>
                      <td className="font-mono text-xs">{e.booking_id ? `${e.booking_id.slice(0, 8)}…` : "—"}</td>
                      <td className="font-mono text-xs">{e.aura_request_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!data.data || data.data.length === 0) && <p className="text-muted-foreground py-4">No events.</p>}
          </CardContent>
        </Card>
      ) : (
        <p className="text-destructive">Failed to load logs.</p>
      )}
    </div>
    </RoleGuard>
  );
}
