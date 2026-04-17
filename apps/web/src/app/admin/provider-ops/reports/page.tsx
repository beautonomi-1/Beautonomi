"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, TrendingDown, Users } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";

interface FunnelData {
  onboarding_funnel: {
    total_signups: number;
    started_wizard: number;
    submitted: number;
    active: number;
    signup_to_wizard_rate: number;
    wizard_to_submit_rate: number;
    submit_to_active_rate: number;
    overall_conversion_rate: number;
  };
  lead_funnel: {
    total_leads: number;
    by_stage: Record<string, number>;
    by_source: Record<string, number>;
    matched: number;
    conversion_rate: number;
  };
  admin_productivity: {
    admin_assisted_onboardings: number;
    self_serve_rate: number;
  };
}

interface StepDropoff {
  total_dropped: number;
  by_step: Array<{ step: number; name: string; count: number }>;
  worst_step: { step: number; name: string; count: number } | null;
}

export default function ReportsPage() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [dropoff, setDropoff] = useState<StepDropoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const [funnelRes, dropoffRes] = await Promise.all([
          fetcher.get<{ data: FunnelData }>(
            "/api/admin/provider-ops/reports/funnel",
            { staleTimeMs: 0 }
          ),
          fetcher.get<{ data: StepDropoff }>(
            "/api/admin/provider-ops/reports/step-dropoff",
            { staleTimeMs: 0 }
          ),
        ]);
        setFunnel(funnelRes.data);
        setDropoff(dropoffRes.data);
      } catch (err) {
        if (err instanceof FetchTimeoutError) setError("Request timed out");
        else if (err instanceof FetchError) setError(err.message);
        else setError("Failed to load reports");
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading reports..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">{error}</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link
            href="/admin/provider-ops"
            className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Provider Ops
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Reports
          </h1>
        </div>

        {/* Onboarding Funnel */}
        {funnel && (
          <div className="bg-white border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">
              Onboarding Funnel
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
              <FunnelStep
                label="Signups"
                value={funnel.onboarding_funnel.total_signups}
                rate={null}
              />
              <FunnelStep
                label="Started Wizard"
                value={funnel.onboarding_funnel.started_wizard}
                rate={funnel.onboarding_funnel.signup_to_wizard_rate}
              />
              <FunnelStep
                label="Submitted"
                value={funnel.onboarding_funnel.submitted}
                rate={funnel.onboarding_funnel.wizard_to_submit_rate}
              />
              <FunnelStep
                label="Active"
                value={funnel.onboarding_funnel.active}
                rate={funnel.onboarding_funnel.submit_to_active_rate}
              />
            </div>
            <div className="flex items-center gap-2 pt-4 border-t">
              <span className="text-sm text-zinc-500">
                Overall conversion rate:
              </span>
              <Badge
                className={`${
                  funnel.onboarding_funnel.overall_conversion_rate > 50
                    ? "bg-green-100 text-green-700"
                    : funnel.onboarding_funnel.overall_conversion_rate > 20
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {funnel.onboarding_funnel.overall_conversion_rate}%
              </Badge>
            </div>
          </div>
        )}

        {/* Step Drop-off Analysis */}
        {dropoff && (
          <div className="bg-white border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-1 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Step Drop-off Analysis
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              {dropoff.total_dropped} providers dropped off (no progress for
              7+ days)
              {dropoff.worst_step && (
                <> — worst step: <strong>Step {dropoff.worst_step.step}: {dropoff.worst_step.name}</strong></>
              )}
            </p>

            <div className="space-y-2">
              {dropoff.by_step.map((step) => {
                const maxCount = Math.max(
                  ...dropoff.by_step.map((s) => s.count),
                  1
                );
                const pct = (step.count / maxCount) * 100;
                return (
                  <div key={step.step} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2 sm:w-24 text-xs text-zinc-600 sm:text-right sm:block shrink-0">
                      <span>Step {step.step}</span>
                      <span className="sm:hidden text-zinc-400">· {step.name}</span>
                    </div>
                    <div className="flex-1 bg-zinc-100 rounded-full h-5 relative overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          step.count > 0 ? "bg-red-400" : "bg-zinc-200"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                      {step.count > 0 && (
                        <span className="absolute right-2 top-0 h-full flex items-center text-[10px] font-bold text-red-800">
                          {step.count}
                        </span>
                      )}
                    </div>
                    <span className="hidden sm:inline w-32 text-xs text-zinc-500 truncate">
                      {step.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lead Funnel & Admin Productivity */}
        {funnel && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Lead Funnel */}
            <div className="bg-white border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-zinc-800 mb-4">
                Lead Pipeline
              </h2>
              <div className="space-y-2">
                {Object.entries(funnel.lead_funnel.by_stage).map(
                  ([stage, count]) => (
                    <div
                      key={stage}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-zinc-600 capitalize">
                        {stage.replace(/_/g, " ")}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  )
                )}
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-zinc-500">
                  Lead → Matched rate:
                </span>
                <Badge>{funnel.lead_funnel.conversion_rate}%</Badge>
              </div>
            </div>

            {/* Admin Productivity */}
            <div className="bg-white border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Admin Productivity
              </h2>
              <div className="space-y-4">
                <Metric
                  label="Admin-Assisted Onboardings"
                  value={funnel.admin_productivity.admin_assisted_onboardings}
                />
                <Metric
                  label="Self-Serve Rate"
                  value={`${funnel.admin_productivity.self_serve_rate}%`}
                />
                <div className="pt-4 border-t">
                  <h3 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">
                    Leads by Source
                  </h3>
                  {Object.entries(funnel.lead_funnel.by_source).map(
                    ([source, count]) => (
                      <div
                        key={source}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-zinc-600 capitalize">
                          {source}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {count}
                        </Badge>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  rate,
}: {
  label: string;
  value: number;
  rate: number | null;
}) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-zinc-800">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
      {rate !== null && (
        <Badge
          variant="secondary"
          className={`text-[10px] mt-1 ${
            rate > 70
              ? "bg-green-100 text-green-700"
              : rate > 40
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {rate}% →
        </Badge>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-600">{label}</span>
      <span className="text-lg font-bold text-zinc-800">{value}</span>
    </div>
  );
}
