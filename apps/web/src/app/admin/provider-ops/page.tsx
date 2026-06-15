"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Radio,
  AlertTriangle,
  TrendingUp,
  Users,
  ClipboardList,
  UserPlus,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardData {
  urgent: {
    stalled_signups: number;
    dropped_off: number;
    pending_approval: number;
    duplicate_groups?: number;
    duplicate_leads?: number;
  };
  kpis: {
    signups_today: number;
    signups_this_week: number;
    leads_this_week: number;
    active_providers: number;
    total_leads: number;
    draft_providers?: number;
  };
  pipeline: Record<string, number>;
  recent_activities: Array<{
    id: string;
    activity_type: string;
    description: string;
    created_at: string;
  }>;
}

export default function ProviderOpsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetcher.get<{ data: DashboardData }>(
          "/api/admin/provider-ops/dashboard"
        );
        setData(res.data);
      } catch (err) {
        if (err instanceof FetchTimeoutError) setError("Request timed out");
        else if (err instanceof FetchError) setError(err.message);
        else setError("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading Provider Ops dashboard..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-zinc-500">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
          <p className="text-lg font-medium text-zinc-700">
            Failed to load dashboard
          </p>
          <p className="text-sm text-zinc-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const duplicateGroups = data.urgent.duplicate_groups ?? 0;
  const duplicateLeads = data.urgent.duplicate_leads ?? 0;
  const urgentTotal =
    data.urgent.stalled_signups +
    data.urgent.dropped_off +
    data.urgent.pending_approval +
    duplicateGroups;

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <Radio className="h-6 w-6 text-blue-600" />
              Provider Ops Hub
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Supply operations overview — who needs help right now
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/provider-ops/leads/new">
              <Button size="sm" variant="outline">
                <UserPlus className="h-4 w-4 mr-1" />
                Add Lead
              </Button>
            </Link>
            <Link href="/admin/provider-ops/tracker">
              <Button size="sm">
                <ClipboardList className="h-4 w-4 mr-1" />
                Tracker
              </Button>
            </Link>
          </div>
        </div>

        {/* Urgent Attention Row */}
        {urgentTotal > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <UrgentCard
              label="Stalled Signups"
              count={data.urgent.stalled_signups}
              color="red"
              href="/admin/provider-ops/tracker?status=stalled"
              description="No progress for 24+ hours"
            />
            <UrgentCard
              label="Dropped Off"
              count={data.urgent.dropped_off}
              color="red"
              href="/admin/provider-ops/tracker?status=dropped_off"
              description="No progress for 7+ days"
            />
            <UrgentCard
              label="Pending Approval"
              count={data.urgent.pending_approval}
              color="yellow"
              href="/admin/provider-ops/activation"
              description="Ready for review"
            />
            {duplicateGroups > 0 && (
              <UrgentCard
                label="Possible Duplicates"
                count={duplicateGroups}
                color="yellow"
                href="/admin/provider-ops/duplicates"
                description={`${duplicateLeads} lead${duplicateLeads === 1 ? "" : "s"} to review & merge`}
              />
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            label="Signups Today"
            value={data.kpis.signups_today}
            icon={TrendingUp}
          />
          <KpiCard
            label="Signups This Week"
            value={data.kpis.signups_this_week}
            icon={Users}
          />
          <KpiCard
            label="Leads This Week"
            value={data.kpis.leads_this_week}
            icon={UserPlus}
          />
          <KpiCard
            label="Active Providers"
            value={data.kpis.active_providers}
            icon={CheckCircle2}
          />
          <KpiCard
            label="Total Leads"
            value={data.kpis.total_leads}
            icon={Users}
          />
          <KpiCard
            label="Draft Profiles"
            value={data.kpis.draft_providers ?? 0}
            icon={ClipboardList}
          />
        </div>

        {/* Pipeline + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline Funnel */}
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900">
                Lead Pipeline
              </h2>
              <Link
                href="/admin/provider-ops/pipeline"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                View board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {Object.entries(data.pipeline).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StageDot stage={stage} />
                    <span className="text-sm text-zinc-700 capitalize">
                      {stage.replace(/_/g, " ")}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="bg-white border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              Recent Activity
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.recent_activities.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4 text-center">
                  No recent activity
                </p>
              ) : (
                data.recent_activities.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 border-b pb-3 last:border-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-700 truncate">
                        {a.description || a.activity_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {new Date(a.created_at).toLocaleDateString()} ·{" "}
                        {new Date(a.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UrgentCard({
  label,
  count,
  color,
  href,
  description,
}: {
  label: string;
  count: number;
  color: "red" | "yellow";
  href: string;
  description: string;
}) {
  const bg = color === "red" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const text = color === "red" ? "text-red-700" : "text-amber-700";
  const countColor = color === "red" ? "text-red-600" : "text-amber-600";

  return (
    <Link href={href}>
      <div
        className={`${bg} border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${text}`}>{label}</span>
          <AlertTriangle
            className={`h-4 w-4 ${color === "red" ? "text-red-400" : "text-amber-400"}`}
          />
        </div>
        <p className={`text-3xl font-bold ${countColor} mt-1`}>{count}</p>
        <p className="text-xs text-zinc-500 mt-1">{description}</p>
      </div>
    </Link>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-zinc-400" />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function StageDot({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-400",
    contacted: "bg-cyan-400",
    qualified: "bg-emerald-400",
    proposal_sent: "bg-violet-400",
    negotiating: "bg-purple-400",
    won: "bg-green-500",
    lost: "bg-red-400",
    nurture: "bg-amber-400",
    matched: "bg-teal-500",
  };
  return (
    <div
      className={`w-3 h-3 rounded-full ${colors[stage] || "bg-zinc-300"}`}
    />
  );
}
