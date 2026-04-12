import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
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
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";

interface TimelineEvent {
  type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ProviderLocation {
  id: string;
  city: string;
  country: string;
  address_line1: string;
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
    provider_locations: ProviderLocation[];
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

type EventStyle = { icon: React.ElementType; color: string };

const EVENT_STYLES: Record<string, EventStyle> = {
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

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  pending_approval: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-1.5 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium capitalize text-gray-700">{value.replace(/_/g, " ")}</span>
    </div>
  );
}

function CompletionItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
      <span className={`text-sm ${ok ? "text-gray-700" : "text-red-500"}`}>{label}</span>
    </div>
  );
}

export function ProviderOpsLifecyclePage() {
  const { providerId = "" } = useParams<{ providerId: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDER_OPS,
    "Provider Ops access is required to view lifecycle."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "provider-ops", "lifecycle", providerId],
    queryFn: () =>
      adminApi.getJson<{ data: LifecycleData }>(`/api/admin/provider-ops/providers/${providerId}/lifecycle`, {
        timeoutMs: 30_000,
      }),
    enabled: allowed && !!providerId,
  });

  const statusMut = useMutation({
    mutationFn: ({ action, reason }: { action: "activate" | "suspend" | "verify"; reason?: string }) =>
      adminApi.postJson(`/api/admin/providers/${providerId}/${action}`, { reason }),
    onSuccess: () => {
      adminToast.success("Provider status updated");
      void qc.invalidateQueries({ queryKey: ["admin", "provider-ops", "lifecycle", providerId] });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update status"),
  });

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <AdminPageSkeleton rows={8} />
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data?.data;

  if (!data) {
    return <AdminRetryBlock message="Lifecycle data not found" onRetry={() => void q.refetch()} />;
  }

  const { provider, user, lead, timeline, completeness, tracking } = data;

  const statusBadge = STATUS_BADGE[provider.status] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            to={adminSpaTo("/admin/provider-ops")}
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3 w-3" /> Provider Ops
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{provider.business_name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge}`}>
              {provider.status.replace(/_/g, " ")}
            </span>
            {provider.is_verified && (
              <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
          {user && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span className="flex min-w-0 items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{user.email}</span>
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
          {provider.status !== "active" && (
            <button
              type="button"
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate({ action: "activate" })}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Activate
            </button>
          )}
          {provider.status === "active" && (
            <button
              type="button"
              disabled={statusMut.isPending}
              onClick={() => {
                const reason = window.prompt("Reason for suspension (shown to provider):");
                if (reason !== null) statusMut.mutate({ action: "suspend", reason });
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Suspend
            </button>
          )}
          {!provider.is_verified && (
            <button
              type="button"
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate({ action: "verify" })}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Verify
            </button>
          )}
          <Link
            to={adminSpaTo(`/admin/providers/${provider.id}`)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Admin Provider View
          </Link>
          {provider.lead_id && (
            <Link
              to={adminSpaTo(`/admin/provider-ops/leads/${provider.lead_id}`)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              View Lead
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4">
          {/* Current State */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Current State</h2>
            <div className="space-y-0">
              <DetailRow label="Status" value={provider.status} />
              <DetailRow label="Onboarding State" value={provider.onboarding_state ?? "—"} />
              <DetailRow label="Business Type" value={provider.business_type ?? "—"} />
              <DetailRow label="Team Size" value={provider.team_size ?? "—"} />
              <DetailRow label="Created" value={new Date(provider.created_at).toLocaleDateString()} />
            </div>
          </div>

          {/* Profile Completeness */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Profile Completeness</h2>
            <CompletionItem label="Business Name" ok={completeness.has_business_name} />
            <CompletionItem label="Description" ok={completeness.has_description} />
            <CompletionItem label="Location" ok={completeness.has_location} />
            <CompletionItem label="Verified" ok={completeness.is_verified} />
          </div>

          {/* Originating Lead */}
          {lead && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="mb-2 text-sm font-semibold text-blue-800">Originating Lead</h2>
              <p className="text-xs text-blue-600">
                {String(lead.business_name ?? "Unnamed")} · Source: {String(lead.source ?? "—")}
              </p>
              <Link
                to={adminSpaTo(`/admin/provider-ops/leads/${String(lead.id ?? "")}`)}
                className="mt-2 block text-xs font-medium text-blue-700 hover:underline"
              >
                View Lead →
              </Link>
            </div>
          )}

          {/* Admin Assisted */}
          {!!tracking?.admin_assisted && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-semibold text-amber-800">Admin-Assisted Onboarding</h2>
              <p className="mt-1 text-xs text-amber-600">Onboarding was completed by an admin on behalf of this provider.</p>
              {!!tracking.admin_completed_at && (
                <p className="mt-1 text-xs text-amber-500">
                  Completed: {new Date(String(tracking.admin_completed_at)).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {/* Location */}
          {provider.provider_locations?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Locations</h2>
              <div className="space-y-3">
                {provider.provider_locations.map((loc) => (
                  <div key={loc.id} className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-700">{loc.address_line1}</p>
                      <p className="text-xs text-gray-400">
                        {loc.city}, {loc.country}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Lifecycle Timeline</h2>
            {timeline.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No events recorded</p>
            ) : (
              <div className="space-y-0">
                {timeline.map((event, i) => {
                  const style: EventStyle = EVENT_STYLES[event.type] ?? { icon: Clock, color: "bg-gray-300" };
                  const Icon = style.icon;
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.color}`}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        {i < timeline.length - 1 && <div className="my-1 w-px flex-1 bg-gray-200" />}
                      </div>
                      <div className="min-w-0 pb-6 pt-1">
                        <p className="text-sm font-medium text-gray-800">{event.description}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{new Date(event.timestamp).toLocaleString()}</p>
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                              Details
                            </summary>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-600">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
