"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

export default function ActivationQueuePage() {
  const [providers, setProviders] = useState<ActivationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: ActivationProvider[] }>(
        "/api/admin/provider-ops/activation-queue",
        { staleTimeMs: 0 }
      );
      setProviders(res.data || []);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load activation queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = async (providerId: string) => {
    try {
      await fetcher.patch(`/api/admin/providers/${providerId}`, {
        status: "active",
      });
      toast.success("Provider activated");
      loadQueue();
    } catch {
      toast.error("Failed to activate provider");
    }
  };

  if (loading) {
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
            {providers.length} providers awaiting approval
          </p>
        </div>

        {error && (
          <div className="text-center py-12 text-red-500">{error}</div>
        )}

        {!error && providers.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No providers pending approval</p>
          </div>
        )}

        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="bg-white border rounded-xl p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
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
                        {p.days_waiting}d waiting
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {p.owner_name || p.owner_email} ·{" "}
                    Submitted {new Date(p.created_at).toLocaleDateString()}
                  </p>

                  {/* Activation gates */}
                  <div className="flex gap-3 mt-3">
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

                <div className="flex gap-2">
                  <Link href={`/admin/providers/${p.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" /> View
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    className="text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(p.id)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
