"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ExternalLink,
  Building2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TimelineEvent {
  type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface LifecycleData {
  provider: {
    id: string;
    user_id: string;
    business_name: string;
    slug: string;
    status: string;
    is_verified: boolean;
    onboarding_state: string | null;
    lead_id: string | null;
    created_at: string;
    description: string | null;
    business_type: string | null;
    team_size: string | null;
    provider_locations: Array<{
      id: string;
      city: string;
      country: string;
      address_line1: string;
    }>;
  };
  user: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    created_at: string;
  } | null;
  tracking: Record<string, unknown> | null;
  lead: Record<string, unknown> | null;
  timeline: TimelineEvent[];
  completeness: {
    has_business_name: boolean;
    has_description: boolean;
    has_location: boolean;
    is_verified: boolean;
    status: string;
  };
}

const EVENT_STYLES: Record<string, { icon: React.ElementType; color: string }> = {
  lead_created: { icon: User, color: "bg-blue-400" },
  signup: { icon: User, color: "bg-indigo-400" },
  wizard_started: { icon: Clock, color: "bg-cyan-400" },
  stage_changed: { icon: AlertTriangle, color: "bg-violet-400" },
  admin_intervention: { icon: ShieldCheck, color: "bg-amber-500" },
  provider_created: { icon: Building2, color: "bg-green-500" },
  activated: { icon: CheckCircle2, color: "bg-green-600" },
  suspended: { icon: XCircle, color: "bg-red-500" },
  note_added: { icon: Mail, color: "bg-blue-300" },
  match_confirmed: { icon: CheckCircle2, color: "bg-teal-500" },
};

export default function ProviderLifecyclePage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: LifecycleData }>(
        `/api/admin/provider-ops/providers/${providerId}/lifecycle`,
        { staleTimeMs: 0 }
      );
      setData(res.data);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load lifecycle data");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading lifecycle..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>{error || "Not found"}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/provider-ops")}
        >
          Back to Provider Ops
        </Button>
      </div>
    );
  }

  const { provider, user, lead, timeline, completeness, tracking } = data;

  const statusColors: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700",
    pending_approval: "bg-amber-100 text-amber-700",
    active: "bg-green-100 text-green-700",
    suspended: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/admin/provider-ops"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Provider Ops
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">
                {provider.business_name}
              </h1>
              <Badge
                className={
                  statusColors[provider.status] || "bg-zinc-100 text-zinc-700"
                }
              >
                {provider.status.replace(/_/g, " ")}
              </Badge>
              {provider.is_verified && (
                <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-0.5" /> Verified
                </Badge>
              )}
            </div>
            {user && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-zinc-500">
                <span className="flex items-center gap-1 min-w-0">
                  <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{user.email}</span>
                </span>
                {user.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" /> {user.phone}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/providers/${provider.id}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3 w-3 mr-1" /> Admin Provider View
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Current State + Completeness */}
          <div className="space-y-4">
            {/* Current state */}
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                Current State
              </h2>
              <div className="space-y-2">
                <DetailRow label="Status" value={provider.status} />
                <DetailRow
                  label="Onboarding State"
                  value={provider.onboarding_state || "—"}
                />
                <DetailRow
                  label="Business Type"
                  value={provider.business_type || "—"}
                />
                <DetailRow
                  label="Team Size"
                  value={provider.team_size || "—"}
                />
                <DetailRow
                  label="Created"
                  value={new Date(provider.created_at).toLocaleDateString()}
                />
              </div>
            </div>

            {/* Completeness */}
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                Profile Completeness
              </h2>
              <div className="space-y-2">
                <CompletionItem
                  label="Business Name"
                  ok={completeness.has_business_name}
                />
                <CompletionItem
                  label="Description"
                  ok={completeness.has_description}
                />
                <CompletionItem
                  label="Location"
                  ok={completeness.has_location}
                />
                <CompletionItem
                  label="Verified"
                  ok={completeness.is_verified}
                />
              </div>
            </div>

            {/* Linked Lead */}
            {lead && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-2">
                <h2 className="text-sm font-semibold text-blue-800">
                  Originating Lead
                </h2>
                <p className="text-xs text-blue-600">
                  {(lead.business_name as string) || "Unnamed"} · Source:{" "}
                  {lead.source as string}
                </p>
                <Link
                  href={`/admin/provider-ops/leads/${lead.id}`}
                  className="text-xs text-blue-700 hover:underline"
                >
                  View Lead →
                </Link>
              </div>
            )}

            {/* Admin Assisted */}
            {tracking?.admin_assisted && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-amber-800">
                  Admin-Assisted Onboarding
                </h2>
                <p className="text-xs text-amber-600 mt-1">
                  Onboarding was completed by an admin on behalf of this
                  provider.
                </p>
                {tracking.admin_completed_at && (
                  <p className="text-xs text-amber-500 mt-1">
                    Completed:{" "}
                    {new Date(
                      tracking.admin_completed_at as string
                    ).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Location */}
            {provider.provider_locations?.length > 0 && (
              <div className="bg-white border rounded-xl p-5 space-y-2">
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                  Location
                </h2>
                {provider.provider_locations.map((loc) => (
                  <div key={loc.id} className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-700">
                        {loc.address_line1}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {loc.city}, {loc.country}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Timeline */}
          <div className="lg:col-span-2">
            <div className="bg-white border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-4">
                Lifecycle Timeline
              </h2>
              <div className="space-y-0">
                {timeline.length === 0 ? (
                  <p className="text-sm text-zinc-400 text-center py-8">
                    No events recorded
                  </p>
                ) : (
                  timeline.map((event, i) => {
                    const style = EVENT_STYLES[event.type] || {
                      icon: Clock,
                      color: "bg-zinc-300",
                    };
                    const Icon = style.icon;
                    return (
                      <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full ${style.color} flex items-center justify-center`}
                          >
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          {i < timeline.length - 1 && (
                            <div className="w-px flex-1 bg-zinc-200 my-1" />
                          )}
                        </div>
                        <div className="pb-6 min-w-0 pt-1">
                          <p className="text-sm text-zinc-800 font-medium">
                            {event.description}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {new Date(event.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-700 font-medium capitalize">
        {value.replace(/_/g, " ")}
      </span>
    </div>
  );
}

function CompletionItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
      <span className={`text-sm ${ok ? "text-zinc-700" : "text-red-500"}`}>
        {label}
      </span>
    </div>
  );
}
