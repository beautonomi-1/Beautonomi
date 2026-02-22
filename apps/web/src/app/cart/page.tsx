"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

interface CartItem {
  id: string;
  quantity: number;
  in_stock: boolean;
  stock_available: number;
  product: {
    id: string;
    name: string;
    retail_price: number;
    image_urls: string[];
    brand: string | null;
    quantity: number;
  };
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/cart");
      const json = await res.json();
      if (json.data) setItems(json.data.items);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchCart(), 0);
    return () => clearTimeout(id);
  }, [fetchCart]);

  const updateQty = async (itemId: string, qty: number) => {
    await fetch(`/api/me/cart/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty }),
    });
    fetchCart();
  };

  const removeItem = async (itemId: string) => {
    await fetch(`/api/me/cart/${itemId}`, { method: "DELETE" });
    fetchCart();
  };

  const clearAll = async () => {
    await fetch("/api/me/cart", { method: "DELETE" });
    setItems([]);
  };

  // Group by provider
  const groups: Record<string, { provider: CartItem["provider"]; items: CartItem[]; subtotal: number }> = {};
  items.forEach((item) => {
    const pid = item.provider?.id ?? "unknown";
    if (!groups[pid]) groups[pid] = { provider: item.provider, items: [], subtotal: 0 };
    groups[pid].items.push(item);
    groups[pid].subtotal += (item.product?.retail_price ?? 0) * item.quantity;
  });

  const total = items.reduce((s, i) => s + (i.product?.retail_price ?? 0) * i.quantity, 0);
  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Cart ({totalCount})</h1>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-sm text-red-500 hover:text-red-700">
              Clear All
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="mb-4 h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-lg font-medium">Your cart is empty</p>
            <Link href="/shop" className="mt-4 rounded-xl bg-pink-600 px-6 py-3 text-sm font-semibold text-white hover:bg-pink-700">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.values(groups).map((group) => (
              <div key={group.provider?.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50/50 px-5 py-3">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700">{group.provider?.business_name}</span>
                </div>

                <div className="divide-y divide-gray-50">
                  {group.items.map((item) => (
                    <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${!item.in_stock ? "opacity-50" : ""}`}>
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        {item.product?.image_urls?.[0] ? (
                          <Image src={item.product.image_urls[0]} alt="" width={64} height={64} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-gray-300">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{item.product?.name}</p>
                        {item.product?.brand && <p className="text-xs text-gray-400">{item.product.brand}</p>}
                        {!item.in_stock && <p className="text-xs font-semibold text-red-500">Out of stock</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.id, Math.max(1, item.quantity - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.id, Math.min(item.stock_available, item.quantity + 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-24 text-right font-bold text-gray-900">
                        R{((item.product?.retail_price ?? 0) * item.quantity).toFixed(2)}
                      </p>
                      <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-lg font-bold text-pink-600">R{group.subtotal.toFixed(2)}</span>
                </div>
                <div className="px-5 pb-4">
                  <Link
                    href={`/shop/checkout?provider_id=${group.provider?.id}`}
                    className="block w-full py-3 bg-pink-600 text-white text-center rounded-xl font-semibold hover:bg-pink-700 transition-colors"
                  >
                    Checkout — R{group.subtotal.toFixed(2)}
                  </Link>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between rounded-2xl bg-white px-6 py-5 shadow-sm">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-2xl font-extrabold text-pink-600">R{total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
