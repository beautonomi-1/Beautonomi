"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, GripVertical, Phone, Mail, MapPin } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "border-blue-300 bg-blue-50" },
  { key: "contacted", label: "Contacted", color: "border-cyan-300 bg-cyan-50" },
  {
    key: "qualified",
    label: "Qualified",
    color: "border-emerald-300 bg-emerald-50",
  },
  {
    key: "proposal_sent",
    label: "Proposal Sent",
    color: "border-violet-300 bg-violet-50",
  },
  {
    key: "negotiating",
    label: "Negotiating",
    color: "border-purple-300 bg-purple-50",
  },
  { key: "won", label: "Won", color: "border-green-300 bg-green-50" },
] as const;

interface Lead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string;
  source: string;
  suggested_location_text: string | null;
  country: string | null;
  created_at: string;
}

export default function PipelineBoardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: { data: Lead[] } }>(
        "/api/admin/provider-ops/leads?limit=500",
        { staleTimeMs: 0 }
      );
      setLeads(res.data?.data || []);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (targetStage: string) => {
    setDragOverStage(null);
    if (!draggedLead || draggedLead.commercial_stage === targetStage) {
      setDraggedLead(null);
      return;
    }

    const oldStage = draggedLead.commercial_stage;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) =>
        l.id === draggedLead.id
          ? { ...l, commercial_stage: targetStage }
          : l
      )
    );
    setDraggedLead(null);

    try {
      await fetcher.patch(
        `/api/admin/provider-ops/leads/${draggedLead.id}/stage`,
        { stage: targetStage }
      );
      toast.success(
        `Moved to ${targetStage.replace(/_/g, " ")}`
      );
    } catch {
      // Revert
      setLeads((prev) =>
        prev.map((l) =>
          l.id === draggedLead!.id
            ? { ...l, commercial_stage: oldStage }
            : l
        )
      );
      toast.error("Failed to change stage");
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading pipeline..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-zinc-500">{error}</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-full mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/admin/provider-ops"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900">
              Pipeline Board
            </h1>
            <p className="text-sm text-zinc-500">
              Drag leads between stages to update their status
            </p>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}>
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter(
              (l) => l.commercial_stage === stage.key
            );
            const isOver = dragOverStage === stage.key;

            return (
              <div
                key={stage.key}
                className={`flex-shrink-0 w-72 rounded-xl border-2 transition-colors ${
                  isOver
                    ? "border-blue-400 bg-blue-50/50"
                    : stage.color
                }`}
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(stage.key)}
              >
                <div className="p-3 border-b bg-white/60 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-700">
                      {stage.label}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      {stageLeads.length}
                    </Badge>
                  </div>
                </div>

                <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] max-h-[calc(100dvh-280px)] overflow-y-auto">
                  {stageLeads.map((lead) => (
                    <PipelineCard
                      key={lead.id}
                      lead={lead}
                      onDragStart={() => handleDragStart(lead)}
                    />
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-xs text-zinc-400 text-center py-8">
                      No leads
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PipelineCard({
  lead,
  onDragStart,
}: {
  lead: Lead;
  onDragStart: () => void;
}) {
  const name =
    lead.business_name || lead.contact_person_name || "Unnamed Lead";

  return (
    <Link href={`/admin/provider-ops/leads/${lead.id}`}>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart();
        }}
        className="bg-white border rounded-lg p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-zinc-300 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-800 truncate">
              {name}
            </p>
            <div className="flex flex-col gap-0.5 mt-1">
              {lead.email && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1 truncate">
                  <Mail className="h-2.5 w-2.5" /> {lead.email}
                </span>
              )}
              {lead.phone_e164 && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5" /> {lead.phone_e164}
                </span>
              )}
              {lead.suggested_location_text && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1 truncate">
                  <MapPin className="h-2.5 w-2.5" />{" "}
                  {lead.suggested_location_text}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <Badge variant="outline" className="text-[9px]">
                {lead.source}
              </Badge>
              <span className="text-[9px] text-zinc-300">
                {new Date(lead.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
