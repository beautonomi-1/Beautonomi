"use client";

import { useState, useEffect, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  Banknote,
  CreditCard,
  X,
  User,
  Phone,
  History,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  retail_price: number;
  quantity: number;
  image_urls: string[];
  is_active: boolean;
}

interface CartItem {
  product: Product;
  qty: number;
}

interface WalkInOrder {
  id: string;
  order_number: string;
  total_amount: number;
  payment_method: string;
  customer_name: string | null;
  created_at: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
}

export default function WalkInSalePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "yoco">("cash");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; total: number } | null>(null);
  const [error, setError] = useState("");
  const [recentSales, setRecentSales] = useState<WalkInOrder[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetcher.get<{ data: { products: Product[] } }>("/api/provider/products?limit=200");
    if (res?.data?.products) {
      setProducts(res.data.products.filter((p) => p.is_active && p.quantity > 0));
    }
    setLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetcher.get<{ data: { sales: WalkInOrder[] } }>(
      "/api/provider/product-sales?limit=20",
    );
    if (res?.data?.sales) setRecentSales(res.data.sales);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchProducts(), 0);
    return () => clearTimeout(id);
  }, [fetchProducts]);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(search.toLowerCase())),
  );

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.quantity) return prev;
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const newQty = c.qty + delta;
          if (newQty <= 0) return null;
          if (newQty > c.product.quantity) return c;
          return { ...c, qty: newQty };
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const total = cart.reduce((s, c) => s + c.product.retail_price * c.qty, 0);

  const handleSale = async () => {
    if (cart.length === 0 || processing) return;
    setProcessing(true);
    setError("");

    try {
      const res = await fetcher.post<{
        data: { order: { order_number: string } };
        error?: string;
      }>("/api/provider/product-sales", {
        items: cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.qty,
        })),
        payment_method: paymentMethod,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
      });

      if (res?.data?.order) {
        setSuccess({ orderNumber: res.data.order.order_number, total });
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        fetchProducts();
      } else {
        setError((res as any)?.error || "Failed to process sale");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    }
    setProcessing(false);
  };

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Sale Complete!</h2>
        <p className="mb-1 text-gray-600">Order: {success.orderNumber}</p>
        <p className="mb-6 text-2xl font-bold text-pink-600">
          R{success.total.toFixed(2)}
        </p>
        <button
          onClick={() => setSuccess(null)}
          className="rounded-xl bg-pink-600 px-8 py-3 font-semibold text-white hover:bg-pink-700 transition-colors"
        >
          New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Walk-in Sale</h1>
            <p className="text-sm text-gray-500">Process in-person product sales (cash or Yoco)</p>
          </div>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            {showHistory ? "Back to POS" : "Sales History"}
          </button>
        </div>

        {showHistory ? (
          <div className="space-y-4">
            {recentSales.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <History className="mx-auto mb-4 h-12 w-12" />
                <p>No walk-in sales yet</p>
              </div>
            ) : (
              recentSales.map((sale) => (
                <div key={sale.id} className="rounded-xl bg-white border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold text-gray-900">{sale.order_number}</span>
                      {sale.customer_name && (
                        <span className="ml-3 text-sm text-gray-500">{sale.customer_name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-pink-600">R{Number(sale.total_amount).toFixed(2)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(sale.created_at).toLocaleString("en-ZA")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {sale.payment_method === "cash" ? (
                      <Banknote className="h-3.5 w-3.5" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    <span className="capitalize">{sale.payment_method}</span>
                    <span className="text-gray-300">·</span>
                    <span>{sale.items?.length ?? 0} item(s)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Product catalog - left */}
            <div className="lg:col-span-3">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400">No products in stock</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {filtered.map((product) => {
                    const inCart = cart.find((c) => c.product.id === product.id);
                    return (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="group relative overflow-hidden rounded-xl border bg-white p-3 text-left transition hover:border-pink-300 hover:shadow-sm"
                      >
                        {inCart && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-pink-600 text-xs font-bold text-white">
                            {inCart.qty}
                          </span>
                        )}
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                          {product.name}
                        </p>
                        {product.brand && (
                          <p className="text-xs text-gray-400">{product.brand}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-bold text-pink-600">
                            R{product.retail_price.toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {product.quantity} in stock
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart - right */}
            <div className="lg:col-span-2">
              <div className="sticky top-6 rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-5 py-4">
                  <h2 className="flex items-center gap-2 font-bold text-gray-900">
                    <ShoppingCart className="h-5 w-5" />
                    Sale ({cart.reduce((s, c) => s + c.qty, 0)})
                  </h2>
                </div>

                {cart.length === 0 ? (
                  <div className="px-5 py-10 text-center text-gray-400 text-sm">
                    Tap products to add them
                  </div>
                ) : (
                  <div className="max-h-[320px] divide-y overflow-y-auto px-5">
                    {cart.map((item) => (
                      <div key={item.product.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            R{item.product.retail_price.toFixed(2)} each
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateQty(item.product.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-50"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold">{item.qty}</span>
                          <button
                            onClick={() => updateQty(item.product.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="w-20 text-right text-sm font-semibold text-gray-900">
                          R{(item.product.retail_price * item.qty).toFixed(2)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-gray-300 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Customer info (optional) */}
                <div className="border-t px-5 py-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer name (optional)"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none"
                      />
                    </div>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Payment method */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                        paymentMethod === "cash"
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Banknote className="h-4 w-4" />
                      Cash
                    </button>
                    <button
                      onClick={() => setPaymentMethod("yoco")}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                        paymentMethod === "yoco"
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <CreditCard className="h-4 w-4" />
                      Yoco Card
                    </button>
                  </div>
                </div>

                {/* Total + confirm */}
                <div className="border-t px-5 py-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-2xl font-extrabold text-pink-600">
                      R{total.toFixed(2)}
                    </span>
                  </div>

                  {error && (
                    <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSale}
                    disabled={cart.length === 0 || processing}
                    className="w-full rounded-xl bg-pink-600 py-3.5 text-center font-bold text-white transition-colors hover:bg-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Complete Sale — R${total.toFixed(2)}`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
