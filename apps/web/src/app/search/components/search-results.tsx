"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import Pagination from "@/components/ui/pagination";
import FilterBar from "@/components/ui/filter-bar";
import ProviderCard from "@/app/home/components/provider-card";
import type { SearchResult, Category } from "@/types/beautonomi";
import { Map, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface SearchResultsProps {
  initialResults?: SearchResult;
}

export default function SearchResults({ initialResults }: SearchResultsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [results, setResults] = useState<SearchResult | null>(initialResults || null);
  const [isLoading, setIsLoading] = useState(!initialResults);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string | string[]>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [_categoriesLoading, setCategoriesLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetcher.get<{ data: Category[]; error: null }>("/api/public/categories");
        setCategories(response.data || []);
      } catch (err) {
        console.error("Error loading categories:", err);
        // Fall back to empty categories on error
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  // Build category filter options dynamically
  const categoryFilterOptions = useMemo(() => {
    const options = [{ label: "All", value: "" }];
    categories.forEach((cat) => {
      options.push({ label: cat.name, value: cat.slug });
    });
    return options;
  }, [categories]);

  // Initialize filters from URL params
  useEffect(() => {
    const filters: Record<string, string | string[]> = {};
    searchParams.forEach((value, key) => {
      if (key === "category" || key === "subcategory" || key === "service") {
        filters[key] = value;
      } else if (key === "price_min" || key === "price_max" || key === "rating_min") {
        filters[key] = value;
      } else if (key === "at_home") {
        filters[key] = value === "true" ? "true" : "";
      }
    });
    setSelectedFilters(filters);
  }, [searchParams]);

  // Fetch results when filters change
  useEffect(() => {
    const fetchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Build query string from search params
        const queryString = searchParams.toString();
        const response = await fetcher.get<{
          data: SearchResult;
          error: null;
        }>(`/api/public/search?${queryString}`);

        setResults(response.data);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to search providers";
        setError(errorMessage);
        console.error("Error searching:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!initialResults) {
      fetchResults();
    }
  }, [searchParams, initialResults]);

  // Initialize Mapbox map when switching to map view
  useEffect(() => {
    if (viewMode !== "map" || !mapContainerRef.current) return;

    // Clean up any existing map before creating a new one
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [28.0473, -26.2041], // Johannesburg default
      zoom: 11,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add markers for each provider result
    const bounds = new mapboxgl.LngLatBounds();
    let hasMarkers = false;

    results?.providers?.forEach((provider: any) => {
      if (provider.latitude && provider.longitude) {
        hasMarkers = true;
        const lngLat: [number, number] = [provider.longitude, provider.latitude];
        bounds.extend(lngLat);

        new mapboxgl.Marker({ color: "#FF0077" })
          .setLngLat(lngLat)
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div style="padding:4px"><h3 style="font-weight:600;margin:0 0 4px">${provider.business_name || provider.name || "Provider"}</h3>${provider.address ? `<p style="margin:0;font-size:12px;color:#666">${provider.address}</p>` : ""}</div>`
            )
          )
          .addTo(map);
      }
    });

    // Fit map to markers if we have any
    if (hasMarkers) {
      map.once("load", () => {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [viewMode, results]);

  const handleFilterChange = (key: string, value: string | string[]) => {
    const newFilters = { ...selectedFilters, [key]: value };
    setSelectedFilters(newFilters);

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    if (value === "" || (Array.isArray(value) && value.length === 0)) {
      params.delete(key);
    } else if (Array.isArray(value)) {
      params.delete(key);
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }

    router.push(`/search?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSelectedFilters({});
    router.push("/search");
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/search?${params.toString()}`);
  };

  const handleSortChange = (sortBy: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort_by", sortBy);
    router.push(`/search?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Searching providers..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Search failed"
          description={error}
          action={{
            label: "Retry",
            onClick: () => window.location.reload(),
          }}
        />
      </div>
    );
  }

  if (!results || results.providers.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <FilterBar
          filters={[
            {
              label: "Category",
              key: "category",
              options: categoryFilterOptions,
            },
            {
              label: "Price Range",
              key: "price_min",
              options: [
                { label: "Any", value: "" },
                { label: "Under R100", value: "0" },
                { label: "R100-R500", value: "100" },
                { label: "R500+", value: "500" },
              ],
            },
            {
              label: "Rating",
              key: "rating_min",
              options: [
                { label: "Any", value: "" },
                { label: "4+ Stars", value: "4" },
                { label: "3+ Stars", value: "3" },
              ],
            },
          ]}
          selectedFilters={selectedFilters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
        <EmptyState
          title="No providers found"
          description="Try adjusting your search filters"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Filters and View Toggle */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <FilterBar
            filters={[
              {
                label: "Category",
                key: "category",
                options: categoryFilterOptions,
              },
              {
                label: "Price Range",
                key: "price_min",
                options: [
                  { label: "Any", value: "" },
                  { label: "Under R100", value: "0" },
                  { label: "R100-R500", value: "100" },
                  { label: "R500+", value: "500" },
                ],
              },
              {
                label: "Rating",
                key: "rating_min",
                options: [
                  { label: "Any", value: "" },
                  { label: "4+ Stars", value: "4" },
                  { label: "3+ Stars", value: "3" },
                ],
              },
            ]}
            selectedFilters={selectedFilters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
          />
        </div>

        {/* Sort and View Toggle */}
        <div className="flex items-center gap-4">
          <select
            value={searchParams.get("sort_by") || "relevance"}
            onChange={(e) => handleSortChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="relevance">Relevance</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="rating">Rating</option>
            <option value="soonest">Soonest Available</option>
          </select>

          <div className="flex border border-gray-300 rounded-md overflow-hidden">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "map" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("map")}
              className="rounded-none"
            >
              <Map className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        {results.total} {results.total === 1 ? "provider" : "providers"} found
      </div>

      {/* Results Grid */}
      {viewMode === "list" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {results.providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>

          {/* Pagination */}
          {results.total > results.limit && (
            <Pagination
              currentPage={results.page}
              totalPages={Math.ceil(results.total / results.limit)}
              onPageChange={handlePageChange}
            />
          )}
        </>
      ) : (
        <div className="h-[600px] rounded-lg overflow-hidden border">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
