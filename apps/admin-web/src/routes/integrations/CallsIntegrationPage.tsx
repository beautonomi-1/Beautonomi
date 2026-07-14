import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Info } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

interface CallsConfigResponse {
  twilio_voice_enabled: boolean;
  salestrail_enabled: boolean;
  salestrail_webhook_username: string | null;
  salestrail_webhook_password_set: boolean;
  salestrail_default_tenant_id: string | null;
  twilio_api_key_sid: string | null;
  twilio_api_key_secret_set: boolean;
  twilio_twiml_app_sid: string | null;
  twilio_voice_from: string | null;
  twilio_voice_configured: boolean;
  twilio_twiml_webhook_url: string;
  salestrail_webhook_url: string;
  updated_at: string | null;
}

interface CallsConfigForm {
  twilio_voice_enabled: boolean;
  salestrail_enabled: boolean;
  salestrail_webhook_username: string;
  salestrail_webhook_password: string;
  salestrail_default_tenant_id: string;
  twilio_api_key_sid: string;
  twilio_api_key_secret: string;
  twilio_twiml_app_sid: string;
  twilio_voice_from: string;
}

const DEFAULTS: CallsConfigForm = {
  twilio_voice_enabled: false,
  salestrail_enabled: false,
  salestrail_webhook_username: "",
  salestrail_webhook_password: "",
  salestrail_default_tenant_id: "",
  twilio_api_key_sid: "",
  twilio_api_key_secret: "",
  twilio_twiml_app_sid: "",
  twilio_voice_from: "",
};

function formFromResponse(d: CallsConfigResponse): CallsConfigForm {
  return {
    twilio_voice_enabled: Boolean(d.twilio_voice_enabled),
    salestrail_enabled: Boolean(d.salestrail_enabled),
    salestrail_webhook_username: d.salestrail_webhook_username ?? "",
    salestrail_webhook_password: "",
    salestrail_default_tenant_id: d.salestrail_default_tenant_id ?? "",
    twilio_api_key_sid: d.twilio_api_key_sid ?? "",
    twilio_api_key_secret: "",
    twilio_twiml_app_sid: d.twilio_twiml_app_sid ?? "",
    twilio_voice_from: d.twilio_voice_from ?? "",
  };
}

function StatusChip({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
      )}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

function ToggleChip({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        on ? "bg-indigo-100 text-indigo-800" : "bg-gray-100 text-gray-600",
      )}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      adminToast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      adminToast.error("Copy failed");
    }
  };
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800"
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        Copy
      </button>
    </div>
  );
}

