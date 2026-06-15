"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type ActivationStage = "pending" | "draft" | "all";

const STAGE_TABS: { key: ActivationStage; label: string }[] = [
  { key: "pending", label: "Pending Approval" },
  { key: "draft", label: "Drafts" },
  { key: "all", label: "All" },
];

interface ActivationProvider {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  status: string;
  is_verified: boolean;
  onboarding_state: string | null;
  created_at: string;
  provider_locations: Array<{
    id: string;
    city: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
  }>;
  owner_name: string | null;
  owner_email: string | null;
  activation_gates: {
    has_location: boolean;
    has_business_name: boolean;
    is_verified: boolean;
  };
  ready_to_activate: boolean;
  days_waiting: number;
}

const PAGE_SIZE = 50;

export default function ActivationQueuePage() {
  const [providers, setProviders] = useState<ActivationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stage, setStage] = useState<ActivationStage>("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("stage", stage);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetcher.get<{
        data: {
          data: ActivationProvider[];
          meta: { page: number; limit: number; total: number; has_more: boolean };
        };
      }>(
        `/api/admin/provider-ops/activation-queue?${params.toString()}`,
        { staleTimeMs: 0 }
      );
      const inner = res.data;
      setProviders(inner.data || []);
      setTotal(inner.meta.total);
      setHasMore(inner.meta.has_more);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load activation queue");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [debouncedSearch, page, stage]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = async (provider: ActivationProvider) => {
    if (!provider.ready_to_activate) {
      const missing: string[] = [];
      if (!provider.activation_gates.has_business_name) missing.push("Business name");
      if (!provider.activation_gates.has_location) missing.push("Location");
      if (!provider.activation_gates.is_verified) missing.push("Verification");
      const proceed = window.confirm(
        `${provider.business_name || "This provider"} has not met all activation requirements.\n\n` +
          `Missing: ${missing.join(", ")}\n\n` +
          `Activating now overrides these checks. Continue anyway?`
      );
      if (!proceed) return;
    }
    try {
      await fetcher.patch(`/api/admin/providers/${provider.id}`, {
        status: "active",
      });
      toast.success("Provider activated");
      loadQueue();
    } catch {
      toast.error("Failed to activate provider");
    }
  };

  if (loading && !hasLoaded) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading activation queue..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <Link
            href="/admin/provider-ops"
            className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Provider Ops
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            Activation Queue
          </h1>
          <p className="text-sm text-zinc-500">
            {total}{" "}
            {stage === "draft"
              ? "incomplete draft profiles"
              : stage === "all"
                ? "providers in onboarding"
                : "providers awaiting approval"}
          </p>
        </div>

        {/* Stage filter */}
        <Tabs
          value={stage}
          onValueChange={(v) => {
            setStage(v as ActivationStage);
            setPage(1);
          }}
        >
          <TabsList className="flex flex-wrap h-auto gap-1">
            {STAGE_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs px-3 py-1.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by business name, owner name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {error && (
          <div className="text-center py-12 text-red-500">{error}</div>
        )}

        {!error && providers.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>
              {stage === "draft"
                ? "No incomplete draft profiles"
                : stage === "all"
                  ? "No providers in onboarding"
                  : "No providers pending approval"}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="bg-white border rounded-xl p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {p.business_name}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-100 text-amber-700"
                    >
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                    {p.days_waiting > 3 && (
                      <Badge className="text-[10px] bg-red-100 text-red-700">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {p.days_waiting}d in queue
                      </Badge>
                    )}
                    {p.ready_to_activate ? (
                      <Badge className="text-[10px] bg-green-100 text-green-700">
                        Ready
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-zinc-100 text-zinc-600">
                        Incomplete
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {p.owner_name || p.owner_email} ·{" "}
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </p>

                  {/* Activation gates */}
                  <div className="flex flex-wrap gap-x-3 gap-y-2 mt-3">
                    <Gate
                      label="Business Name"
                      ok={p.activation_gates.has_business_name}
                    />
                    <Gate
                      label="Location"
                      ok={p.activation_gates.has_location}
                    />
                    <Gate
                      label="Verified"
                      ok={p.activation_gates.is_verified}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
                  <Link href={`/admin/providers/${p.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" /> View
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    className={`text-xs ${
                      p.ready_to_activate
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-amber-500 hover:bg-amber-600"
                    }`}
                    onClick={() => handleApprove(p)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {p.ready_to_activate ? "Approve" : "Override & Approve"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <p className="text-xs text-zinc-500">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Gate({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs ${ok ? "text-green-600" : "text-red-500"}`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
