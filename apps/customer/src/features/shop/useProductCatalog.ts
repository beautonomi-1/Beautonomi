import { useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string | null;
  brand: string | null;
  category: string | null;
  retail_price: number;
  image_urls: string[];
  short_description: string | null;
  quantity: number;
  tags: string[];
  created_at: string;
  provider: {
    id: string;
    business_name: string;
    slug: string;
    logo_url: string | null;
  };
}

export interface CatalogFilters {
  search?: string | null;
  category?: string | null;
  provider_id?: string | null;
  tags?: string | null;
  sort?: "newest" | "price_asc" | "price_desc" | "name";
}

interface CatalogResponse {
  products: CatalogProduct[];
  categories: string[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useProductCatalog() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const filtersRef = useRef<CatalogFilters>({});
  const initialDone = useRef(false);

  const load = useCallback(
    async (opts?: { refresh?: boolean; append?: boolean; filters?: CatalogFilters }) => {
      const isRefresh = opts?.refresh;
      const isAppend = opts?.append;

      if (opts?.filters !== undefined) filtersRef.current = opts.filters;

      if (isRefresh) {
        setRefreshing(true);
        setPage(1);
      } else if (isAppend) {
        setLoadingMore(true);
      } else if (initialDone.current && !opts?.filters) {
        return;
      } else {
        setLoading(true);
      }
      setError(null);

      const currentPage = isAppend ? page + 1 : 1;
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "24");

      const f = filtersRef.current;
      if (f.search) params.set("search", f.search);
      if (f.category) params.set("category", f.category);
      if (f.provider_id) params.set("provider_id", f.provider_id);
      if (f.tags) params.set("tags", f.tags);
      if (f.sort) params.set("sort", f.sort);

      const res = await api.get<CatalogResponse>(`/api/public/products?${params}`);

      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        const d = res.data;
        if (isAppend) {
          setProducts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...d.products.filter((p) => !ids.has(p.id))];
          });
        } else {
          setProducts(d.products);
        }
        setCategories(d.categories);
        setPage(d.pagination.page);
        setTotalPages(d.pagination.totalPages);
      }

      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      initialDone.current = true;
    },
    [page],
  );

  return {
    products,
    categories,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: page < totalPages,
    refetch: () => load({ refresh: true }),
    loadMore: () => {
      if (page < totalPages && !loadingMore) load({ append: true });
    },
    initialLoad: () => load({}),
    applyFilters: (f: CatalogFilters) => load({ refresh: true, filters: f }),
  };
}
