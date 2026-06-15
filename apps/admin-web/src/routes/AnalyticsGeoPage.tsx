import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

type GeoPeriod = "30d" | "90d" | "1y" | "all";

interface GeoData {
  period?: string;
  booking_window_note?: string;
  summary: {
    total_provider_locations: number;
    unique_providers: number;
    total_customer_addresses: number;
    unique_customers: number;
    provider_cities: number;
    customer_cities: number;
    total_devices: number;
    active_devices_30d: number;
  };
  providers_by_city: Array<{ city: string; count: number; active: number; lat: number; lng: number }>;
  providers_by_postal: Array<{ postal_code: string; count: number; city: string }>;
  customers_by_city: Array<{ city: string; count: number; lat: number; lng: number }>;
  customers_by_postal: Array<{ postal_code: string; count: number; city: string }>;
  bookings_by_city: Array<{ city: string; count: number; value: number; at_home: number; at_salon: number }>;
  booking_value: {
    total: number;
    at_home: { count: number; value: number };
    at_salon: { count: number; value: number };
    avg_booking_value: number;
  };
  device_platforms: Array<{ platform: string; total: number; customer: number; provider: number }>;
}

const PLATFORM_COLORS: Record<string, string> = {
  ios: "bg-blue-500",
  android: "bg-green-500",
  web: "bg-orange-500",
  huawei: "bg-red-600",
};

