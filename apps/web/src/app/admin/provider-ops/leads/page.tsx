"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  UserPlus,
  Search,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
  Tag,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const STAGES = [
  "all",
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "nurture",
  "matched",
] as const;

const STAGE_LABELS: Record<string, string> = {
  all: "All",
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
  matched: "Matched",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-cyan-100 text-cyan-700",
  qualified: "bg-emerald-100 text-emerald-700",
  proposal_sent: "bg-violet-100 text-violet-700",
  negotiating: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  nurture: "bg-amber-100 text-amber-700",
  matched: "bg-teal-100 text-teal-700",
};

interface Lead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_national: string | null;
  phone_country_code: string | null;
  commercial_stage: string;
  source: string;
  suggested_location_text: string | null;
  country: string | null;
  location_confidence: string | null;
  tags: string[];
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  matched_provider_id: string | null;
  provider_lead_categories: Array<{
    global_category_id: string;
    global_service_categories: { id: string; name: string; icon: string | null } | null;
  }>;
}

export default function LeadListPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(
    searchParams.get("stage") || "all"
  );

  const [allLeads, setAllLeads] = useState<Lead[]>([]);

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "500");

      const res = await fetcher.get<{ data: Lead[] }>(
        `/api/admin/provider-ops/leads?${params.toString()}`,
        { staleTimeMs: 0 }
      );
      setAllLeads(res.data || []);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const debounce = setTimeout(() => loadLeads(), 300);
    return () => clearTimeout(debounce);
  }, [loadLeads]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allLeads.length };
    for (const lead of allLeads) {
      counts[lead.commercial_stage] =
        (counts[lead.commercial_stage] || 0) + 1;
    }
    return counts;
  }, [allLeads]);

  const leads = useMemo(() => {
    if (activeTab === "all") return allLeads;
    return allLeads.filter((l) => l.commercial_stage === activeTab);
  }, [allLeads, activeTab]);

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Lead Inbox</h1>
            <p className="text-sm text-zinc-500">
              {leads.length} leads · Manage your provider pipeline
            </p>
          </div>
          <Link href="/admin/provider-ops/leads/new">
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-1" />
              New Lead
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stage Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {STAGES.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                className="text-xs px-3 py-1.5"
              >
                {STAGE_LABELS[stage]}
                {stageCounts[stage] ? (
                  <span className="ml-1 text-zinc-400">
                    ({stageCounts[stage]})
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {STAGES.map((stage) => (
            <TabsContent key={stage} value={stage} className="mt-4">
              {loading ? (
                <LoadingTimeout loadingMessage="Loading leads..." />
              ) : error ? (
                <div className="text-center py-12 text-red-500">{error}</div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No leads found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leads
                    .filter(
                      (l) =>
                        stage === "all" || l.commercial_stage === stage
                    )
                    .map((lead) => (
                      <LeadRow key={lead.id} lead={lead} />
                    ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const name = lead.business_name || lead.contact_person_name || "Unnamed Lead";
  const categories =
    lead.provider_lead_categories
      ?.map((c) => c.global_service_categories?.name)
      .filter(Boolean) || [];

  return (
    <Link href={`/admin/provider-ops/leads/${lead.id}`}>
      <div className="bg-white border rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-zinc-900 truncate">
                {name}
              </h3>
              <Badge
                className={`text-[10px] shrink-0 ${STAGE_COLORS[lead.commercial_stage] || "bg-zinc-100 text-zinc-600"}`}
              >
                {lead.commercial_stage.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {lead.source}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              {lead.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {lead.email}
                </span>
              )}
              {lead.phone_e164 && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {lead.phone_e164}
                </span>
              )}
              {(lead.suggested_location_text || lead.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.suggested_location_text || lead.country}
                  {lead.location_confidence && (
                    <ConfidenceDot confidence={lead.location_confidence} />
                  )}
                </span>
              )}
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant="secondary"
                    className="text-[10px] bg-zinc-100"
                  >
                    <Tag className="h-2.5 w-2.5 mr-0.5" />
                    {cat}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="text-right shrink-0 ml-4">
            <p className="text-xs text-zinc-400">
              {new Date(lead.created_at).toLocaleDateString()}
            </p>
            <ArrowRight className="h-4 w-4 text-zinc-300 mt-2 ml-auto" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    high: "bg-green-400",
    medium: "bg-amber-400",
    low: "bg-red-400",
    none: "bg-zinc-300",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[confidence] || "bg-zinc-300"}`}
      title={`Location confidence: ${confidence}`}
    />
  );
}
