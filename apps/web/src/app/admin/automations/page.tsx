"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  Users,
  MessageSquare,
  DollarSign,
  Search,
  Filter,
  Eye,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { format } from "date-fns";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";

interface AutomationStats {
  total_automations: number;
  active_automations: number;
  total_executions: number;
  executions_today: number;
  executions_this_month: number;
  providers_with_automations: number;
  revenue_from_automations: number; // Revenue from subscriptions that include automations
  avg_automations_per_provider: number;
}

interface Automation {
  id: string;
  name: string;
  provider_id: string;
  provider_name: string;
  trigger_type: string;
  action_type: string;
  is_active: boolean;
  is_template: boolean;
  created_at: string;
  execution_count: number;
  last_executed_at: string | null;
}

export default function AdminAutomationsPage() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAutomations, setIsLoadingAutomations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    loadStats();
    loadAutomations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only load

  const loadStats = async () => {
    try {
      const response = await fetcher.get<{ data: AutomationStats }>(
        "/api/admin/automations/stats"
      );
      setStats(response.data);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const loadAutomations = async () => {
    try {
      setIsLoadingAutomations(true);
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("type", filterType);
      const query = params.toString();
      const response = await fetcher.get<{ data: Automation[] }>(
        `/api/admin/automations${query ? `?${query}` : ""}`
      );
      setAutomations(response.data || []);
      setError(null);
    } catch (error) {
      console.error("Failed to load automations:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load automations";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoadingAutomations(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAutomations();
  }, [searchQuery, filterStatus, filterType]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  const filteredAutomations = automations.filter((auto) => {
    if (filterStatus === "active" && !auto.is_active) return false;
    if (filterStatus === "inactive" && auto.is_active) return false;
    if (filterStatus === "templates" && !auto.is_template) return false;
    return true;
  });

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      {isLoading && (
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading automations..." />
        </div>
      )}
      {error && !isLoading && (
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load automations"
            description={error}
            action={{
              label: "Retry",
              onClick: loadAutomations,
            }}
          />
        </div>
      )}
      {!isLoading && !error && (
    <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Marketing Automations</h1>
          <p className="text-gray-600">
            Monitor and manage marketing automations across all providers
          </p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Automations
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_automations}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.active_automations} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Executions
                </CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.total_executions.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.executions_this_month.toLocaleString()} this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Providers Using
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.providers_with_automations}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg {stats.avg_automations_per_provider.toFixed(1)} per provider
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Revenue Impact
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${stats.revenue_from_automations.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  From automation-enabled plans
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>All Automations</CardTitle>
            <CardDescription>
              View and manage automations across all providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by name, provider..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="templates">Templates</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="reminder">Reminders</SelectItem>
                  <SelectItem value="update">Updates</SelectItem>
                  <SelectItem value="booking">Bookings</SelectItem>
                  <SelectItem value="milestone">Milestones</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoadingAutomations ? (
              <div className="py-8 text-center">Loading automations...</div>
            ) : filteredAutomations.length === 0 ? (
              <EmptyState
                title="No automations found"
                description="No automations match your filters"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Executions</TableHead>
                    <TableHead>Last Executed</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAutomations.map((automation) => (
                    <TableRow key={automation.id}>
                      <TableCell className="font-medium">
                        {automation.name}
                        {automation.is_template && (
                          <Badge variant="outline" className="ml-2">
                            Template
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/providers/${automation.provider_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {automation.provider_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {automation.trigger_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={automation.is_active ? "default" : "secondary"}
                        >
                          {automation.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{automation.execution_count || 0}</TableCell>
                      <TableCell>
                        {automation.last_executed_at
                          ? format(
                              new Date(automation.last_executed_at),
                              "MMM d, yyyy"
                            )
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(automation.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/providers/${automation.provider_id}?tab=automations`}
                        >
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </RoleGuard>
  );
}
