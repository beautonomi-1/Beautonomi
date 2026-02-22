"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Radio, Download } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
  actor?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter, entityTypeFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  // Real-time subscription for new audit logs
  useEffect(() => {
    if (!isRealtimeEnabled) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("audit-logs-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
        },
        async (payload: any) => {
          // Fetch actor details for the new log
          try {
            const { data: actor } = await supabase
              .from("users")
              .select("id, full_name, email")
              .eq("id", payload.new.actor_user_id)
              .single();

            const newLog: AuditLog = {
              ...payload.new,
              actor: actor ? {
                id: actor.id,
                full_name: actor.full_name,
                email: actor.email,
              } : undefined,
            };

            // Add new log to the beginning of the list
            setLogs((prev) => [newLog, ...prev.slice(0, 49)]); // Keep max 50 logs
            setTotal((prev) => prev + 1);
            toast.info("New audit log received", { duration: 2000 });
          } catch (error) {
            console.error("Error fetching actor for new log:", error);
            // Still add the log without actor details
            setLogs((prev) => [payload.new, ...prev.slice(0, 49)]);
            setTotal((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
      }
    };
  }, [isRealtimeEnabled]);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (actionFilter) params.set("action", actionFilter);
      if (entityTypeFilter) params.set("entity_type", entityTypeFilter);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      params.set("page", page.toString());
      params.set("limit", "50");

      const response = await fetcher.get<{
        data: AuditLog[];
        error: null;
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/audit-logs?${params.toString()}`);

      setLogs(response.data || []);
      if (response.meta) {
        setTotal(response.meta.total);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load audit logs";
      setError(errorMessage);
      console.error("Error loading audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading audit logs..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Audit Logs</h1>
            <p className="text-gray-600">Track all administrative actions</p>
          </div>
          <div className="flex items-center gap-2">
            {isRealtimeEnabled && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Radio className="w-3 h-3 mr-1 animate-pulse" />
                Live
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRealtimeEnabled(!isRealtimeEnabled)}
            >
              {isRealtimeEnabled ? "Disable" : "Enable"} Real-time
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (actionFilter) params.set("action", actionFilter);
                  if (entityTypeFilter) params.set("entity_type", entityTypeFilter);
                  if (startDate) params.set("start_date", startDate);
                  if (endDate) params.set("end_date", endDate);
                  
                  const response = await fetch(`/api/admin/export/audit-logs?${params.toString()}`);
                  if (!response.ok) throw new Error("Export failed");
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `audit-logs-export-${new Date().toISOString().split("T")[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  toast.success("Export downloaded");
                } catch {
                  toast.error("Failed to export audit logs");
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search actions or entity types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Actions</option>
                <option value="admin.refund">Admin Refund</option>
                <option value="admin.dispute.resolve">Dispute Resolve</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Entity Type</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => {
                  setEntityTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Types</option>
                <option value="booking">Booking</option>
                <option value="payment_transaction">Payment Transaction</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        {error ? (
          <EmptyState
            title="Failed to load audit logs"
            description={error}
            action={{ label: "Retry", onClick: loadLogs }}
          />
        ) : logs.length === 0 ? (
          <EmptyState title="No audit logs found" description="No logs match your filters" />
        ) : (
          <>
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Entity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Metadata
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {log.actor?.full_name || log.actor?.email || log.actor_user_id || "Unknown"}
                          </div>
                          {log.actor_role && (
                            <div className="text-xs text-gray-500">{log.actor_role}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline" className="capitalize">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="capitalize">{log.entity_type || "—"}</div>
                          <div className="text-xs text-gray-500">{log.entity_id ? `${log.entity_id.slice(0, 8)}...` : "—"}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <pre className="text-xs bg-gray-50 p-2 rounded max-w-md overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total} logs
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={total <= page * 50}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
