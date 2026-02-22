"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Package, ChevronLeft, ChevronRight } from "lucide-react";
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
  provider: { id: string; business_name: string };
}

export default function AdminProductCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (category) params.set("category", category);

      const res = await fetcher.get<{
        data: {
          products: Product[];
          categories: string[];
          pagination: { totalPages: number; total: number };
        };
      }>(`/api/public/products?${params}`);

      if (res?.data) {
        setProducts(res.data.products);
        setCategories(res.data.categories);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch {
      /* handled by empty state */
    }
    setLoading(false);
  }, [page, search, category]);

  useEffect(() => {
    const t = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          View all products across the platform. Providers manage their own inventory.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No products found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Retail</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
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
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{p.name}</p>
                        {p.brand && <p className="text-xs text-gray-500">{p.brand}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.provider?.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.category ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">R{Number(p.retail_price).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={p.quantity <= 5 ? "text-red-600 font-medium" : "text-gray-700"}>
                      {p.quantity}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
