"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { format } from "date-fns";
import RoleGuard from "@/components/auth/RoleGuard";

interface SystemHealth {
  overall_status: "healthy" | "degraded" | "down";
  total_endpoints: number;
  healthy_endpoints: number;
  degraded_endpoints: number;
  down_endpoints: number;
  average_response_time_ms: number;
  endpoints: Array<{
    endpoint: string;
    method: string;
    average_response_time_ms: number;
    success_rate: number;
    total_checks: number;
    last_check: string;
    last_status: "healthy" | "degraded" | "down";
  }>;
}

interface ErrorStats {
  total: number;
  by_severity: Record<string, number>;
  by_endpoint: Array<{ endpoint: string; count: number }>;
  recent_errors: Array<{
    id: string;
    error_type: string;
    error_message: string;
    endpoint?: string;
    method?: string;
    status_code?: number;
    severity: "low" | "medium" | "high" | "critical";
    created_at: string;
  }>;
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [errorStats, setErrorStats] = useState<ErrorStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeframe] = useState<"24h" | "7d" | "30d">("24h");

  useEffect(() => {
    loadData();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadData();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount and when options change

  const emptyErrorStats: ErrorStats = {
    total: 0,
    by_severity: {},
    by_endpoint: [],
    recent_errors: [],
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [healthResult, errorsResult] = await Promise.allSettled([
        fetcher.get<{ data: SystemHealth }>("/api/admin/monitoring/health?hours=24"),
        fetcher.get<{ data: { stats: ErrorStats; logs: unknown[] } }>(
          `/api/admin/monitoring/errors?timeframe=${timeframe}`
        ),
      ]);

      const health =
        healthResult.status === "fulfilled" && healthResult.value?.data != null
          ? healthResult.value.data
          : null;
      const stats =
        errorsResult.status === "fulfilled" && errorsResult.value?.data?.stats != null
          ? errorsResult.value.data.stats
          : emptyErrorStats;

      setHealth(health);
      setErrorStats(stats);

      if (healthResult.status === "rejected" && errorsResult.status === "rejected") {
        const msg =
          healthResult.reason instanceof Error
            ? healthResult.reason.message
            : "Failed to load monitoring data";
        setError(msg);
        toast.error(msg);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to load monitoring data";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-800 border-green-200";
      case "degraded":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "down":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading monitoring data..." />
        </div>
      </RoleGuard>
    );
  }

  if (error) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
          title="Failed to load monitoring data"
          description={error}
          action={{
            label: "Retry",
            onClick: loadData,
          }}
        />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">System Monitoring</h1>
            <p className="text-gray-600">Real-time API health and error tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
              Auto-refresh {autoRefresh ? "ON" : "OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Now
            </Button>
          </div>
        </div>

        <Tabs defaultValue="health" className="space-y-4">
          <TabsList>
            <TabsTrigger value="health">API Health</TabsTrigger>
            <TabsTrigger value="errors">Error Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="space-y-4">
            {!health ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-muted-foreground text-center">
                    No health data available. Health checks may not be configured or the API failed to load.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Overall Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Overall System Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <Badge className={getStatusColor(health.overall_status)}>
                        {health.overall_status.toUpperCase()}
                      </Badge>
                      <div className="flex items-center gap-6">
                        <div>
                          <p className="text-sm text-gray-600">Total Endpoints</p>
                          <p className="text-2xl font-semibold">{health.total_endpoints}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Healthy</p>
                          <p className="text-2xl font-semibold text-green-600">
                            {health.healthy_endpoints}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Degraded</p>
                          <p className="text-2xl font-semibold text-yellow-600">
                            {health.degraded_endpoints}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Down</p>
                          <p className="text-2xl font-semibold text-red-600">
                            {health.down_endpoints}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Avg Response Time</p>
                          <p className="text-2xl font-semibold">
                            {health.average_response_time_ms}ms
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Endpoints Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Endpoint Health</CardTitle>
                    <CardDescription>Last 24 hours</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Avg Response Time</TableHead>
                          <TableHead>Success Rate</TableHead>
                          <TableHead>Total Checks</TableHead>
                          <TableHead>Last Check</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {health.endpoints.map((endpoint) => (
                          <TableRow key={`${endpoint.endpoint}-${endpoint.method}`}>
                            <TableCell className="font-mono text-sm">
                              {endpoint.endpoint}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{endpoint.method}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(endpoint.last_status)}>
                                {endpoint.last_status}
                              </Badge>
                            </TableCell>
                            <TableCell>{endpoint.average_response_time_ms}ms</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      endpoint.success_rate >= 95
                                        ? "bg-green-500"
                                        : endpoint.success_rate >= 80
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                    }`}
                                    style={{ width: `${endpoint.success_rate}%` }}
                                  />
                                </div>
                                <span className="text-sm">{endpoint.success_rate.toFixed(1)}%</span>
                              </div>
                            </TableCell>
                            <TableCell>{endpoint.total_checks}</TableCell>
                            <TableCell>
                              {format(new Date(endpoint.last_check), "MMM d, HH:mm:ss")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            {errorStats && (
              <>
                {/* Error Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">{errorStats.total}</p>
                    </CardContent>
                  </Card>
                  {Object.entries(errorStats.by_severity).map(([severity, count]) => (
                    <Card key={severity}>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium capitalize">{severity}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-semibold">{count}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Top Error Endpoints */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Error Endpoints</CardTitle>
                    <CardDescription>Endpoints with most errors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Error Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorStats.by_endpoint.map((item) => (
                          <TableRow key={item.endpoint}>
                            <TableCell className="font-mono text-sm">{item.endpoint}</TableCell>
                            <TableCell>{item.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Recent Errors */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Errors</CardTitle>
                    <CardDescription>Latest error occurrences</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Status Code</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorStats.recent_errors.map((error) => (
                          <TableRow key={error.id}>
                            <TableCell>
                              {format(new Date(error.created_at), "MMM d, HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              <Badge className={getSeverityColor(error.severity)}>
                                {error.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{error.error_type}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {error.endpoint || "N/A"}
                            </TableCell>
                            <TableCell className="max-w-md truncate">{error.error_message}</TableCell>
                            <TableCell>{error.status_code || "N/A"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
