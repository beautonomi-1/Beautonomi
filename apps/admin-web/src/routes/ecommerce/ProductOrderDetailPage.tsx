import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { adminSpaTo } from "@/lib/adminSpaPath";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function formatAddress(a: Record<string, unknown> | null | undefined): string {
  if (!a) return "—";
  const parts = [
    a.address_line1,
    a.address_line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(", "),
    a.country,
  ].filter(Boolean);
  return parts.length ? parts.map((p) => str(p)).join(" · ") : "—";
}

export function ProductOrderDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.productOrderDetail(id),
    queryFn: () =>
      adminApi.getJson<{ order: Record<string, unknown> }>(`/api/admin/product-orders/${encodeURIComponent(id)}`, {
        timeoutMs: 60_000,
      }),
    enabled: allowed && !!id,
  });

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing order id" onRetry={() => {}} />;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Order" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const order = q.data?.order;
  if (!order) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Order" />
        <AdminPanel>
          <p className="text-sm text-gray-600">Order not found.</p>
          <Link className="mt-4 inline-block text-sm text-primary underline" to={adminSpaTo("/admin/ecommerce/orders")}>
            ← Back to orders
          </Link>
        </AdminPanel>
      </div>
    );
  }

  const customer = order.customer as Record<string, unknown> | undefined;
  const provider = order.provider as Record<string, unknown> | undefined;
  const delivery = order.delivery_address as Record<string, unknown> | undefined;
  const collection = order.collection_location as Record<string, unknown> | undefined;
  const items = (order.items as Record<string, unknown>[] | undefined) ?? [];
  const lat =
    order.fulfillment_type === "delivery"
      ? delivery?.latitude
      : collection?.latitude;
  const lng =
    order.fulfillment_type === "delivery"
      ? delivery?.longitude
      : collection?.longitude;
  const mapHref =
    lat != null && lng != null && String(lat) !== "" && String(lng) !== ""
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=16/${lat}/${lng}`
      : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`Order ${str(order.order_number ?? id)}`}
        description={`${str(order.status)} · payment ${str(order.payment_status)}`}
        actions={
          <Link
            to={adminSpaTo("/admin/ecommerce/orders")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
          >
            ← Orders
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Financials</h2>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Subtotal</dt>
              <dd className="font-medium tabular-nums">{Number(order.subtotal ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Tax</dt>
              <dd className="font-medium tabular-nums">{Number(order.tax_amount ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Delivery fee</dt>
              <dd className="font-medium tabular-nums">{Number(order.delivery_fee ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Discount</dt>
              <dd className="font-medium tabular-nums">{Number(order.discount_amount ?? 0).toFixed(2)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {str(order.currency)} {Number(order.total_amount ?? 0).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Fulfillment</dt>
              <dd className="font-medium">{str(order.fulfillment_type)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium">
                {order.created_at ? new Date(String(order.created_at)).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Customer & provider</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Customer</dt>
              <dd>
                {customer?.id ? (
                  <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/users/${str(customer.id)}`)}>
                    {str(customer.full_name) || str(customer.email)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dd className="text-gray-600">{str(customer?.email)}</dd>
              <dd className="text-gray-600">{str(customer?.phone)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Provider</dt>
              <dd>
                {provider?.id ? (
                  <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/providers/${str(provider.id)}`)}>
                    {str(provider.business_name)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </AdminPanel>
      </div>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Location & address</h2>
        <p className="mt-2 text-sm text-gray-600">
          {order.fulfillment_type === "delivery" ? "Delivery address" : "Collection location"}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-900">
          {order.fulfillment_type === "delivery" ? formatAddress(delivery) : formatAddress(collection)}
        </p>
        {order.delivery_instructions != null && String(order.delivery_instructions).trim() ? (
          <p className="mt-2 text-sm text-gray-600">Instructions: {str(order.delivery_instructions)}</p>
        ) : null}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Latitude</dt>
            <dd className="font-mono text-xs">{lat != null && lat !== "" ? str(lat) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Longitude</dt>
            <dd className="font-mono text-xs">{lng != null && lng !== "" ? str(lng) : "—"}</dd>
          </div>
        </dl>
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-primary underline"
          >
            Open map
          </a>
        ) : null}
        {order.tracking_number ? (
          <p className="mt-3 text-sm">
            <span className="text-gray-500">Tracking: </span>
            <span className="font-mono">{str(order.tracking_number)}</span>
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Line items</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No items.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Product</AdminTh>
                <AdminTh>Qty</AdminTh>
                <AdminTh>Unit</AdminTh>
                <AdminTh>Line total</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((it) => (
                <tr key={str(it.id)}>
                  <AdminTd>{str(it.product_name)}</AdminTd>
                  <AdminTd className="tabular-nums">{str(it.quantity)}</AdminTd>
                  <AdminTd className="tabular-nums">{Number(it.unit_price ?? 0).toFixed(2)}</AdminTd>
                  <AdminTd className="tabular-nums">{Number(it.total_price ?? 0).toFixed(2)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
