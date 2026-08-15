import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Key, Truck } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";

type CourierStatus = {
  configured: boolean;
  from_env: boolean;
  masked_key?: string | null;
  masked_password?: string | null;
  account_number?: string | null;
  username?: string | null;
  account_entity?: string | null;
  account_country_code?: string | null;
  source?: string | null;
  base_url: string;
};

type ShippingIntegrationStatus = {
  enabled: boolean;
  enabled_in_db: boolean;
  env_override: "on" | "off" | "unset";
  any_courier_configured: boolean;
  couriers: {
    "courier-guy": CourierStatus;
    "bob-go": CourierStatus;
    aramex: CourierStatus;
  };
  updated_at: string | null;
};

type ProbeResult = {
  ok: boolean;
  provider: string;
  quotes: { service: string; amount: number; currency: string; etaDays: number }[];
};

export function ShippingIntegrationPage() {
  useAdminDocumentTitle("Courier shipping");
  const { denied } = useSuperadminPage("Courier shipping credentials are superadmin-only.");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    courier_guy_api_key: "",
    courier_guy_base_url: "",
    bob_go_api_key: "",
    bob_go_base_url: "",
    aramex_account_number: "",
    aramex_account_pin: "",
    aramex_username: "",
    aramex_password: "",
    aramex_account_entity: "",
    aramex_account_country_code: "",
    aramex_source: "",
    aramex_base_url: "",
  });

  const q = useQuery({
    queryKey: adminQueryKeys.shippingIntegration(),
    queryFn: () =>
      adminApi.getJson<ShippingIntegrationStatus>("/api/admin/integrations/shipping", {
        timeoutMs: 30_000,
      }),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson<ShippingIntegrationStatus>("/api/admin/integrations/shipping", body),
    onSuccess: async () => {
      adminToast.success("Courier shipping settings saved");
      setOpen(false);
      setForm((f) => ({
        ...f,
        courier_guy_api_key: "",
        bob_go_api_key: "",
        aramex_account_pin: "",
        aramex_password: "",
      }));
      await qc.invalidateQueries({ queryKey: adminQueryKeys.shippingIntegration() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      adminApi.patchJson<ShippingIntegrationStatus>("/api/admin/integrations/shipping", {
        ecommerce_shipping_enabled: enabled,
      }),
    onSuccess: async (data) => {
      adminToast.success(data.enabled ? "Live courier booking is on" : "Live courier booking is off");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.shippingIntegration() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const probe = useMutation({
    mutationFn: (provider: "courier-guy" | "bob-go" | "aramex") =>
      adminApi.postJson<ProbeResult>("/api/admin/integrations/shipping/probe", { provider }),
    onSuccess: (data) => {
      const first = data.quotes[0];
      adminToast.success(
        first
          ? `${data.provider}: ${first.service} ${first.currency} ${first.amount}`
          : `${data.provider}: connected, no rates for the Sandton→Cape Town probe`,
      );
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Courier shipping" />
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
  if (!d) return <AdminRetryBlock message="Empty response" onRetry={() => void q.refetch()} />;

  const envLockedOff = d.env_override === "off";
  const envForcedOn = d.env_override === "on";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Courier shipping"
        description="Turn on live Courier Guy, Bob Go, and Aramex booking after product-order payment, and store the API keys used at compile/runtime."
      />
      <AdminMutationAlert
        errors={[
          save.error instanceof Error ? save.error : null,
          toggle.error instanceof Error ? toggle.error : null,
          probe.error instanceof Error ? probe.error : null,
        ]}
      />

      <AdminPanel>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              Customer checkout still uses each provider’s delivery fees. This switch only books a
              real courier waybill after payment when the salon has chosen a courier under Shipping
              &amp; Collection.
            </p>
            <p>
              Keys are stored in <code className="rounded bg-gray-100 px-1">platform_secrets</code>.
              Environment variables override the database (for local/Vercel).{" "}
              <code className="rounded bg-gray-100 px-1">ECOMMERCE_SHIPPING_ENABLED=false</code> is an
              emergency kill switch and cannot be overridden here.
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Live booking</h2>
            <p className="mt-1 text-sm text-gray-600">
              {envLockedOff
                ? "Forced off by ECOMMERCE_SHIPPING_ENABLED=false in the web environment. The admin flag below is stored for when that kill switch is removed."
                : envForcedOn
                  ? "Forced on by ECOMMERCE_SHIPPING_ENABLED=true in the web environment. Turn on in admin as well so booking stays on if you later unset the env var."
                  : d.enabled
                    ? "On. Paid delivery orders may book the salon’s selected courier."
                    : "Off. Quotes and auto-booking stay skipped until you enable this."}
            </p>
          </div>
          <button
            type="button"
            disabled={toggle.isPending}
            className={adminToolbarButtonClass(false)}
            onClick={() => toggle.mutate(!d.enabled_in_db)}
          >
            {d.enabled_in_db ? "Turn off in admin" : "Turn on in admin"}
          </button>
        </div>
        {!d.any_courier_configured ? (
          <p className="mt-3 text-sm text-amber-800">
            No courier keys yet. Save at least one live key before turning booking on, or quotes will
            skip as not configured.
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Courier status</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {(
            [
              ["courier-guy", "Courier Guy (ShipLogic)", d.couriers["courier-guy"]],
              ["bob-go", "Bob Go", d.couriers["bob-go"]],
              ["aramex", "Aramex", d.couriers.aramex],
            ] as const
          ).map(([id, label, row]) => (
            <li key={id} className="flex flex-wrap items-center gap-2">
              {row.configured ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <span className={row.configured ? "text-green-800" : "text-amber-900"}>
                {label}
                {row.from_env ? " (env)" : row.configured ? " (admin)" : ""}
              </span>
              <span className="font-mono text-xs text-gray-500">
                {row.masked_key ?? row.masked_password ?? "no key"}
              </span>
              <button
                type="button"
                disabled={probe.isPending || !row.configured}
                className="text-xs font-medium text-primary underline disabled:text-gray-400"
                onClick={() => probe.mutate(id)}
              >
                Probe rates
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          Probe calls the courier’s live rate API (Sandton → Cape Town). It does not create a
          waybill.
        </p>
        <button
          type="button"
          className={adminToolbarButtonClass(false) + " mt-4 inline-flex items-center gap-2"}
          onClick={() => {
            setForm((f) => ({
              ...f,
              courier_guy_base_url: d.couriers["courier-guy"].base_url === "https://api.shiplogic.com" ? "" : d.couriers["courier-guy"].base_url,
              bob_go_base_url: d.couriers["bob-go"].base_url === "https://api.bobgo.co.za/v2" ? "" : d.couriers["bob-go"].base_url,
              aramex_username: d.couriers.aramex.username ?? "",
              aramex_account_entity: d.couriers.aramex.account_entity === "JNB" ? "" : (d.couriers.aramex.account_entity ?? ""),
              aramex_account_country_code: d.couriers.aramex.account_country_code === "ZA" ? "" : (d.couriers.aramex.account_country_code ?? ""),
              aramex_source: d.couriers.aramex.source === "24" ? "" : (d.couriers.aramex.source ?? ""),
              aramex_base_url:
                d.couriers.aramex.base_url === "https://ws.aramex.net/ShippingAPI.V2"
                  ? ""
                  : d.couriers.aramex.base_url,
            }));
            setOpen((v) => !v);
          }}
        >
          <Key className="h-4 w-4" />
          {open ? "Hide credentials" : "Edit live keys"}
        </button>
        {open ? (
          <form
            className="mt-4 space-y-4 border-t border-gray-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const body: Record<string, string> = {};
              (Object.keys(form) as (keyof typeof form)[]).forEach((key) => {
                if (form[key].trim()) body[key] = form[key].trim();
              });
              save.mutate(body);
            }}
          >
            <p className="text-xs text-gray-500">Leave a secret blank to keep the current value.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                Courier Guy API key
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.courier_guy_api_key}
                  onChange={(e) => setForm((f) => ({ ...f, courier_guy_api_key: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Courier Guy base URL (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.courier_guy_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, courier_guy_base_url: e.target.value }))}
                  placeholder="https://api.shiplogic.com"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Bob Go API key
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.bob_go_api_key}
                  onChange={(e) => setForm((f) => ({ ...f, bob_go_api_key: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Bob Go base URL (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.bob_go_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, bob_go_base_url: e.target.value }))}
                  placeholder="https://api.bobgo.co.za/v2"
                />
              </label>
              <label className="text-sm">
                Aramex account number
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_account_number}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_account_number: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Aramex PIN
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_account_pin}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_account_pin: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="text-sm">
                Aramex username
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_username}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_username: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                Aramex password
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_password}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_password: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="text-sm">
                Aramex entity
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_account_entity}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_account_entity: e.target.value }))}
                  placeholder="JNB"
                />
              </label>
              <label className="text-sm">
                Aramex country
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_account_country_code}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_account_country_code: e.target.value }))}
                  placeholder="ZA"
                />
              </label>
              <label className="text-sm">
                Aramex source
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_source}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_source: e.target.value }))}
                  placeholder="24"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Aramex base URL (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
                  value={form.aramex_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, aramex_base_url: e.target.value }))}
                  placeholder="https://ws.aramex.net/ShippingAPI.V2"
                />
              </label>
            </div>
            <button type="submit" disabled={save.isPending} className={adminToolbarButtonClass(true)}>
              Save keys
            </button>
          </form>
        ) : null}
      </AdminPanel>
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <Truck className="h-3.5 w-3.5" />
        Apply migration 858 before this page can persist keys.
      </p>
    </div>
  );
}
