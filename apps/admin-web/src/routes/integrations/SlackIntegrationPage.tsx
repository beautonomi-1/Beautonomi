import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToast } from "@/lib/adminToast";

type RouteRule = {
  enabled: boolean;
  channel_id: string | null;
  channel_label?: string | null;
  dedupe_window_seconds: number;
};

type SlackConfig = {
  id?: string;
  enabled: boolean;
  team_name?: string | null;
  team_id?: string | null;
  bot_token_set?: boolean;
  routing: Record<string, RouteRule>;
};

const EVENT_LABELS: Record<string, string> = {
  "support.ticket.urgent_created": "Support: urgent ticket created",
  "support.ticket.high_priority_created": "Support: high-priority ticket created",
  "support.ticket.high_priority_unassigned": "Support: high/urgent unassigned",
  "support.ticket.overdue": "Support: SLA overdue",
  "support.ticket.followup_overdue": "Support: follow-up overdue",
  "support.ticket.escalated": "Support: ticket escalated",
  "support.ticket.reopened": "Support: ticket reopened",
  "support.queue.health": "Support: queue health threshold",
  "provider_ops.lead.created_unassigned": "Ops: new unassigned lead",
  "provider_ops.lead.stale_followup": "Ops: stale lead needs follow-up",
  "provider_ops.lead.blocked_stage": "Ops: lead blocked in critical stage",
  "provider_ops.lead.overdue_next_step": "Ops: lead overdue next step",
  "provider_ops.lead.milestone": "Ops: lead onboarding milestone",
  "provider_ops.pipeline.health": "Ops: pipeline health threshold",
  "provider_ops.lead.reassigned": "Ops: lead reassigned",
  "finance.payout.requested": "Finance: payout request",
  "finance.payout.exception": "Finance: payout exception",
  "finance.refund.manual_review": "Finance: refund/manual review",
  "finance.reconciliation.warning": "Finance: reconciliation warning",
  "dispute.new": "Disputes: new dispute",
  "dispute.overdue": "Disputes: overdue dispute",
  "safety.user_report.pending": "Safety: user report pending",
  "safety.user_report.adverse": "Safety: adverse report pending",
  "verification.pending_review": "Verifications: pending review",
  "verification.stuck_review": "Verifications: stuck review",
  "report.daily_operations_digest": "Reports: daily operations digest",
  "report.finance_exceptions_digest": "Reports: finance exceptions digest",
};

const BLANK_ROUTING = (): Record<string, RouteRule> =>
  Object.fromEntries(
    Object.keys(EVENT_LABELS).map((k) => [
      k,
      { enabled: false, channel_id: null, dedupe_window_seconds: 900 },
    ]),
  );

