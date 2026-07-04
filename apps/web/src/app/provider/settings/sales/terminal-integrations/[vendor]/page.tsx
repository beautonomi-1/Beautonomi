"use client";

/**
 * /provider/settings/sales/terminal-integrations/[vendor]
 *
 * Vendor-specific integration detail page.
 * Supports: connect (API key / manual), update credentials, disconnect.
 * Automatically adapts to the vendor's credential_modes.
 *
 * Feature gates:
 *   - Redirect to hub if terminal_integrations_enabled is off
 *   - Show "not available" when vendor flag is off (vendor config disabled)
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Terminal, CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  Eye, EyeOff, Loader2, Trash2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

type VendorConfig = {
  vendor: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  help_url: string | null;
  api_docs_url: string | null;
  credential_modes: string[];
  requires_merchant_id: boolean;
  setup_instructions_text: string | null;
};

type Integration = {
  id: string;
  vendor: string;
  status: string;
  credential_mode: string;
  environment: string;
  is_enabled: boolean;
  merchant_id: string | null;
  merchant_ref: string | null;
  business_name: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  has_api_key: boolean;
  has_oauth_token: boolean;
} | null;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    connected: { cls: "bg-green-100 text-green-800", label: "Connected" },
    pending_verification: { cls: "bg-yellow-100 text-yellow-800", label: "Pending verification" },
    error: { cls: "bg-red-100 text-red-800", label: "Error" },
    suspended: { cls: "bg-orange-100 text-orange-800", label: "Suspended" },
    not_connected: { cls: "bg-slate-100 text-slate-600", label: "Not connected" },
  };
  const s = map[status] ?? map.not_connected;
  return (
    <Badge className={`${s.cls} border-0 font-medium`}>{s.label}</Badge>
  );
}

export default function VendorIntegrationPage() {
  const params = useParams();
  const router = useRouter();
  const vendor = (params.vendor as string)?.toLowerCase();

  const { bundle, isLoading: isConfigLoading } = useConfigBundle();
  const hubEnabled = bundle?.flags?.terminal_integrations_enabled?.enabled === true;

  const [vendorConfig, setVendorConfig] = useState<VendorConfig | null>(null);
  const [integration, setIntegration] = useState<Integration>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);

  const [form, setForm] = useState({
    credential_mode: "api_key" as "api_key" | "manual",
    api_key: "",
    api_secret: "",
    merchant_id: "",
    merchant_ref: "",
    business_name: "",
    environment: "live" as "sandbox" | "live",
  });

  const loadData = useCallback(async () => {
    if (!hubEnabled || !vendor) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/provider/terminal-integrations/${vendor}`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          router.replace("/provider/settings/sales/terminal-integrations");
          return;
        }
        throw new Error(json?.error?.message ?? "Failed to load");
      }
      setVendorConfig(json.data?.vendor_config ?? null);
      const intg = json.data?.integration ?? null;
      setIntegration(intg);
      if (intg) {
        setForm((f) => ({
          ...f,
          credential_mode: (intg.credential_mode === "none" ? "api_key" : intg.credential_mode) as any,
          merchant_id: intg.merchant_id ?? "",
          merchant_ref: intg.merchant_ref ?? "",
          business_name: intg.business_name ?? "",
          environment: (intg.environment ?? "live") as any,
        }));
      }
    } catch (err: any) {
      toast.error(err.message ?? "Could not load integration");
    } finally {
      setIsLoading(false);
    }
  }, [hubEnabled, vendor, router]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isConfigLoading && !hubEnabled) {
    router.replace("/provider/settings");
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorConfig) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        credential_mode: form.credential_mode,
        environment: form.environment,
        merchant_id: form.merchant_id || null,
        merchant_ref: form.merchant_ref || null,
        business_name: form.business_name || null,
      };
      if (form.credential_mode === "api_key") {
        if (form.api_key) payload.api_key = form.api_key;
        if (form.api_secret) payload.api_secret = form.api_secret;
      }

      const res = await fetch(`/api/provider/terminal-integrations/${vendor}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed");

      toast.success(`${vendorConfig.display_name} integration saved successfully`);
      setIntegration(json.data?.integration ?? null);
      setForm((f) => ({ ...f, api_key: "", api_secret: "" })); // clear sensitive fields after save
    } catch (err: any) {
      toast.error(err.message ?? "Could not save integration");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${vendorConfig?.display_name ?? vendor} integration? Your credentials will be permanently removed.`)) return;
    setIsDisconnecting(true);
    try {
      const res = await fetch(`/api/provider/terminal-integrations/${vendor}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Disconnect failed");
      toast.success("Integration disconnected");
      setIntegration(null);
      setForm((f) => ({ ...f, api_key: "", api_secret: "", merchant_id: "", merchant_ref: "", business_name: "" }));
    } catch (err: any) {
      toast.error(err.message ?? "Could not disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  }

  const isConnected = integration?.status === "connected";
  const isPending = integration?.status === "pending_verification";
  const hasError = integration?.status === "error";
  const supportsApiKey = vendorConfig?.credential_modes?.includes("api_key") ?? true;
  const supportsManual = vendorConfig?.credential_modes?.includes("manual") ?? false;

  return (
    <SettingsDetailLayout
      title={vendorConfig?.display_name ?? vendor ?? "Terminal Integration"}
      description={vendorConfig?.description ?? "Connect your payment terminal to Beautonomi."}
      backHref="/provider/settings/sales/terminal-integrations"
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : !vendorConfig ? (
        <SectionCard>
          <div className="flex items-center gap-2 text-slate-500">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm">This terminal integration is not currently available. Please check back later.</p>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {/* Status card */}
          <SectionCard title="Connection status">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : hasError ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <Terminal className="h-5 w-5 text-slate-400" />
                )}
                <div>
                  <StatusBadge status={integration?.status ?? "not_connected"} />
                  {isConnected && integration?.connected_at && (
                    <p className="text-xs text-slate-500 mt-1">
                      Connected {new Date(integration.connected_at).toLocaleDateString()}
                      {integration.business_name ? ` · ${integration.business_name}` : ""}
                    </p>
                  )}
                  {isPending && (
                    <p className="text-xs text-slate-500 mt-1">
                      Verifying your credentials. This may take a few moments.
                    </p>
                  )}
                </div>
              </div>
              {(isConnected || isPending) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadData}
                  className="text-slate-500"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh
                </Button>
              )}
            </div>
            {hasError && integration?.last_error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription className="text-xs">{integration.last_error}</AlertDescription>
              </Alert>
            )}
          </SectionCard>

          {/* Setup instructions */}
          {vendorConfig.setup_instructions_text && (
            <SectionCard title="Setup guide">
              <p className="text-sm text-slate-600 whitespace-pre-line">
                {vendorConfig.setup_instructions_text}
              </p>
              {vendorConfig.api_docs_url && (
                <a
                  href={vendorConfig.api_docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-pink-600 hover:text-pink-700"
                >
                  View API documentation
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </SectionCard>
          )}

          {/* Credential form */}
          <SectionCard title={isConnected ? "Update credentials" : "Connect your terminal"}>
            <form onSubmit={handleSave} className="space-y-5">
              {/* Credential mode selector (show only when multiple modes supported) */}
              {supportsApiKey && supportsManual && (
                <div className="space-y-2">
                  <Label>Connection method</Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, credential_mode: "api_key" }))}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                        form.credential_mode === "api_key"
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <p className="font-medium">API key</p>
                      <p className="text-xs opacity-70 mt-0.5">Connect via API key from your merchant dashboard</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, credential_mode: "manual" }))}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                        form.credential_mode === "manual"
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <p className="font-medium">Manual</p>
                      <p className="text-xs opacity-70 mt-0.5">Mark as connected without API verification</p>
                    </button>
                  </div>
                </div>
              )}

              {/* API key fields */}
              {form.credential_mode === "api_key" && supportsApiKey && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="api_key">API key {isConnected && integration?.has_api_key && <span className="text-green-600 text-xs">(saved)</span>}</Label>
                    <div className="relative">
                      <Input
                        id="api_key"
                        type={showApiKey ? "text" : "password"}
                        value={form.api_key}
                        onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                        placeholder={isConnected && integration?.has_api_key ? "Enter new key to replace" : "sk_live_..."}
                        className="pr-10 rounded-xl"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api_secret">
                      API secret <span className="text-slate-400 text-xs">(optional)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="api_secret"
                        type={showApiSecret ? "text" : "password"}
                        value={form.api_secret}
                        onChange={(e) => setForm((f) => ({ ...f, api_secret: e.target.value }))}
                        placeholder={isConnected ? "Enter to update" : "Secret key if required"}
                        className="pr-10 rounded-xl"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiSecret((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Merchant ID */}
              {vendorConfig.requires_merchant_id && (
                <div className="space-y-1.5">
                  <Label htmlFor="merchant_id">
                    Merchant ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="merchant_id"
                    value={form.merchant_id}
                    onChange={(e) => setForm((f) => ({ ...f, merchant_id: e.target.value }))}
                    placeholder="Your merchant / business ID"
                    required
                    className="rounded-xl"
                  />
                </div>
              )}

              {/* Business name */}
              <div className="space-y-1.5">
                <Label htmlFor="business_name">
                  Business name on terminal <span className="text-slate-400 text-xs">(optional)</span>
                </Label>
                <Input
                  id="business_name"
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="As shown on your terminal"
                  className="rounded-xl"
                />
              </div>

              {/* Environment toggle */}
              <div className="space-y-1.5">
                <Label>Environment</Label>
                <div className="flex gap-2">
                  {(["live", "sandbox"] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, environment: env }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        form.environment === env
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {env === "live" ? "Live" : "Sandbox / test"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex-1"
                >
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                  ) : isConnected ? (
                    "Update credentials"
                  ) : (
                    "Connect terminal"
                  )}
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* Disconnect */}
          {(isConnected || isPending) && (
            <SectionCard title="Disconnect" className="border-red-100">
              <p className="text-sm text-slate-600 mb-4">
                Disconnecting will permanently remove your stored credentials. You can reconnect at any time.
              </p>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"
              >
                {isDisconnecting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Disconnecting…</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" />Disconnect {vendorConfig.display_name}</>
                )}
              </Button>
            </SectionCard>
          )}
        </div>
      )}
    </SettingsDetailLayout>
  );
}
