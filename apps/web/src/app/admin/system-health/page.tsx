"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, Database, Server, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RoleGuard from "@/components/auth/RoleGuard";

interface SystemStats {
  api_requests: {
    total: number;
    successful: number;
    failed: number;
    avg_response_time: number;
  };
  database: {
    connections: number;
    query_time: number;
    slow_queries: number;
  };
  server: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
  };
  errors: {
    total: number;
    rate: number;
  };
}

interface HealthMetric {
  id: string;
  metric_type: string;
  metric_name: string;
  value: number;
  unit: string;
  status: string;
  recorded_at: string;
}

export default function SystemHealthPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadHealthData();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadHealthData();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadHealthData = async () => {
    try {
      setIsLoading(true);
      const [healthResponse, errorsResponse] = await Promise.all([
        fetcher.get<{ data: any }>("/api/admin/monitoring/health?hours=24"),
        fetcher.get<{ data: any }>("/api/admin/monitoring/errors?timeframe=24h"),
      ]);

      const healthData = healthResponse.data;
      const errorsData = errorsResponse.data;

      // Transform health data to match existing interface
      setStats({
        api_requests: {
          total: healthData.total_endpoints || 0,
          successful: healthData.healthy_endpoints || 0,
          failed: healthData.down_endpoints || 0,
          avg_response_time: healthData.average_response_time_ms || 0,
        },
        database: {
          connections: 0, // Not tracked yet
          query_time: 0,
          slow_queries: 0,
        },
        server: {
          cpu_usage: 0, // Not tracked yet
          memory_usage: 0,
          disk_usage: 0,
        },
        errors: {
          total: errorsData.stats?.total || 0,
          rate: 0,
        },
      });

      // Transform endpoints to metrics
      const metrics: HealthMetric[] = (healthData.endpoints || []).map((endpoint: any) => ({
        id: `${endpoint.endpoint}-${endpoint.method}`,
        metric_type: "api_endpoint",
        metric_name: `${endpoint.method} ${endpoint.endpoint}`,
        value: endpoint.average_response_time_ms,
        unit: "ms",
        status: endpoint.last_status,
        recorded_at: endpoint.last_check,
      }));

      setMetrics(metrics);
      setLastUpdated(new Date());
      setError(null);
    } catch (error) {
      console.error("Failed to load system health:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load system health data";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return "bg-green-100 text-green-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      case "error":
      case "critical":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return <CheckCircle2 className="w-4 h-4" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "error":
      case "critical":
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (isLoading && !stats) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading system health..." />
        </div>
      </RoleGuard>
    );
  }

  if (error && !stats) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load system health data"
            description={error}
            action={{
              label: "Retry",
            onClick: loadHealthData,
          }}
        />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">System Health & Monitoring</h1>
            <p className="text-gray-600 mt-1">Real-time system metrics and performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              Auto-refresh: {autoRefresh ? "ON" : "OFF"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHealthData}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {lastUpdated && (
          <div className="mb-4 text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleString()}
          </div>
        )}

        {stats && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="api">API Performance</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="server">Server</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">API Requests</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.api_requests.total}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-green-100 text-green-800">
                        {stats.api_requests.successful} success
                      </Badge>
                      <Badge className="bg-red-100 text-red-800">
                        {stats.api_requests.failed} failed
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Avg response: {stats.api_requests.avg_response_time.toFixed(2)}ms
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Database</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.database.connections}</div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Connections active
                    </p>
                    {stats.database.slow_queries > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800 mt-2">
                        {stats.database.slow_queries} slow queries
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Server</CardTitle>
                    <Server className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm">
                          <span>CPU</span>
                          <span>{stats.server.cpu_usage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              stats.server.cpu_usage > 80
                                ? "bg-red-500"
                                : stats.server.cpu_usage > 60
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(stats.server.cpu_usage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm">
                          <span>Memory</span>
                          <span>{stats.server.memory_usage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              stats.server.memory_usage > 80
                                ? "bg-red-500"
                                : stats.server.memory_usage > 60
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(stats.server.memory_usage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Errors</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.errors.total}</div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {stats.errors.rate.toFixed(2)} errors/hour
                    </p>
                    {stats.errors.total > 0 && (
                      <Badge className="bg-red-100 text-red-800 mt-2">
                        Action required
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="api" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>API Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Total Requests (24h)</span>
                      <span className="font-bold">{stats.api_requests.total}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Successful</span>
                      <Badge className="bg-green-100 text-green-800">
                        {stats.api_requests.successful}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Failed</span>
                      <Badge className="bg-red-100 text-red-800">
                        {stats.api_requests.failed}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Average Response Time</span>
                      <span className="font-bold">
                        {stats.api_requests.avg_response_time.toFixed(2)}ms
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Success Rate</span>
                      <span className="font-bold">
                        {stats.api_requests.total > 0
                          ? ((stats.api_requests.successful / stats.api_requests.total) * 100).toFixed(2)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="database" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Database Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Active Connections</span>
                      <span className="font-bold">{stats.database.connections}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Average Query Time</span>
                      <span className="font-bold">{stats.database.query_time.toFixed(2)}ms</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Slow Queries</span>
                      <Badge
                        className={
                          stats.database.slow_queries > 0
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }
                      >
                        {stats.database.slow_queries}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="server" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Server Resources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>CPU Usage</span>
                        <span className="font-bold">{stats.server.cpu_usage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            stats.server.cpu_usage > 80
                              ? "bg-red-500"
                              : stats.server.cpu_usage > 60
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(stats.server.cpu_usage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Memory Usage</span>
                        <span className="font-bold">{stats.server.memory_usage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            stats.server.memory_usage > 80
                              ? "bg-red-500"
                              : stats.server.memory_usage > 60
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(stats.server.memory_usage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Disk Usage</span>
                        <span className="font-bold">{stats.server.disk_usage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            stats.server.disk_usage > 80
                              ? "bg-red-500"
                              : stats.server.disk_usage > 60
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(stats.server.disk_usage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Error Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Total Errors (24h)</span>
                      <Badge
                        className={
                          stats.errors.total > 0
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }
                      >
                        {stats.errors.total}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Error Rate</span>
                      <span className="font-bold">{stats.errors.rate.toFixed(2)} errors/hour</span>
                    </div>
                    {stats.errors.total > 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          ⚠️ There are errors in the system. Please review the error logs.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {metrics.filter((m) => m.metric_type === "error").length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Errors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {metrics
                        .filter((m) => m.metric_type === "error")
                        .slice(0, 10)
                        .map((metric) => (
                          <div
                            key={metric.id}
                            className="flex items-center justify-between p-2 border rounded"
                          >
                            <div className="flex items-center gap-2">
                              {getStatusIcon(metric.status)}
                              <span className="text-sm">{metric.metric_name}</span>
                            </div>
                            <Badge className={getStatusColor(metric.status)}>
                              {metric.status}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </RoleGuard>
  );
}
