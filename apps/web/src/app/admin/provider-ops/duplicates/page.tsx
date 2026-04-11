"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Check, X, Mail, Phone, Search } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface DuplicateMatch {
  type: "provider" | "user" | "lead";
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  matched_on: string[];
  confidence: number;
}

interface PossibleDuplicate {
  lead: {
    id: string;
    business_name: string | null;
    email: string | null;
    phone_e164: string | null;
    commercial_stage: string;
    source: string;
  };
  matches: DuplicateMatch[];
}

export default function DuplicateReviewPage() {
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadDuplicates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: PossibleDuplicate[] }>(
        "/api/admin/provider-ops/duplicates",
        { staleTimeMs: 0 }
      );
      setDuplicates(res.data || []);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load duplicates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDuplicates();
  }, [loadDuplicates]);

  const handleConfirmMatch = async (
    leadId: string,
    matchType: string,
    matchId: string
  ) => {
    try {
      if (matchType === "provider") {
        await fetcher.post(
          `/api/admin/provider-ops/leads/${leadId}/activities`,
          {
            activity_type: "match_confirmed",
            description: `Confirmed match to provider ${matchId}`,
            metadata: { matched_provider_id: matchId, match_type: "manual" },
          }
        );
        await fetcher.patch(`/api/admin/provider-ops/leads/${leadId}/stage`, {
          stage: "matched",
        });
      }
      toast.success("Match confirmed");
      loadDuplicates();
    } catch {
      toast.error("Failed to confirm match");
    }
  };

  const handleDismiss = async (leadId: string, matchId: string) => {
    try {
      await fetcher.post(
        `/api/admin/provider-ops/leads/${leadId}/activities`,
        {
          activity_type: "match_rejected",
          description: `Dismissed possible match ${matchId}`,
          metadata: { dismissed_match_id: matchId },
        }
      );
      toast.success("Match dismissed");
      setDuplicates((prev) =>
        prev
          .map((d) => {
            if (d.lead.id !== leadId) return d;
            return { ...d, matches: d.matches.filter((m) => m.id !== matchId) };
          })
          .filter((d) => d.matches.length > 0)
      );
    } catch {
      toast.error("Failed to dismiss");
    }
  };

  const filteredDuplicates = useMemo(() => {
    if (!searchQuery.trim()) return duplicates;
    const q = searchQuery.toLowerCase();
    return duplicates.filter((dup) => {
      const leadName = dup.lead.business_name?.toLowerCase() || "";
      const leadEmail = dup.lead.email?.toLowerCase() || "";
      const leadPhone = dup.lead.phone_e164 || "";
      const matchNames = dup.matches.map((m) => m.name?.toLowerCase() || "").join(" ");
      return (
        leadName.includes(q) ||
        leadEmail.includes(q) ||
        leadPhone.includes(q) ||
        matchNames.includes(q)
      );
    });
  }, [duplicates, searchQuery]);

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Scanning for duplicates..." />
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
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Duplicate Review
          </h1>
          <p className="text-sm text-zinc-500">
            {filteredDuplicates.length} possible duplicate(s) found
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {error && (
          <div className="text-center py-12 text-red-500">{error}</div>
        )}

        {!error && filteredDuplicates.length === 0 && (
          <div className="text-center py-16 text-zinc-400">
            <Check className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No duplicates detected</p>
          </div>
        )}

        <div className="space-y-4">
          {filteredDuplicates.map((dup) => (
            <div
              key={dup.lead.id}
              className="bg-white border rounded-xl overflow-hidden"
            >
              {/* Lead info */}
              <div className="p-4 border-b bg-zinc-50/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-800">
                        Lead: {dup.lead.business_name || "Unnamed"}
                      </h3>
                      <Badge variant="outline" className="text-[10px]">
                        {dup.lead.commercial_stage}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {dup.lead.source}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1">
                      {dup.lead.email && (
                        <span className="flex items-center gap-1 min-w-0 truncate">
                          <Mail className="h-3 w-3 shrink-0" /> {dup.lead.email}
                        </span>
                      )}
                      {dup.lead.phone_e164 && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" /> {dup.lead.phone_e164}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/admin/provider-ops/leads/${dup.lead.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      View Lead
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Matches */}
              <div className="divide-y">
                {dup.matches.map((match) => (
                  <div
                    key={`${match.type}-${match.id}`}
                    className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={`text-[10px] ${
                            match.type === "provider"
                              ? "bg-green-100 text-green-700"
                              : match.type === "user"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {match.type}
                        </Badge>
                        <span className="text-sm font-medium text-zinc-800">
                          {match.name || "Unnamed"}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            match.confidence >= 0.9
                              ? "border-green-300 text-green-700"
                              : match.confidence >= 0.7
                                ? "border-amber-300 text-amber-700"
                                : "border-zinc-300 text-zinc-600"
                          }`}
                        >
                          {Math.round(match.confidence * 100)}% confident
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1">
                        {match.email && (
                          <span className="flex items-center gap-1 min-w-0 truncate">
                            <Mail className="h-3 w-3 shrink-0" /> {match.email}
                          </span>
                        )}
                        {match.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" /> {match.phone}
                          </span>
                        )}
                        <span className="text-zinc-400">
                          Matched on: {match.matched_on.join(", ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() =>
                          handleDismiss(dup.lead.id, match.id)
                        }
                      >
                        <X className="h-3 w-3 mr-1" /> Dismiss
                      </Button>
                      {match.type === "provider" && (
                        <Button
                          size="sm"
                          className="text-xs bg-green-600 hover:bg-green-700"
                          onClick={() =>
                            handleConfirmMatch(
                              dup.lead.id,
                              match.type,
                              match.id
                            )
                          }
                        >
                          <Check className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