export function CallsIntegrationPage() {
  const { allowed, denied } = useSuperadminPage("Calls integration is superadmin-only.");
  useAdminDocumentTitle("Calls integration");
  const qc = useQueryClient();
  const [form, setForm] = useState<CallsConfigForm>(DEFAULTS);

  const q = useQuery({
    queryKey: adminQueryKeys.callsConfig(),
    queryFn: () => adminApi.getJson<CallsConfigResponse>("/api/admin/integrations/calls"),
    enabled: allowed,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (q.data) setForm(formFromResponse(q.data));
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.putJson("/api/admin/integrations/calls", {
        scope: "global",
        twilio_voice_enabled: form.twilio_voice_enabled,
        salestrail_enabled: form.salestrail_enabled,
        salestrail_webhook_username: form.salestrail_webhook_username,
        salestrail_webhook_password: form.salestrail_webhook_password || undefined,
        salestrail_default_tenant_id: form.salestrail_default_tenant_id || null,
        twilio_api_key_sid: form.twilio_api_key_sid,
        twilio_api_key_secret: form.twilio_api_key_secret || undefined,
        twilio_twiml_app_sid: form.twilio_twiml_app_sid,
        twilio_voice_from: form.twilio_voice_from,
      }),
    onSuccess: () => {
      adminToast.success("Calls integration saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.callsConfig() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.voiceConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Save failed"),
  });

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Calls" />
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

  const d = q.data;
  const twilioConfigured = Boolean(d?.twilio_voice_configured);
  const apiKeySecretSet = Boolean(d?.twilio_api_key_secret_set);
  const salestrailPasswordSet = Boolean(d?.salestrail_webhook_password_set);
  const salestrailConfigured =
    Boolean(form.salestrail_webhook_username.trim()) &&
    (salestrailPasswordSet || Boolean(form.salestrail_webhook_password.trim()));
  const saving = saveMut.isPending;

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Calls"
        description="Provider Ops call sources: Twilio in-browser dialer and Salestrail mobile tracking."
      />

      <AdminPanel className="!border-blue-100 !bg-blue-50/40">
        <div className="flex gap-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">How calls are logged</p>
            <p className="mt-1 text-blue-800">
              Both integrations write to the lead <strong>Comms</strong> timeline as channel{" "}
              <code className="rounded bg-white/80 px-1">call</code> and add a{" "}
              <code className="rounded bg-white/80 px-1">call_logged</code> activity. Manual
              &quot;Log call&quot; in the Lead Inbox still works when integrations are off.
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Twilio Voice (in-browser dialer)</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              WebRTC calls from the Lead Inbox. Requires Twilio account + API key (separate from SMS auth token).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.twilio_voice_enabled}
              onChange={(e) =>
                setForm((p) => ({ ...p, twilio_voice_enabled: e.target.checked }))
              }
            />
            Enabled
          </label>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <StatusChip
            ok={twilioConfigured}
            okLabel="Credentials complete"
            badLabel="Credentials incomplete"
          />
          <ToggleChip
            on={form.twilio_voice_enabled}
            onLabel="Dialer active for Provider Ops"
            offLabel="Dialer hidden"
          />
        </div>

        <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-xs text-gray-600">
          <li>
            In Twilio Console, create an <strong>API Key</strong> (SID starts with{" "}
            <code>SK</code>) and note the secret.
          </li>
          <li>
            Create a <strong>TwiML App</strong> (SID starts with <code>AP</code>). Set{" "}
            <strong>Voice Request URL</strong> to the webhook below (POST).
          </li>
          <li>
            Use a verified <strong>caller ID</strong> (E.164) for outbound calls — your Twilio
            voice number.
          </li>
          <li>Ensure <strong>Account SID + Auth Token</strong> are set under Platform Settings → Twilio (SMS section) — voice webhooks validate signatures with the auth token.</li>
          <li>Paste the values below, enable the toggle, and save.</li>
        </ol>

        <p className="mb-1 text-xs font-medium text-gray-500">TwiML Voice Request URL</p>
        <CopyField value={d?.twilio_twiml_webhook_url ?? ""} label="TwiML URL" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">API Key SID</span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.twilio_api_key_sid}
              onChange={(e) =>
                setForm((p) => ({ ...p, twilio_api_key_sid: e.target.value }))
              }
              placeholder="SK…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">
              API Key Secret {apiKeySecretSet ? "(saved — leave blank to keep)" : ""}
            </span>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.twilio_api_key_secret}
              onChange={(e) =>
                setForm((p) => ({ ...p, twilio_api_key_secret: e.target.value }))
              }
              placeholder={apiKeySecretSet ? "••••••••" : "Secret"}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">TwiML App SID</span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.twilio_twiml_app_sid}
              onChange={(e) =>
                setForm((p) => ({ ...p, twilio_twiml_app_sid: e.target.value }))
              }
              placeholder="AP…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">Voice caller ID (E.164)</span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.twilio_voice_from}
              onChange={(e) =>
                setForm((p) => ({ ...p, twilio_voice_from: e.target.value }))
              }
              placeholder="+27…"
            />
          </label>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Salestrail (mobile call tracking)</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Push API for calls placed from the Salestrail app on rep phones (SIM / WhatsApp calls).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.salestrail_enabled}
              onChange={(e) =>
                setForm((p) => ({ ...p, salestrail_enabled: e.target.checked }))
              }
            />
            Enabled
          </label>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <StatusChip
            ok={salestrailConfigured}
            okLabel="Credentials complete"
            badLabel="Credentials incomplete"
          />
          <ToggleChip
            on={form.salestrail_enabled && salestrailConfigured}
            onLabel="Webhook accepting calls"
            offLabel="Webhook inactive"
          />
        </div>

        <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-xs text-gray-600">
          <li>
            In Salestrail Call Analytics: <strong>Integrations → Apps → Push API → Connect</strong>.
          </li>
          <li>
            Set <strong>Endpoint URL</strong> to the webhook below. Salestrail uses HTTP Basic Auth
            with the username/password you configure here.
          </li>
          <li>
            Optionally set a <strong>default tenant UUID</strong> when multiple tenants share one
            Salestrail org — otherwise the first matching lead by phone wins.
          </li>
          <li>
            <a
              href="https://www.salestrail.io/knowledge-base/push-api-integration"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
            >
              Salestrail Push API guide
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        </ol>

        <p className="mb-1 text-xs font-medium text-gray-500">Webhook endpoint URL</p>
        <CopyField value={d?.salestrail_webhook_url ?? ""} label="Salestrail webhook URL" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">Webhook username</span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.salestrail_webhook_username}
              onChange={(e) =>
                setForm((p) => ({ ...p, salestrail_webhook_username: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">
              Webhook password{" "}
              {salestrailPasswordSet ? "(saved — leave blank to keep)" : ""}
            </span>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.salestrail_webhook_password}
              onChange={(e) =>
                setForm((p) => ({ ...p, salestrail_webhook_password: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-gray-700">Default tenant ID (optional)</span>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={form.salestrail_default_tenant_id}
              onChange={(e) =>
                setForm((p) => ({ ...p, salestrail_default_tenant_id: e.target.value }))
              }
              placeholder="UUID — scopes phone matching when set"
            />
          </label>
        </div>
      </AdminPanel>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => saveMut.mutate()}
          className={adminToolbarButtonClass(saving)}
        >
          {saving ? "Saving…" : "Save calls integration"}
        </button>
      </div>
    </div>
  );
}
