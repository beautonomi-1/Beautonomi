"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardList,
  ArrowLeft,
  Phone,
  Mail,
  Search,
  Eye,
  Wrench,
  Clock,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const STEP_NAMES: Record<number, string> = {
  1: "Team Size",
  2: "Identity + OTP",
  3: "Business Details",
  4: "Payment Setup",
  5: "Current Software",
  6: "Payroll",
  7: "Location",
  8: "Photos",
  9: "Service Zones",
  10: "Categories",
  11: "Services",
  12: "Operating Hours",
  13: "Review",
  14: "Plan Selection",
};

interface TrackerRow {
  user_id: string;
  draft_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  signup_date: string;
  current_step: number;
  current_step_name: string;
  last_activity: string;
  stall_status: "active" | "slowing" | "stalled" | "dropped_off" | "completed";
  has_provider: boolean;
  provider_id: string | null;
  provider_status: string | null;
  provider_business_name: string | null;
  draft_summary: {
    business_name: string | null;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    team_size: string | null;
    business_type: string | null;
    has_address: boolean;
    has_thumbnail: boolean;
    has_services: boolean;
    category_count: number;
    has_operating_hours: boolean;
    selected_plan_id: string | null;
  };
  assigned_to: string | null;
  admin_assisted: boolean;
  tracking_id: string | null;
}

interface TrackerStats {
  in_progress: number;
  stalled: number;
  dropped_off: number;
  active_in_wizard: number;
  by_step: Record<number, number>;
  pending_approval: number;
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "slowing", label: "Slowing" },
  { key: "stalled", label: "Stalled" },
  { key: "dropped_off", label: "Dropped Off" },
  { key: "completed", label: "Completed" },
] as const;