function MiniBarChart({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AnalyticsGeoPage() {
  useAdminDocumentTitle("Geo & Device Analytics");
  const { allowed, denied } = useSuperadminPage("Geo & Device Analytics is superadmin-only.");
  const [tab, setTab] = useState<"geography" | "devices" | "bookings">("geography");
  const [period, setPeriod] = useState<GeoPeriod>("all");
  const [providerSearch, setProviderSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.analyticsGeo(period),
    queryFn: () =>
      adminApi.getJson<GeoData>(`/api/admin/analytics/geo?period=${period}`, { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Geo & Device Analytics" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  if (!data) return null;

  const totalDevices = data.device_platforms.reduce((s, d) => s + d.total, 0);
  const maxProviderCity = Math.max(...data.providers_by_city.map((c) => c.count), 1);
  const maxCustomerCity = Math.max(...data.customers_by_city.map((c) => c.count), 1);
  const maxBookingCity = Math.max(...data.bookings_by_city.map((c) => c.count), 1);

  const filteredProviderCities = data.providers_by_city.filter(
    (c) => !providerSearch || c.city.toLowerCase().includes(providerSearch.toLowerCase())
  );
  const filteredCustomerCities = data.customers_by_city.filter(
    (c) => !customerSearch || c.city.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Geo & Device Analytics"
        description="Understand where your providers and customers are, and how they access the platform."
        actions={
          <select
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-950/[0.04]"
            value={period}
            onChange={(e) => setPeriod(e.target.value as GeoPeriod)}
            aria-label="Booking window"
          >
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
          </select>
        }
      />

      {data.booking_window_note && (
        <p className="text-xs text-gray-500">{data.booking_window_note}</p>
      )}

      {/* Summary KPIs */}
      <AdminPanel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Provider Locations", value: data.summary.unique_providers.toLocaleString(), sub: `${data.summary.provider_cities} cities` },
            { label: "Customer Addresses", value: data.summary.unique_customers.toLocaleString(), sub: `${data.summary.customer_cities} cities` },
            { label: "Registered Devices", value: data.summary.total_devices.toLocaleString(), sub: `${data.summary.active_devices_30d} active (30d)` },
            { label: "Avg Booking Value", value: formatAdminCurrency(data.booking_value.avg_booking_value), sub: `${formatAdminCurrency(data.booking_value.total)} total` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
              <div className="mt-0.5 text-xs text-gray-400">{sub}</div>
            </div>
          ))}
        </div>
      </AdminPanel>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["geography", "devices", "bookings"] as const).map((t) => (
          <button key={t} type="button" className={adminTabButtonClass(tab === t)} onClick={() => setTab(t)}>
            {t === "geography" ? "Geography" : t === "devices" ? "Devices" : "Booking Value"}
          </button>
        ))}
      </div>

      {/* Geography Tab */}
      {tab === "geography" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Provider cities */}
            <AdminPanel>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Providers by City</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{filteredProviderCities.length}</span>
              </div>
              <input
                type="search"
                placeholder="Search city…"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <div className="max-h-[360px] overflow-y-auto">
                {filteredProviderCities.slice(0, 50).map((c) => (
                  <div key={c.city} className="mb-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{c.city}</span>
                      <div className="text-right">
                        <span className="font-semibold">{c.count}</span>
                        <span className="ml-2 text-green-600">({c.active} active)</span>
                      </div>
                    </div>
                    <MiniBarChart value={c.count} max={maxProviderCity} />
                  </div>
                ))}
                {filteredProviderCities.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">No results</p>
                )}
              </div>
            </AdminPanel>

            {/* Customer cities */}
            <AdminPanel>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Customers by City</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{filteredCustomerCities.length}</span>
              </div>
              <input
                type="search"
                placeholder="Search city…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <div className="max-h-[360px] overflow-y-auto">
                {filteredCustomerCities.slice(0, 50).map((c) => (
                  <div key={c.city} className="mb-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{c.city}</span>
                      <span className="font-semibold">{c.count}</span>
                    </div>
                    <MiniBarChart value={c.count} max={maxCustomerCity} />
                  </div>
                ))}
                {filteredCustomerCities.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">No results</p>
                )}
              </div>
            </AdminPanel>
          </div>

          {/* Postal code breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AdminPanel>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Provider Density by Postal Code (top 50)</h2>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-gray-100 bg-white">
                    <tr>
                      <th className="py-2 text-left text-xs font-medium text-gray-500">Postal</th>
                      <th className="py-2 text-left text-xs font-medium text-gray-500">City</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.providers_by_postal.slice(0, 50).map((p) => (
                      <tr key={p.postal_code} className="hover:bg-gray-50">
                        <td className="py-1.5 font-mono text-xs">{p.postal_code}</td>
                        <td className="py-1.5 text-gray-600">{p.city}</td>
                        <td className="py-1.5 text-right font-medium">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminPanel>
            <AdminPanel>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Customer Density by Postal Code (top 50)</h2>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-gray-100 bg-white">
                    <tr>
                      <th className="py-2 text-left text-xs font-medium text-gray-500">Postal</th>
                      <th className="py-2 text-left text-xs font-medium text-gray-500">City</th>
                      <th className="py-2 text-right text-xs font-medium text-gray-500">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.customers_by_postal.slice(0, 50).map((p) => (
                      <tr key={p.postal_code} className="hover:bg-gray-50">
                        <td className="py-1.5 font-mono text-xs">{p.postal_code}</td>
                        <td className="py-1.5 text-gray-600">{p.city}</td>
                        <td className="py-1.5 text-right font-medium">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminPanel>
          </div>
        </div>
      )}

      {/* Devices Tab */}
      {tab === "devices" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.device_platforms.map((d) => {
              const pct = totalDevices > 0 ? ((d.total / totalDevices) * 100).toFixed(1) : "0";
              const barClass = PLATFORM_COLORS[d.platform] ?? "bg-gray-400";
              return (
                <AdminPanel key={d.platform}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-3 w-3 rounded-full ${barClass}`} />
                    <span className="text-sm font-semibold text-gray-900 uppercase">{d.platform}</span>
                    <span className="ml-auto text-xs text-gray-500">{pct}%</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total</span>
                      <span className="font-bold text-gray-900">{d.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Customer App</span>
                      <span className="font-medium text-emerald-700">{d.customer.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Provider App</span>
                      <span className="font-medium text-indigo-700">{d.provider.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                  </div>
                </AdminPanel>
              );
            })}
          </div>
          {totalDevices === 0 && (
            <AdminPanel>
              <p className="py-8 text-center text-sm text-gray-400">No device data available.</p>
            </AdminPanel>
          )}
          <AdminPanel>
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3 border border-amber-200">
              <strong>Note:</strong> Device data is based on push notification registrations (OneSignal). Platform tracks iOS, Android, and Web. Unregistered users (no push) are not counted.
            </p>
          </AdminPanel>
        </div>
      )}

      {/* Booking Value Tab */}
      {tab === "bookings" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AdminPanel>
              <div className="text-xs text-gray-500 mb-1">At-Home Bookings</div>
              <div className="text-2xl font-bold text-gray-900">{data.booking_value.at_home.count.toLocaleString()}</div>
              <div className="mt-1 text-sm text-gray-500">Value: {formatAdminCurrency(data.booking_value.at_home.value)}</div>
            </AdminPanel>
            <AdminPanel>
              <div className="text-xs text-gray-500 mb-1">At-Salon Bookings</div>
              <div className="text-2xl font-bold text-gray-900">{data.booking_value.at_salon.count.toLocaleString()}</div>
              <div className="mt-1 text-sm text-gray-500">Value: {formatAdminCurrency(data.booking_value.at_salon.value)}</div>
            </AdminPanel>
            <AdminPanel>
              <div className="text-xs text-gray-500 mb-1">Average Booking Value</div>
              <div className="text-2xl font-bold text-gray-900">{formatAdminCurrency(data.booking_value.avg_booking_value)}</div>
              <div className="mt-1 text-sm text-gray-500">Total GMV: {formatAdminCurrency(data.booking_value.total)}</div>
            </AdminPanel>
          </div>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Bookings by City (top 10)</h2>
            {data.bookings_by_city.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No bookings with a saved city on file. City-level charts only include rows where{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">address_city</code> is set; totals above include all
                non-cancelled bookings.
              </p>
            ) : null}
            {data.bookings_by_city.slice(0, 10).map((b) => (
              <div key={b.city} className="mb-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">{b.city}</span>
                  <div className="text-right text-xs text-gray-500">
                    <span className="font-semibold text-gray-900">{b.count}</span> bookings ·{" "}
                    <span className="font-semibold text-pink-700">{formatAdminCurrency(b.value)}</span>
                    <span className="ml-2 text-purple-600">{b.at_home} home</span>
                    <span className="ml-1 text-blue-600">{b.at_salon} salon</span>
                  </div>
                </div>
                <MiniBarChart value={b.count} max={maxBookingCity} />
              </div>
            ))}
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">All Booking Cities</h2>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-gray-100 bg-white">
                  <tr>
                    <th className="py-2 text-left text-xs font-medium text-gray-500">City</th>
                    <th className="py-2 text-right text-xs font-medium text-gray-500">Bookings</th>
                    <th className="py-2 text-right text-xs font-medium text-gray-500">Value</th>
                    <th className="py-2 text-right text-xs font-medium text-gray-500">At Home</th>
                    <th className="py-2 text-right text-xs font-medium text-gray-500">At Salon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.bookings_by_city.map((b) => (
                    <tr key={b.city} className="hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-900">{b.city}</td>
                      <td className="py-2 text-right">{b.count}</td>
                      <td className="py-2 text-right font-medium">{formatAdminCurrency(b.value)}</td>
                      <td className="py-2 text-right text-purple-600">{b.at_home}</td>
                      <td className="py-2 text-right text-blue-600">{b.at_salon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>
        </div>
      )}
    </div>
  );
}
