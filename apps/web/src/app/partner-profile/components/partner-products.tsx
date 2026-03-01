"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity: boolean;
}

interface PartnerProductsProps {
  slug: string;
}

export default function PartnerProducts({ slug }: PartnerProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetcher.get<{ data: Product[] }>(
          `/api/public/providers/${encodeURIComponent(slug)}/products`
        );
        if (!cancelled && res?.data) setProducts(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="py-8">
        <LoadingTimeout loadingMessage="Loading shop..." />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-12 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No products available yet</p>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/shop/${p.id}`}
            className="group rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-[#FF0077]/40 hover:shadow-md transition-all"
          >
            <div className="aspect-square bg-gray-100 relative">
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="h-10 w-10 text-gray-300" />
                </div>
              )}
              {!p.inStock && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Out of stock</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="font-medium text-gray-900 text-sm line-clamp-2">{p.name}</p>
              <p className="mt-1 text-sm font-semibold text-[#FF0077]">
                {p.currency} {p.price.toFixed(2)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