export default function OnboardingTrackerPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [trackerRes, statsRes] = await Promise.all([
        fetcher.get<{ data: TrackerRow[] }>(
          "/api/admin/provider-ops/tracker",
          { staleTimeMs: 0 }
        ),
        fetcher.get<{ data: TrackerStats }>(
          "/api/admin/provider-ops/tracker/stats",
          { staleTimeMs: 0 }
        ),
      ]);
      setRows(trackerRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load tracker data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRows = rows.filter((r) => {
    if (activeTab !== "all" && r.stall_status !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.draft_summary?.business_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading onboarding tracker..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/admin/provider-ops"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-1"
            >
              <ArrowLeft className="h-3 w-3" /> Provider Ops
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-600" />
              Onboarding Tracker
            </h1>
            <p className="text-sm text-zinc-500">
              Every provider signup, every step, every stall
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="In Progress"
              value={stats.in_progress}
              color="text-blue-600"
            />
            <StatCard
              label="Active"
              value={stats.active_in_wizard}
              color="text-green-600"
            />
            <StatCard
              label="Stalled"
              value={stats.stalled}
              color="text-red-600"
              highlight
            />
            <StatCard
              label="Dropped Off"
              value={stats.dropped_off}
              color="text-red-800"
              highlight
            />
            <StatCard
              label="Pending Approval"
              value={stats.pending_approval}
              color="text-amber-600"
            />
          </div>
        )}

        {/* Step Distribution */}
        {stats && Object.keys(stats.by_step).length > 0 && (
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Currently At Each Step
            </h3>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(stats.by_step)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([step, count]) => (
                  <div
                    key={step}
                    className="flex flex-col items-center px-2 py-1 rounded bg-zinc-50 border text-center min-w-[48px]"
                  >
                    <span className="text-lg font-bold text-zinc-800">
                      {count}
                    </span>
                    <span className="text-[9px] text-zinc-400 leading-tight">
                      Step {step}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by name, email, phone, business..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="text-xs px-3 py-1.5"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {STATUS_TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              {error ? (
                <div className="text-center py-12 text-red-500">{error}</div>
              ) : filteredRows.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No signups found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRows.map((row) => (
                    <TrackerRowCard
                      key={row.user_id}
                      row={row}
                      expanded={expandedRow === row.user_id}
                      onToggle={() =>
                        setExpandedRow(
                          expandedRow === row.user_id ? null : row.user_id
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-3 ${highlight && value > 0 ? "border-red-200 bg-red-50/50" : ""}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function TrackerRowCard({
  row,
  expanded,
  onToggle,
}: {
  row: TrackerRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const name =
    row.full_name ||
    row.draft_summary?.business_name ||
    row.email ||
    "Unknown";

  const stallBadge = {
    active: { label: "Active", className: "bg-green-100 text-green-700" },
    slowing: { label: "Slowing", className: "bg-amber-100 text-amber-700" },
    stalled: { label: "Stalled", className: "bg-red-100 text-red-700" },
    dropped_off: {
      label: "Dropped Off",
      className: "bg-red-200 text-red-800",
    },
    completed: {
      label: "Completed",
      className: "bg-teal-100 text-teal-700",
    },
  }[row.stall_status];

  const timeSince = getRelativeTime(row.last_activity);

  return (
    <div className="bg-white border rounded-lg overflow-hidden hover:border-blue-200 transition-colors">
      <div
        className="p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 shrink-0">
              {row.current_step}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 truncate">
                  {name}
                </h3>
                <Badge className={`text-[10px] ${stallBadge.className}`}>
                  {stallBadge.label}
                </Badge>
                {row.admin_assisted && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-blue-200 text-blue-600"
                  >
                    Admin Assisted
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                <span>
                  Step {row.current_step}: {row.current_step_name}
                </span>
                <span className="text-zinc-300">·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeSince}
                </span>
                {row.email && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {row.email}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Step progress bar */}
            <div className="hidden md:flex gap-0.5">
              {Array.from({ length: 14 }, (_, i) => i + 1).map((step) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full ${
                    step < row.current_step
                      ? "bg-green-400"
                      : step === row.current_step
                        ? "bg-blue-500 ring-2 ring-blue-200"
                        : "bg-zinc-200"
                  }`}
                  title={STEP_NAMES[step]}
                />
              ))}
            </div>

            <div className="flex gap-1 ml-3">
              <Link
                href={`/admin/provider-ops/tracker/${row.user_id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </Link>
              {!row.has_provider && (
                <Link
                  href={`/admin/provider-ops/tracker/${row.user_id}?assist=true`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Wrench className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              )}
              {row.phone && (
                <a href={`tel:${row.phone}`} onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 bg-zinc-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <DraftField
              label="Business Name"
              value={row.draft_summary?.business_name}
            />
            <DraftField
              label="Team Size"
              value={row.draft_summary?.team_size}
            />
            <DraftField
              label="Business Type"
              value={row.draft_summary?.business_type}
            />
            <DraftField
              label="Address"
              value={
                row.draft_summary?.has_address ? "✓ Provided" : "✗ Missing"
              }
              ok={row.draft_summary?.has_address}
            />
            <DraftField
              label="Thumbnail"
              value={
                row.draft_summary?.has_thumbnail
                  ? "✓ Uploaded"
                  : "✗ Missing"
              }
              ok={row.draft_summary?.has_thumbnail}
            />
            <DraftField
              label="Services"
              value={
                row.draft_summary?.has_services
                  ? "✓ Added"
                  : "✗ None"
              }
              ok={row.draft_summary?.has_services}
            />
            <DraftField
              label="Categories"
              value={
                row.draft_summary?.category_count
                  ? `${row.draft_summary.category_count} selected`
                  : "✗ None"
              }
              ok={(row.draft_summary?.category_count || 0) > 0}
            />
            <DraftField
              label="Plan"
              value={
                row.draft_summary?.selected_plan_id
                  ? "✓ Selected"
                  : "✗ Not selected"
              }
              ok={!!row.draft_summary?.selected_plan_id}
            />
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Link href={`/admin/provider-ops/tracker/${row.user_id}`}>
              <Button variant="outline" size="sm" className="text-xs">
                <Eye className="h-3 w-3 mr-1" /> View Full Detail
              </Button>
            </Link>
            {!row.has_provider && (
              <Link
                href={`/admin/provider-ops/tracker/${row.user_id}?assist=true`}
              >
                <Button size="sm" className="text-xs">
                  <Wrench className="h-3 w-3 mr-1" /> Assist Onboarding
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftField({
  label,
  value,
  ok,
}: {
  label: string;
  value: string | null | undefined;
  ok?: boolean;
}) {
  return (
    <div>
      <span className="text-zinc-400">{label}</span>
      <p
        className={`font-medium ${
          ok === false ? "text-red-500" : ok === true ? "text-green-600" : "text-zinc-700"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
