/**
 * Control-plane → Region online payment gateway
 *
 * Edit primary online gateway (Paystack / Stripe) and region-scoped secrets via
 * GET/PATCH /api/admin/regions/[regionId]/online-gateway.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField } from "./cpShared";
import { adminSpaTo } from "@/lib/adminSpaPath";

type RegionRow = {
  id: string;
  code: string;
  name: string;
  default_currency?: string | null;
};

type GatewayGetResponse = {
  region: RegionRow;
  primary: {
    gateway: string;
    config?: { settlement_model?: string };
    is_primary_online?: boolean;
    is_active?: boolean;
  } | null;
  secrets_set: Record<string, boolean>;
};

export function CpRegionOnlineGatewayPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionId, setRegionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gateway, setGateway] = useState<"paystack" | "stripe">("paystack");
  const [settlementModel, setSettlementModel] = useState<
    "platform_mor_transfer" | "connected_mor_destination"
  >("platform_mor_transfer");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripePublishable, setStripePublishable] = useState("");
  const [paystackSecret, setPaystackSecret] = useState("");
  const [secretsSet, setSecretsSet] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!allowed) return;
    void loadRegions();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !regionId) return;
    void loadGateway();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, regionId]);

  async function loadRegions() {
    setRegionsLoading(true);
    try {
      const list = await adminApi.getJson<RegionRow[]>("/api/admin/regions");
      const arr = Array.isArray(list) ? list : [];
      setRegions(arr);
      if (arr[0]?.id) setRegionId(arr[0].id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load regions");
    } finally {
      setRegionsLoading(false);
    }
  }

  async function loadGateway() {
    setLoading(true);
    setMsg(null);
    try {
      const data = await adminApi.getJson<GatewayGetResponse>(
        `/api/admin/regions/${regionId}/online-gateway`,
      );
      if (!data) return;
      const gw = (data.primary?.gateway ?? "paystack").toLowerCase();
      setGateway(gw === "stripe" ? "stripe" : "paystack");
      const sm = data.primary?.config?.settlement_model;
      setSettlementModel("platform_mor_transfer");
      if (sm === "connected_mor_destination") {
        setMsg(
          "Destination (connected MoR) checkout is not supported — saved as platform MoR + transfer. Re-save to persist.",
        );
      }
      setSecretsSet(data.secrets_set ?? {});
      setStripeSecret("");
      setStripeWebhookSecret("");
      setStripePublishable("");
      setPaystackSecret("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load gateway");
    } finally {
      setLoading(false);
    }
  }

  async function saveGateway() {
    if (!regionId) return;
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.patchJson(`/api/admin/regions/${regionId}/online-gateway`, {
        gateway,
        settlement_model: settlementModel,
        ...(stripeSecret.trim() ? { stripe_secret_key: stripeSecret.trim() } : {}),
        ...(stripeWebhookSecret.trim()
          ? { stripe_webhook_secret: stripeWebhookSecret.trim() }
          : {}),
        ...(stripePublishable.trim()
          ? { stripe_publishable_key: stripePublishable.trim() }
          : {}),
        ...(paystackSecret.trim() ? { paystack_secret_key: paystackSecret.trim() } : {}),
      });
      setMsg("Region gateway updated.");
      await loadGateway();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save gateway");
    } finally {
      setSaving(false);
    }
  }

  if (denied) return null;

  const selected = regions.find((r) => r.id === regionId);

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Region online gateway"
        description="Set the primary card checkout provider per region (Paystack or Stripe). Secrets are stored in region_secrets; leave blank to keep existing values."
      />

      <p className="text-sm text-muted-foreground">
        Also see{" "}
        <Link
          to={adminSpaTo("/admin/control-plane/country-launch-checklist")}
          className="text-primary underline"
        >
          Country launch checklist
        </Link>{" "}
        and{" "}
        <Link
          to={adminSpaTo("/admin/control-plane/integrations/stripe")}
          className="text-primary underline"
        >
          Stripe integration health
        </Link>
        .
      </p>

      {msg && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
          {msg}
          <button className="ml-2 text-blue-600 underline" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </div>
      )}

      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Region</span>
            <select
              className="min-w-[16rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              disabled={regionsLoading}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <span className="text-xs text-muted-foreground pb-1">
              Currency: {selected.default_currency ?? "—"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : (
          <div className="grid gap-4 max-w-xl">
            <CpField label="Primary online gateway">
              <select
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={gateway}
                onChange={(e) => setGateway(e.target.value as "paystack" | "stripe")}
              >
                <option value="paystack">Paystack</option>
                <option value="stripe">Stripe</option>
              </select>
            </CpField>
            {gateway === "stripe" ? (
              <CpField label="Settlement model">
                <p className="text-sm text-muted-foreground rounded-lg border border-gray-200 px-3 py-2 bg-gray-50">
                  Platform MoR + transfer (Connect payouts). Destination / connected-account MoR checkout is
                  not available for customer payments.
                </p>
              </CpField>
            ) : null}
            <CpField label="Stripe secret key">
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                placeholder={secretsSet.stripe_secret_key ? "•••• set (leave blank to keep)" : "sk_live_…"}
                value={stripeSecret}
                onChange={(e) => setStripeSecret(e.target.value)}
              />
            </CpField>
            <CpField label="Stripe webhook secret">
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                placeholder={
                  secretsSet.stripe_webhook_secret ? "•••• set (leave blank to keep)" : "whsec_…"
                }
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
              />
            </CpField>
            <CpField label="Stripe publishable key">
              <input
                type="text"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                placeholder={
                  secretsSet.stripe_publishable_key ? "•••• set (leave blank to keep)" : "pk_live_…"
                }
                value={stripePublishable}
                onChange={(e) => setStripePublishable(e.target.value)}
              />
            </CpField>
            <CpField label="Paystack secret key">
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                placeholder={
                  secretsSet.paystack_secret_key ? "•••• set (leave blank to keep)" : "sk_live_…"
                }
                value={paystackSecret}
                onChange={(e) => setPaystackSecret(e.target.value)}
              />
            </CpField>
            <button
              type="button"
              onClick={() => void saveGateway()}
              disabled={saving || !regionId}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 w-fit"
            >
              {saving ? "Saving…" : "Save gateway"}
            </button>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
