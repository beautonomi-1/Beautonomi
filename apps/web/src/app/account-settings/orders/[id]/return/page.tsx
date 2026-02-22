"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";
import { ChevronLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface OrderData {
  id: string;
  order_number: string;
  status: string;
  items: OrderItem[];
  provider: { business_name: string };
}

const REASONS = [
  { value: "damaged", label: "Damaged or defective" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "arrived_late", label: "Arrived late" },
  { value: "other", label: "Other" },
];

export default function RequestReturnPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [selectedItem, setSelectedItem] = useState<string>("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      const res = await fetcher.get<{ data: { order: OrderData } }>(`/api/me/orders/${orderId}`, { cache: "no-store" });
      if (res?.data?.order) {
        setOrder(res.data.order);
        if (res.data.order.items?.length === 1) {
          setSelectedItem(res.data.order.items[0].id);
        }
      }
      setLoading(false);
    })();
  }, [orderId]);

  const handleSubmit = async () => {
    if (!reason || !selectedItem || submitting) return;
    setSubmitting(true);
    setError("");

    const item = order?.items?.find((i) => i.id === selectedItem);
    if (!item) {
      setError("Please select an item");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetcher.post<{ data?: any; error?: string }>("/api/me/returns", {
        order_id: orderId,
        order_item_id: selectedItem,
        reason,
        description: description || undefined,
        product_name: item.product_name,
        quantity: item.quantity,
        refund_amount: Number(item.total_price),
      });

      if (res?.data) {
        setSuccess(true);
      } else {
        setError((res as any)?.error || "Failed to submit return request");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Return Request Submitted</h2>
        <p className="mb-6 text-gray-500">
          We&apos;ve notified the provider. You&apos;ll receive an update on your return soon.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/account-settings/returns"
            className="rounded-xl bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700"
          >
            View My Returns
          </Link>
          <Link
            href="/account-settings/orders"
            className="rounded-xl border border-gray-200 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-gray-400">
        <p className="mb-4">Order not found</p>
        <button onClick={() => router.back()} className="text-pink-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href={`/account-settings/orders/${orderId}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Order
        </Link>

        <h1 className="mb-2 text-2xl font-bold text-gray-900">Request a Return</h1>
        <p className="mb-6 text-sm text-gray-500">
          Order {order.order_number} · {order.provider?.business_name}
        </p>

        <div className="space-y-6">
          {/* Select item */}
          {order.items?.length > 1 && (
            <div className="rounded-xl border bg-white p-6">
              <h3 className="mb-4 font-semibold text-gray-900">Which item are you returning?</h3>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedItem === item.id
                        ? "border-pink-500 bg-pink-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="item"
                      checked={selectedItem === item.id}
                      onChange={() => setSelectedItem(item.id)}
                      className="accent-pink-600"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {item.quantity} x R{Number(item.unit_price).toFixed(2)}
                      </p>
                    </div>
                    <span className="font-semibold text-gray-900">
                      R{Number(item.total_price).toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Reason for return</h3>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    reason === r.value
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-pink-600"
                  />
                  <span className="text-sm font-medium text-gray-700">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Additional details (optional)</h3>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in more detail..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none"
            />
          </div>

          {/* Return policy */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Return Policy</p>
                <ul className="space-y-1 text-amber-700">
                  <li>Returns must be requested within 14 days of delivery</li>
                  <li>Items must be unused and in their original packaging</li>
                  <li>The provider will review your request and respond</li>
                  <li>If rejected, you can escalate to Beautonomi support</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!reason || !selectedItem || submitting}
            className="w-full rounded-xl bg-pink-600 py-4 font-bold text-white transition-colors hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Return Request"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
