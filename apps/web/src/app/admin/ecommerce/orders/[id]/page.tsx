"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Package,
  User,
  MapPin,
  Store,
  Truck,
  CreditCard,
  Clock,
  Edit,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import { format } from "date-fns";

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  currency: string;
  fulfillment_type: string;
  tracking_number: string | null;
  order_source: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string;
  provider_id: string;
  customer: { id: string; full_name: string; email: string; phone?: string } | null;
  provider: { id: string; business_name: string; slug?: string; email?: string; phone?: string } | null;
  items: { id: string; product_name: string; product_image_url?: string; quantity: number; unit_price: number; total_price: number }[];
  delivery_address: { label?: string; address_line1?: string; city?: string; postal_code?: string; country?: string } | null;
  collection_location: { name?: string; address_line1?: string; city?: string } | null;
}

const STATUS_OPTIONS = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"];
const PAYMENT_OPTIONS = ["pending", "paid", "refunded", "partially_refunded", "failed"];

export default function ProductOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const { format: fmtMoney } = useReportCurrency();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("");
  const [editTracking, setEditTracking] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const loadOrder = async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: { order: OrderDetail } }>(`/api/admin/product-orders/${orderId}`);
      const o = res.data?.order;
      if (o) {
        setOrder(o);
        setEditStatus(o.status);
        setEditPaymentStatus(o.payment_status);
        setEditTracking(o.tracking_number ?? "");
        setEditNotes(o.admin_notes ?? "");
      }
    } catch {
      toast.error("Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrder(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editStatus !== order?.status) payload.status = editStatus;
      if (editPaymentStatus !== order?.payment_status) payload.payment_status = editPaymentStatus;
      if (editTracking !== (order?.tracking_number ?? "")) payload.tracking_number = editTracking || null;
      if (editNotes !== (order?.admin_notes ?? "")) payload.admin_notes = editNotes || null;

      await fetcher.patch(`/api/admin/product-orders/${orderId}`, payload);
      toast.success("Order updated");
      setEditing(false);
      loadOrder();
    } catch {
      toast.error("Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="p-8"><LoadingTimeout loadingMessage="Loading order..." /></div>
      </RoleGuard>
    );
  }

  if (!order) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="p-8 text-center text-gray-500">Order not found</div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/admin/ecommerce/orders")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Order #{order.order_number}</h1>
              <p className="text-sm text-gray-500">{format(new Date(order.created_at), "PPp")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={order.status === "delivered" || order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
            <Badge variant={order.payment_status === "paid" ? "default" : "secondary"}>{order.payment_status}</Badge>
            {!editing ? (
              <Button variant="outline" onClick={() => setEditing(true)}><Edit className="w-4 h-4 mr-2" />Edit</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}><X className="w-4 h-4 mr-2" />Cancel</Button>
                <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Saving..." : "Save"}</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Items */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" />Items ({order.items.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {item.product_image_url && (
                          <img src={item.product_image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{item.product_name}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity} × {fmtMoney(item.unit_price)}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-sm">{fmtMoney(item.total_price)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{fmtMoney(order.subtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Delivery fee</span><span>{fmtMoney(order.delivery_fee)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Platform fee</span><span>{fmtMoney(order.platform_fee)}</span></div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t"><span>Total</span><span>{fmtMoney(order.total_amount)}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Edit form */}
            {editing && (
              <Card>
                <CardHeader><CardTitle>Update Order</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Status</Label>
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full border rounded-md p-2 mt-1">
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Payment Status</Label>
                      <select value={editPaymentStatus} onChange={(e) => setEditPaymentStatus(e.target.value)} className="w-full border rounded-md p-2 mt-1">
                        {PAYMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>Tracking Number</Label>
                    <Input value={editTracking} onChange={(e) => setEditTracking(e.target.value)} placeholder="Enter tracking number" className="mt-1" />
                  </div>
                  <div>
                    <Label>Admin Notes</Label>
                    <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes" className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-4 h-4" />Customer</CardTitle></CardHeader>
              <CardContent>
                {order.customer ? (
                  <div className="space-y-2">
                    <p className="font-medium">{order.customer.full_name}</p>
                    <p className="text-sm text-gray-500">{order.customer.email}</p>
                    {order.customer.phone && <p className="text-sm text-gray-500">{order.customer.phone}</p>}
                    <Link href={`/admin/users/${order.customer.id}`} className="text-sm text-[#FF0077] hover:underline inline-block mt-1">View profile →</Link>
                  </div>
                ) : <p className="text-sm text-gray-500">Customer data unavailable</p>}
              </CardContent>
            </Card>

            {/* Provider */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Store className="w-4 h-4" />Provider</CardTitle></CardHeader>
              <CardContent>
                {order.provider ? (
                  <div className="space-y-2">
                    <p className="font-medium">{order.provider.business_name}</p>
                    {order.provider.email && <p className="text-sm text-gray-500">{order.provider.email}</p>}
                    <Link href={`/admin/providers/${order.provider.id}`} className="text-sm text-[#FF0077] hover:underline inline-block mt-1">View provider →</Link>
                  </div>
                ) : <p className="text-sm text-gray-500">Provider data unavailable</p>}
              </CardContent>
            </Card>

            {/* Fulfillment */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="w-4 h-4" />Fulfillment</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><p className="text-xs text-gray-500">Type</p><p className="text-sm font-medium capitalize">{order.fulfillment_type}</p></div>
                {order.tracking_number && (
                  <div><p className="text-xs text-gray-500">Tracking #</p><p className="text-sm font-mono">{order.tracking_number}</p></div>
                )}
                {order.delivery_address && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />Delivery Address</p>
                    <p className="text-sm">{[order.delivery_address.address_line1, order.delivery_address.city, order.delivery_address.postal_code].filter(Boolean).join(", ")}</p>
                  </div>
                )}
                {order.collection_location && (
                  <div>
                    <p className="text-xs text-gray-500">Collection Point</p>
                    <p className="text-sm">{order.collection_location.name} — {order.collection_location.address_line1}, {order.collection_location.city}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" />Payment</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Method</span><span className="capitalize">{order.payment_method || "—"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Status</span><Badge variant={order.payment_status === "paid" ? "default" : "secondary"} className="text-xs">{order.payment_status}</Badge></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Source</span><span>{order.order_source || "—"}</span></div>
              </CardContent>
            </Card>

            {/* Timestamps */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" />Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{format(new Date(order.created_at), "PP p")}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Updated</span><span>{format(new Date(order.updated_at), "PP p")}</span></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