export function SlackIntegrationPage() {
  useAdminDocumentTitle("Slack");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required.",
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const env = sp.get("environment") || "production";

  const [routingDraft, setRoutingDraft] = useState<Record<string, RouteRule>>(BLANK_ROUTING());
  const [enabledDraft, setEnabledDraft] = useState(false);

  useEffect(() => {
    const slackConnected = sp.get("slack_connected");
    const slackError = sp.get("slack_error");
    if (slackConnected === "1") {
      adminToast.success("Slack workspace connected.");
      sp.delete("slack_connected");
      setSp(sp, { replace: true });
    }
    if (slackError) {
      adminToast.error(`Slack OAuth: ${slackError}`);
      sp.delete("slack_error");
      setSp(sp, { replace: true });
    }
  }, [sp, setSp]);

  const q = useQuery({
    queryKey: adminQueryKeys.slack(env),
    queryFn: () =>
      adminApi.getJson<SlackConfig | null>(
        `/api/admin/integrations/slack?environment=${encodeURIComponent(env)}`,
        { timeoutMs: 30_000 },
      ),
    enabled: allowed,
  });

  const channelsQ = useQuery({
    queryKey: [...adminQueryKeys.slack(env), "channels"],
    queryFn: () =>
      adminApi.getJson<{ channels: { id: string; name: string; is_private?: boolean }[] }>(
        `/api/admin/integrations/slack/channels?environment=${encodeURIComponent(env)}`,
        { timeoutMs: 60_000 },
      ),
    enabled: allowed && Boolean(q.data?.bot_token_set),
  });

  const logsQ = useQuery({
    queryKey: [...adminQueryKeys.slack(env), "logs"],
    queryFn: () =>
      adminApi.getJson<{ logs: Record<string, unknown>[] }>(
        `/api/admin/integrations/slack/logs?environment=${encodeURIComponent(env)}&limit=30`,
        { timeoutMs: 30_000 },
      ),
    enabled: allowed && Boolean(q.data?.id),
  });

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    setEnabledDraft(Boolean(d.enabled));
    const base = BLANK_ROUTING();
    const r = d.routing || {};
    for (const k of Object.keys(base)) {
      const row = r[k];
      if (row && typeof row === "object") {
        base[k] = {
          enabled: Boolean((row as RouteRule).enabled),
          channel_id: typeof (row as RouteRule).channel_id === "string" ? (row as RouteRule).channel_id : null,
          dedupe_window_seconds:
            typeof (row as RouteRule).dedupe_window_seconds === "number"
              ? (row as RouteRule).dedupe_window_seconds
              : 900,
        };
      }
    }
    setRoutingDraft(base);
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.putJson(`/api/admin/integrations/slack`, {
        environment: env,
        enabled: enabledDraft,
        routing: routingDraft,
      }),
    onSuccess: () => {
      adminToast.success("Slack settings saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.slack(env) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (channelId: string) =>
      adminApi.postJson(`/api/admin/integrations/slack/test`, {
        environment: env,
        channel_id: channelId,
        message: "Beautonomi Slack test — integration is working.",
      }),
    onSuccess: () => adminToast.success("Test message sent"),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const oauthHref = useMemo(() => {
    return `/api/admin/integrations/slack/oauth/install?environment=${encodeURIComponent(env)}`;
  }, [env]);

  const channelOptions = channelsQ.data?.channels ?? [];
  const testChannelId = useMemo(() => {
    const first = Object.values(routingDraft).find((r) => r.enabled && r.channel_id);
    return first?.channel_id || channelOptions[0]?.id || "";
  }, [routingDraft, channelOptions]);

  const connectionBadge = useMemo(() => {
    if (!q.data?.id) return { label: "Disconnected", className: "bg-gray-100 text-gray-800 border-gray-200" };
    if (q.data.bot_token_set && q.data.team_name) {
      return { label: "Connected", className: "bg-emerald-50 text-emerald-900 border-emerald-200" };
    }
    return { label: "Setup incomplete", className: "bg-amber-50 text-amber-900 border-amber-200" };
  }, [q.data]);

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Slack" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Slack"
        description="Connect a Slack workspace for high-signal Support, Ops, Finance, Disputes, Safety, Verification, and digest alerts. Configure channels per event — defaults stay quiet to avoid noise."
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              value={env}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                n.set("environment", e.target.value);
                setSp(n, { replace: true });
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
            <a
              href={oauthHref}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Radio className="h-4 w-4" />
              Connect Slack workspace
            </a>
          </div>
        }
      />

      <AdminPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-gray-900">Status</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${connectionBadge.className}`}>
                {connectionBadge.label}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {q.data?.team_name
                ? `Workspace ${q.data.team_name}${q.data.team_id ? ` (${q.data.team_id})` : ""}`
                : "Not connected — use Connect Slack workspace (OAuth)."}
            </p>
            {!q.data?.bot_token_set && q.data?.id ? (
              <p className="text-xs text-amber-800">
                Bot token not stored — finish OAuth or verify <code className="rounded bg-gray-100 px-1">SLACK_CLIENT_ID</code> / secret on the server.
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={enabledDraft}
              onChange={(e) => setEnabledDraft(e.target.checked)}
              className="rounded border-gray-300"
            />
            Enable Slack notifications (master toggle)
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-900">Event routing</p>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.keys(EVENT_LABELS).map((key) => {
              const rule = routingDraft[key] ?? {
                enabled: false,
                channel_id: null,
                dedupe_window_seconds: 900,
              };
              return (
                <div key={key} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) =>
                        setRoutingDraft((prev) => ({
                          ...prev,
                          [key]: { ...rule, enabled: e.target.checked },
                        }))
                      }
                      className="mt-1 rounded border-gray-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{EVENT_LABELS[key]}</p>
                      <p className="text-[11px] font-mono text-gray-400">{key}</p>
                      <select
                        value={rule.channel_id || ""}
                        onChange={(e) =>
                          setRoutingDraft((prev) => ({
                            ...prev,
                            [key]: { ...rule, channel_id: e.target.value || null },
                          }))
                        }
                        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
                      >
                        <option value="">Select channel…</option>
                        {channelOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.is_private ? "[private] " : "#"}
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-[11px] text-gray-500">Dedupe window (sec)</label>
                        <input
                          type="number"
                          min={60}
                          max={86400}
                          value={rule.dedupe_window_seconds}
                          onChange={(e) =>
                            setRoutingDraft((prev) => ({
                              ...prev,
                              [key]: {
                                ...rule,
                                dedupe_window_seconds: parseInt(e.target.value, 10) || 900,
                              },
                            }))
                          }
                          className="w-24 rounded border border-gray-200 px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            className={adminToolbarButtonClass(saveMut.isPending)}
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save settings
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(testMut.isPending || !testChannelId)}
            disabled={testMut.isPending || !testChannelId}
            onClick={() => testMut.mutate(testChannelId)}
          >
            Send test message
          </button>
          {channelsQ.isFetching && <span className="text-xs text-gray-400">Loading channels…</span>}
          {channelsQ.isError && (
            <span className="text-xs text-red-600">
              Could not load channels: {(channelsQ.error as Error)?.message ?? "error"}
            </span>
          )}
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="text-sm font-semibold text-gray-900">Recent deliveries</h3>
        <p className="mb-3 text-xs text-gray-500">Includes deduplication skips — useful when tuning noise.</p>
        <div className="max-h-72 overflow-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="sticky top-0 bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(logsQ.data?.logs ?? []).map((row) => (
                <tr key={String(row.id)}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-gray-600">
                    {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-gray-700">{String(row.event_key)}</td>
                  <td className="px-2 py-1.5">{String(row.status)}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500">
                    {String(row.entity_type)}:{String(row.entity_id)}
                  </td>
                </tr>
              ))}
              {(logsQ.data?.logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-gray-400">
                    No deliveries logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <AdminPanel className="text-xs text-gray-500">
        <p className="flex flex-wrap items-center gap-2">
          <span>
            Register redirect URL{" "}
            <code className="rounded bg-gray-100 px-1">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/admin/integrations/slack/oauth/callback
            </code>{" "}
            on your Slack app (OAuth & Permissions).
          </span>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/integrations/slack/oauth/callback`;
              void navigator.clipboard.writeText(url).then(
                () => adminToast.success("Callback URL copied"),
                () => adminToast.error("Could not copy"),
              );
            }}
          >
            Copy URL
          </button>
        </p>
        <p className="mt-2">
          Required bot scopes:{" "}
          <code className="rounded bg-gray-100 px-1">channels:read</code>,{" "}
          <code className="rounded bg-gray-100 px-1">groups:read</code>,{" "}
          <code className="rounded bg-gray-100 px-1">chat:write</code>. Set{" "}
          <code className="rounded bg-gray-100 px-1">SLACK_CLIENT_ID</code> and{" "}
          <code className="rounded bg-gray-100 px-1">SLACK_CLIENT_SECRET</code> in the server environment.
        </p>
      </AdminPanel>
    </div>
  );
}
