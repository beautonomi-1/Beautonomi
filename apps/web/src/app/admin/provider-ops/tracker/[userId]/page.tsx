"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Save,
  Wrench,
  Clock,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const STEP_NAMES: Record<number, string> = {
  1: "Team Size",
  2: "Identity + Phone OTP",
  3: "Business Details",
  4: "Payment Setup",
  5: "Current Software",
  6: "Payroll",
  7: "Location",
  8: "Photos",
  9: "Service Zones",
  10: "Categories",
  11: "Services",
  12: "Operating Hours",
  13: "Review",
  14: "Plan Selection",
};

interface TrackerDetail {
  user: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
  };
  draft: {
    id: string;
    current_step: number;
    current_step_name: string;
    draft_data: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  } | null;
  provider: {
    id: string;
    business_name: string;
    status: string;
    is_verified: boolean;
    created_at: string;
  } | null;
  tracking: Record<string, unknown> | null;
  step_completion: Record<
    number,
    { completed: boolean; name: string; data_present: string[] }
  >;
  linked_lead: {
    id: string;
    business_name: string;
    commercial_stage: string;
    source: string;
    created_at: string;
  } | null;
}

export default function TrackerDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = params.userId as string;
  const assistMode = searchParams.get("assist") === "true";

  const [data, setData] = useState<TrackerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  // Assisted onboarding fields
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, unknown>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: TrackerDetail }>(
        `/api/admin/provider-ops/tracker/${userId}`,
        { staleTimeMs: 0 }
      );
      setData(res.data);
      if (assistMode && res.data.draft) {
        setEditingDraft(true);
        setDraftEdits(res.data.draft.draft_data || {});
      }
    } catch (err) {
      if (err instanceof FetchTimeoutError) setError("Request timed out");
      else if (err instanceof FetchError) setError(err.message);
      else setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [userId, assistMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setSubmittingNote(true);
      await fetcher.post(
        `/api/admin/provider-ops/tracker/${userId}/note`,
        { note: noteText.trim() }
      );
      setNoteText("");
      toast.success("Note added");
      loadData();
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await fetcher.patch(
        `/api/admin/provider-ops/tracker/${userId}/draft`,
        {
          draft_data: draftEdits,
          current_step: data?.draft?.current_step,
        }
      );
      toast.success("Draft saved");
      loadData();
    } catch {
      toast.error("Failed to save draft");
    }
  };

  const handleSubmitOnboarding = async () => {
    if (
      !confirm(
        "Submit onboarding on behalf of this provider? This will create their provider profile."
      )
    )
      return;
    try {
      setSubmittingOnboarding(true);
      // Save any pending edits first
      if (Object.keys(draftEdits).length > 0) {
        await fetcher.patch(
          `/api/admin/provider-ops/tracker/${userId}/draft`,
          { draft_data: draftEdits }
        );
      }
      await fetcher.post<{ data: { provider_id: string } }>(
        `/api/admin/provider-ops/tracker/${userId}/submit`
      );
      toast.success("Onboarding submitted successfully");
      loadData();
    } catch (err) {
      if (err instanceof FetchError) toast.error(err.message);
      else toast.error("Failed to submit onboarding");
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const updateDraftField = (key: string, value: unknown) => {
    setDraftEdits((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading signup detail..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>{error || "Not found"}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/provider-ops/tracker")}
        >
          Back to Tracker
        </Button>
      </div>
    );
  }

  const { user, draft, provider, tracking, step_completion, linked_lead } = data;
  const draftData = editingDraft ? draftEdits : (draft?.draft_data || {});

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link
              href="/admin/provider-ops/tracker"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Tracker
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900">
              {user.full_name || user.email}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {user.email}
              </span>
              {user.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {user.phone}
                </span>
              )}
              <span>
                Signed up {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!provider && draft && (
              <>
                {editingDraft ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveDraft}
                    >
                      <Save className="h-3 w-3 mr-1" /> Save Progress
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleSubmitOnboarding}
                      disabled={submittingOnboarding}
                    >
                      {submittingOnboarding ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Submit on Behalf
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingDraft(true);
                      setDraftEdits(draft.draft_data || {});
                    }}
                  >
                    <Wrench className="h-3 w-3 mr-1" /> Assist Onboarding
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Provider banner */}
        {provider && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <p className="text-sm font-medium text-teal-800">
              This user has completed onboarding
            </p>
            <p className="text-xs text-teal-600">
              Provider: {provider.business_name} · Status: {provider.status}
            </p>
            <Link
              href={`/admin/providers/${provider.id}`}
              className="text-xs text-teal-700 hover:underline mt-1 inline-block"
            >
              View Provider →
            </Link>
          </div>
        )}

        {/* Linked lead banner */}
        {linked_lead && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800">
              Linked to lead: {linked_lead.business_name}
            </p>
            <p className="text-xs text-blue-600">
              Source: {linked_lead.source} · Stage:{" "}
              {linked_lead.commercial_stage}
            </p>
            <Link
              href={`/admin/provider-ops/leads/${linked_lead.id}`}
              className="text-xs text-blue-700 hover:underline mt-1 inline-block"
            >
              View Lead →
            </Link>
          </div>
        )}

        {/* Step Progress */}
        {draft && (
          <div className="bg-white border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-700 mb-4">
              Onboarding Progress — Step {draft.current_step} of 14:{" "}
              {draft.current_step_name}
            </h2>
            <div className="grid grid-cols-7 md:grid-cols-14 gap-2">
              {Array.from({ length: 14 }, (_, i) => i + 1).map((step) => {
                const info = step_completion[step];
                const isCurrent = step === draft.current_step;
                const isCompleted = info?.completed;
                return (
                  <div
                    key={step}
                    className={`flex flex-col items-center p-2 rounded-lg border text-center ${
                      isCurrent
                        ? "border-blue-400 bg-blue-50"
                        : isCompleted
                          ? "border-green-300 bg-green-50"
                          : "border-zinc-200"
                    }`}
                    title={info?.name}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : isCurrent
                            ? "bg-blue-500 text-white"
                            : "bg-zinc-200 text-zinc-500"
                      }`}
                    >
                      {isCompleted ? "✓" : step}
                    </div>
                    <span className="text-[8px] text-zinc-500 mt-1 leading-tight">
                      {STEP_NAMES[step]?.split(" ")[0]}
                    </span>
                    {info?.data_present?.length > 0 && (
                      <span className="text-[8px] text-green-600 mt-0.5">
                        {info.data_present.length} field(s)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-zinc-400 mt-3 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last activity:{" "}
              {new Date(draft.updated_at).toLocaleString()}
            </p>
          </div>
        )}

        {/* Main content */}
        <Tabs defaultValue={editingDraft ? "edit" : "overview"}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {draft && !provider && (
              <TabsTrigger value="edit">Edit Draft</TabsTrigger>
            )}
            <TabsTrigger value="notes">Admin Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Draft data summary */}
              <div className="bg-white border rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">
                  Draft Data
                </h3>
                <FieldRow
                  label="Business Name"
                  value={draftData.business_name as string}
                />
                <FieldRow
                  label="Business Type"
                  value={draftData.business_type as string}
                />
                <FieldRow
                  label="Team Size"
                  value={draftData.team_size as string}
                />
                <FieldRow
                  label="Owner Name"
                  value={draftData.owner_name as string}
                />
                <FieldRow
                  label="Owner Phone"
                  value={draftData.owner_phone as string}
                />
                <FieldRow
                  label="Description"
                  value={draftData.description as string}
                />
              </div>

              <div className="bg-white border rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">
                  Completeness
                </h3>
                <CompletionItem
                  label="Address"
                  ok={!!(draftData.address as Record<string, unknown>)?.address_line1}
                />
                <CompletionItem
                  label="Photo"
                  ok={!!draftData.thumbnail_url}
                />
                <CompletionItem
                  label="Categories"
                  ok={
                    Array.isArray(draftData.global_category_ids) &&
                    draftData.global_category_ids.length > 0
                  }
                />
                <CompletionItem
                  label="Services"
                  ok={
                    Array.isArray(draftData.services) &&
                    draftData.services.length > 0
                  }
                />
                <CompletionItem
                  label="Operating Hours"
                  ok={!!draftData.operating_hours}
                />
                <CompletionItem
                  label="Plan Selected"
                  ok={!!draftData.selected_plan_id}
                />
              </div>
            </div>
          </TabsContent>

          {draft && !provider && (
            <TabsContent value="edit" className="mt-4">
              <div className="bg-white border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Admin-Assisted Onboarding
                </h3>
                <p className="text-xs text-zinc-500">
                  Fill in missing fields and submit on behalf of the provider.
                  Fields the provider already filled are shown with their values.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EditField
                    label="Business Name"
                    field="business_name"
                    value={draftEdits}
                    onChange={updateDraftField}
                  />
                  <EditField
                    label="Description"
                    field="description"
                    value={draftEdits}
                    onChange={updateDraftField}
                  />
                  <EditField
                    label="Owner Name"
                    field="owner_name"
                    value={draftEdits}
                    onChange={updateDraftField}
                  />
                  <EditField
                    label="Owner Phone"
                    field="owner_phone"
                    value={draftEdits}
                    onChange={updateDraftField}
                  />
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">
                      Business Type
                    </label>
                    <select
                      value={(draftEdits.business_type as string) || ""}
                      onChange={(e) =>
                        updateDraftField("business_type", e.target.value)
                      }
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Select...</option>
                      <option value="freelancer">Freelancer</option>
                      <option value="salon">Salon</option>
                      <option value="spa">Spa</option>
                      <option value="barbershop">Barbershop</option>
                      <option value="mobile">Mobile</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">
                      Team Size
                    </label>
                    <select
                      value={(draftEdits.team_size as string) || ""}
                      onChange={(e) =>
                        updateDraftField("team_size", e.target.value)
                      }
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Select...</option>
                      <option value="just_me">Just Me</option>
                      <option value="2_5">2-5</option>
                      <option value="6_10">6-10</option>
                      <option value="11_plus">11+</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={handleSaveDraft}>
                    <Save className="h-3 w-3 mr-1" /> Save Progress
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleSubmitOnboarding}
                    disabled={submittingOnboarding}
                  >
                    {submittingOnboarding ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    Submit on Behalf
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="notes" className="mt-4">
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add an admin note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                />
                <Button
                  onClick={handleAddNote}
                  disabled={submittingNote || !noteText.trim()}
                  size="sm"
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
              {tracking?.admin_notes ? (
                <pre className="text-xs text-zinc-600 whitespace-pre-wrap bg-zinc-50 rounded p-3 border">
                  {tracking.admin_notes as string}
                </pre>
              ) : (
                <p className="text-sm text-zinc-400 text-center py-4">
                  No admin notes yet
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between py-1.5 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-700 font-medium">
        {value || "—"}
      </span>
    </div>
  );
}

function CompletionItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
      <span className={`text-sm ${ok ? "text-zinc-700" : "text-red-500"}`}>
        {label}
      </span>
    </div>
  );
}

function EditField({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: string;
  value: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <Input
        value={(value[field] as string) || ""}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </div>
  );
}
