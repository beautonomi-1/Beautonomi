"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Store, Plus, Search, Package } from "lucide-react";
import Image from "next/image";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  retail_price: number;
  quantity: number;
  image_urls: string[];
  is_active: boolean;
  retail_sales_enabled: boolean;
  created_at: string;
}

export default function ProviderProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data: { products: Product[] } }>(
        "/api/provider/products?limit=200",
      );
      if (res?.data) {
        setProducts(res.data.products ?? []);
      }
    } catch {
      /* handled by loading state */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchProducts(), 0);
    return () => clearTimeout(id);
  }, [fetchProducts]);

  const filtered = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.brand?.toLowerCase().includes(search.toLowerCase()) ||
          p.category?.toLowerCase().includes(search.toLowerCase()),
      )
    : products;

  const retailCount = products.filter((p) => p.retail_sales_enabled).length;
  const internalCount = products.filter((p) => !p.retail_sales_enabled).length;
  const lowStockCount = products.filter((p) => p.quantity <= 5 && p.quantity > 0).length;
  const outOfStockCount = products.filter((p) => p.quantity === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your product inventory and retail settings
          </p>
        </div>
        <Link
          href="/provider/catalogue/products"
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">For Sale (Retail)</p>
          <p className="text-2xl font-bold text-pink-600">{retailCount}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Internal Only</p>
          <p className="text-2xl font-bold text-gray-600">{internalCount}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Low / Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">
            {lowStockCount + outOfStockCount}
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No products found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Sale Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_urls?.[0] ? (
                        <Image
                          src={p.image_urls[0]}
                          alt={p.name}
                          width={40}
                          height={40}
                          className="rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {p.brand && <p className="text-xs text-gray-500">{p.brand}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.category ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold">R{Number(p.retail_price).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.quantity === 0
                          ? "text-red-600 font-semibold"
                          : p.quantity <= 5
                          ? "text-amber-600 font-medium"
                          : "text-gray-700"
                      }
                    >
                      {p.quantity === 0 ? "Out of stock" : p.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.is_active ? "default" : "outline"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {p.retail_sales_enabled ? (
                      <Badge className="bg-pink-100 text-pink-700 border-0">For Sale</Badge>
                    ) : (
                      <Badge variant="outline">Internal</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
