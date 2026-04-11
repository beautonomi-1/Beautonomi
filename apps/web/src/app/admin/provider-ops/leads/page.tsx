"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Upload,
  Download,
  FileDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const PAGE_SIZE = 50;

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

interface PaginatedLeadResponse {
  data: {
    data: Lead[];
    meta: { page: number; limit: number; total: number; has_more: boolean };
    stage_counts: Record<string, number>;
  };
}

export default function LeadListPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState(
    searchParams.get("stage") || "all"
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});

  const [leads, setLeads] = useState<Lead[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    total_rows_in_file: number;
    skipped_empty: number;
    columns_detected: string[];
    warnings: Array<{ row: number; field: string; message: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (activeTab !== "all") params.set("stage", activeTab);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetcher.get<PaginatedLeadResponse>(
        `/api/admin/provider-ops/leads?${params.toString()}`,
        { staleTimeMs: 0 }
      );
      const inner = res.data;
      setLeads(inner.data || []);
      setTotal(inner.meta.total);
      setHasMore(inner.meta.has_more);
      setStageCounts(inner.stage_counts || {});
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeTab, page]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/provider-ops/leads/template?format=with-categories",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to download template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "provider-leads-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  }, []);

  const handleImportFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "csv" && ext !== "tsv" && ext !== "txt") {
        toast.error("Please upload a CSV file (.csv, .tsv, or .txt)");
        return;
      }
      try {
        setImporting(true);
        setImportResult(null);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/admin/provider-ops/leads/import", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const json = await res.json();

        if (!res.ok) {
          toast.error(json.error?.message || "Import failed");
          return;
        }

        const result = json.data;
        setImportResult({
          imported: result.imported,
          total_rows_in_file: result.total_rows_in_file,
          skipped_empty: result.skipped_empty,
          columns_detected: result.columns_detected || [],
          warnings: result.warnings || [],
        });
        toast.success(`Imported ${result.imported} leads`);
        loadLeads();
      } catch {
        toast.error("Import failed unexpectedly");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [loadLeads]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleImportFile(file);
    },
    [handleImportFile]
  );

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("stage", activeTab);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await fetch(
        `/api/admin/provider-ops/leads/export?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provider-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Failed to export leads");
    } finally {
      setExporting(false);
    }
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  return (
    <div
      className={`min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8 transition-colors ${dragOver ? "bg-blue-50/80 ring-2 ring-inset ring-blue-300" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-50/90 pointer-events-none">
          <div className="text-center">
            <Upload className="h-16 w-16 mx-auto text-blue-500 mb-3" />
            <p className="text-lg font-semibold text-blue-700">Drop CSV file to import leads</p>
            <p className="text-sm text-blue-500 mt-1">All columns are optional — import whatever data you have</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Lead Inbox</h1>
            <p className="text-sm text-zinc-500">
              {total.toLocaleString()} leads · Manage your provider pipeline
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadTemplate}
            >
              <FileDown className="h-4 w-4 mr-1" />
              Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              {importing ? "Importing..." : "Import CSV"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={exporting || total === 0}
              onClick={handleExport}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Export
            </Button>
            <Link href="/admin/provider-ops/leads/new">
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-1" />
                New Lead
              </Button>
            </Link>
          </div>
        </div>

        {/* Import Result Banner */}
        {importResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Import complete — {importResult.imported.toLocaleString()} leads imported
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700">
                  <span>{importResult.total_rows_in_file.toLocaleString()} rows in file</span>
                  <span>{importResult.imported.toLocaleString()} imported</span>
                  {importResult.skipped_empty > 0 && (
                    <span>{importResult.skipped_empty} empty rows skipped</span>
                  )}
                </div>
                {importResult.columns_detected.length > 0 && (
                  <p className="text-xs text-emerald-600">
                    Columns detected: {importResult.columns_detected.join(", ")}
                  </p>
                )}
                {importResult.warnings.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-amber-600 cursor-pointer font-medium">
                      {importResult.warnings.length} warning(s) — click to review
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700 max-h-48 overflow-y-auto">
                      {importResult.warnings.slice(0, 50).map((w, i) => (
                        <li key={i} className="flex gap-1">
                          <span className="text-amber-500 shrink-0">Row {w.row}:</span>
                          <span>{w.field} — {w.message}</span>
                        </li>
                      ))}
                      {importResult.warnings.length > 50 && (
                        <li className="text-amber-500 font-medium">
                          ...and {importResult.warnings.length - 50} more warnings
                        </li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="text-xs text-emerald-600 hover:text-emerald-800 shrink-0 ml-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

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
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
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
                  {leads.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <p className="text-xs text-zinc-500">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
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
