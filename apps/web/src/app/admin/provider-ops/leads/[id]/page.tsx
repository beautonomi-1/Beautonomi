"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Tag,
  ChevronDown,
  Send,
  Edit,
  UserPlus,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "nurture",
] as const;

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
  lead_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_national: string | null;
  phone_country_code: string | null;
  commercial_stage: string;
  source: string;
  source_detail: string | null;
  suggested_location_text: string | null;
  resolved_location: Record<string, unknown> | null;
  location_confidence: string | null;
  country: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  assigned_to: string | null;
  is_dormant: boolean;
  lost_reason: string | null;
  matched_provider_id: string | null;
  matched_user_id: string | null;
  reopen_count: number;
  created_at: string;
  updated_at: string;
  provider_lead_categories: Array<{
    global_category_id: string;
    global_service_categories: { id: string; name: string; icon: string | null } | null;
  }>;
  provider_lead_activities: Array<{
    id: string;
    activity_type: string;
    description: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const loadLead = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: Lead }>(
        `/api/admin/provider-ops/leads/${leadId}`,
        { staleTimeMs: 0 }
      );
      setLead(res.data);
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  const handleStageChange = async (newStage: string) => {
    try {
      await fetcher.patch(`/api/admin/provider-ops/leads/${leadId}/stage`, {
        stage: newStage,
      });
      toast.success(`Stage changed to ${newStage.replace(/_/g, " ")}`);
      loadLead();
    } catch {
      toast.error("Failed to change stage");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to permanently delete this lead? This cannot be undone.")) return;
    try {
      await fetch(`/api/admin/provider-ops/leads/${leadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Lead deleted");
      router.push("/admin/provider-ops/leads");
    } catch {
      toast.error("Failed to delete lead");
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setSubmittingNote(true);
      await fetcher.post(`/api/admin/provider-ops/leads/${leadId}/activities`, {
        activity_type: "note_added",
        description: noteText.trim(),
      });
      setNoteText("");
      toast.success("Note added");
      loadLead();
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading lead..." />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>Lead not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/provider-ops/leads")}
        >
          Back to Leads
        </Button>
      </div>
    );
  }

  const displayName =
    lead.business_name || lead.contact_person_name || lead.lead_name || "Unnamed";
  const categories =
    lead.provider_lead_categories
      ?.map((c) => c.global_service_categories)
      .filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/admin/provider-ops/leads"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Leads
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">
                {displayName}
              </h1>
              <Badge
                className={STAGE_COLORS[lead.commercial_stage] || "bg-zinc-100"}
              >
                {lead.commercial_stage.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-zinc-500">
              <span>Source: {lead.source}</span>
              <span className="hidden sm:inline">·</span>
              <span>
                Created {new Date(lead.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stage change dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Change Stage <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STAGES.map((stage) => (
                  <DropdownMenuItem
                    key={stage}
                    onClick={() => handleStageChange(stage)}
                    disabled={stage === lead.commercial_stage}
                  >
                    {stage.replace(/_/g, " ")}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href={`/admin/provider-ops/leads/${leadId}?edit=true`}>
              <Button variant="outline" size="sm">
                <Edit className="h-3 w-3 mr-1" /> Edit
              </Button>
            </Link>

            {!lead.matched_provider_id && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleDelete}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}

            {lead.commercial_stage === "won" && !lead.matched_user_id && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={!lead.email}
                title={!lead.email ? "Lead must have an email before creating an account" : "Create a Supabase Auth account for this lead"}
                onClick={async () => {
                  if (!lead.email) {
                    alert("This lead has no email address. Please add an email before creating an account.");
                    return;
                  }
                  if (!confirm("Create an account for this lead? They will receive a password reset email.")) return;
                  try {
                    const res = await fetcher.post<{ data: { user_id: string; password_reset_sent: boolean } }>(
                      "/api/admin/provider-ops/assist/create-account",
                      {
                        email: lead.email,
                        full_name: lead.contact_person_name || lead.business_name || lead.lead_name,
                        phone: lead.phone_e164 || null,
                        lead_id: lead.id,
                        business_name: lead.business_name || lead.lead_name,
                      }
                    );
                    toast.success(
                      res.data.password_reset_sent
                        ? "Account created! Password reset email sent."
                        : "Account created! Password reset email could not be sent — user can use forgot-password."
                    );
                    router.push(`/admin/provider-ops/tracker/${res.data.user_id}`);
                  } catch (err) {
                    toast.error(
                      err instanceof FetchError
                        ? err.message
                        : "Failed to create account. Check if email already exists."
                    );
                  }
                }}
              >
                <UserPlus className="h-3 w-3 mr-1" /> Create Account
              </Button>
            )}
          </div>
        </div>

        {/* Matched provider banner */}
        {lead.matched_provider_id && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-800">
                Matched to a provider
              </p>
              <p className="text-xs text-teal-600">
                This lead has been linked to a self-serve signup
              </p>
            </div>
            <Link href={`/admin/providers/${lead.matched_provider_id}`}>
              <Button variant="outline" size="sm">
                View Provider <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Contact info */}
          <div className="space-y-4">
            {/* Contact Card */}
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                Contact
              </h2>
              {lead.contact_person_name && (
                <p className="text-sm text-zinc-700">
                  {lead.contact_person_name}
                </p>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  {lead.email}
                </a>
              )}
              {lead.phone_e164 && (
                <a
                  href={`tel:${lead.phone_e164}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {lead.phone_e164}
                </a>
              )}
            </div>

            {/* Location Card */}
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                Location
              </h2>
              {lead.suggested_location_text ? (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-zinc-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-zinc-700">
                      {lead.suggested_location_text}
                    </p>
                    {lead.country && (
                      <p className="text-xs text-zinc-400 mt-1">
                        {lead.country}
                      </p>
                    )}
                    {lead.location_confidence && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] mt-1 ${
                          lead.location_confidence === "high"
                            ? "bg-green-100 text-green-700"
                            : lead.location_confidence === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {lead.location_confidence} confidence
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No location set</p>
              )}
            </div>

            {/* Categories */}
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                Categories
              </h2>
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <Badge
                      key={cat!.id}
                      variant="secondary"
                      className="text-xs"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {cat!.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No categories</p>
              )}
            </div>

            {/* Description / Notes */}
            {(lead.description || lead.notes) && (
              <div className="bg-white border rounded-xl p-5 space-y-3">
                {lead.description && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                      Description
                    </h2>
                    <p className="text-sm text-zinc-600">{lead.description}</p>
                  </div>
                )}
                {lead.notes && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                      Notes
                    </h2>
                    <p className="text-sm text-zinc-600 whitespace-pre-wrap">
                      {lead.notes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            {lead.tags?.length > 0 && (
              <div className="bg-white border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                  Tags
                </h2>
                <div className="flex flex-wrap gap-1">
                  {lead.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column - Timeline */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4 space-y-4">
                {/* Add note */}
                <div className="bg-white border rounded-xl p-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddNote()
                      }
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={submittingNote || !noteText.trim()}
                      className="w-full sm:w-auto"
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Activity timeline */}
                <div className="bg-white border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-zinc-700 mb-4">
                    Activity
                  </h2>
                  <div className="space-y-4">
                    {(lead.provider_lead_activities || []).length === 0 ? (
                      <p className="text-sm text-zinc-400 text-center py-4">
                        No activity yet
                      </p>
                    ) : (
                      lead.provider_lead_activities.map((activity) => (
                        <ActivityItem
                          key={activity.id}
                          activity={activity}
                        />
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="details" className="mt-4">
                <div className="bg-white border rounded-xl p-5 space-y-3">
                  <DetailRow label="Lead ID" value={lead.id} />
                  <DetailRow label="Source" value={lead.source} />
                  <DetailRow
                    label="Source Detail"
                    value={lead.source_detail || "—"}
                  />
                  <DetailRow
                    label="Assigned To"
                    value={lead.assigned_to || "Unassigned"}
                  />
                  <DetailRow
                    label="Dormant"
                    value={lead.is_dormant ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="Reopen Count"
                    value={String(lead.reopen_count)}
                  />
                  <DetailRow
                    label="Lost Reason"
                    value={lead.lost_reason || "—"}
                  />
                  <DetailRow
                    label="Created"
                    value={new Date(lead.created_at).toLocaleString()}
                  />
                  <DetailRow
                    label="Updated"
                    value={new Date(lead.updated_at).toLocaleString()}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({
  activity,
}: {
  activity: {
    id: string;
    activity_type: string;
    description: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  };
}) {
  const typeColors: Record<string, string> = {
    stage_changed: "bg-violet-400",
    note_added: "bg-blue-400",
    lead_created: "bg-green-400",
    lead_updated: "bg-amber-400",
    match_confirmed: "bg-teal-400",
    call_made: "bg-cyan-400",
    sms_sent: "bg-indigo-400",
    assignment_changed: "bg-purple-400",
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-2.5 h-2.5 rounded-full mt-1.5 ${typeColors[activity.activity_type] || "bg-zinc-300"}`}
        />
        <div className="w-px flex-1 bg-zinc-200" />
      </div>
      <div className="pb-4 min-w-0">
        <p className="text-sm text-zinc-700">
          {activity.description ||
            activity.activity_type.replace(/_/g, " ")}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {new Date(activity.created_at).toLocaleDateString()} ·{" "}
          {new Date(activity.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-700 text-right max-w-[60%] break-all">
        {value}
      </span>
    </div>
  );
}
