"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { XCircle, ShoppingBag, RotateCcw } from "lucide-react";

function ShopCancelledInner() {
  const sp = useSearchParams();
  const orderId = sp.get("order_id") ?? "";
  const orderNumber = sp.get("order_number") ?? "";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment cancelled</h1>

        {orderNumber && (
          <p className="text-sm text-gray-500 mb-1">Order #{orderNumber}</p>
        )}

        <p className="text-gray-500 text-sm mb-8">
          No charge was made. Your order is still pending — you can complete payment from your
          orders page, or go back to the shop to start a new cart.
        </p>

        <div className="flex flex-col gap-3">
          {orderId && (
            <Link
              href={`/account-settings/orders`}
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              View pending order
            </Link>
          )}
          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ShopCancelledPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <ShopCancelledInner />
    </Suspense>
  );
}
