import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { Loader2, CheckCircle2, MessageCircle, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNavigate } from "react-router-dom";
import { adminSpaTo } from "@/lib/adminSpaPath";

/** Minimal lead shape for bulk send — nullable strings match API / ProviderOps Lead rows */
interface BulkWhatsAppLeadRow {
  id: string;
  contact_person_name?: string | null;
  lead_name?: string | null;
  business_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  whatsapp_status?: string;
}

interface Session {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  is_paused: boolean;
  daily_send_count: number;
  hourly_send_count: number;
}

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
}

interface BulkResult {
  batch_id: string | null;
  queued_count: number;
  skipped_count: number;
  skipped_reasons: { lead_id: string; reason: string }[];
  daily_remaining: number;
  hourly_remaining: number;
}

interface BulkWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  leads: BulkWhatsAppLeadRow[];
}

type Step = "review" | "compose" | "confirm" | "done";

export function BulkWhatsAppModal({ open, onClose, leads }: BulkWhatsAppModalProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("review");
  const [sessionId, setSessionId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const sessionsQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.sessions(),
    queryFn: () => adminApi.getJson<Session[]>("/api/admin/whatsapp/sessions"),
    enabled: open,
  });

  const templatesQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.templates(),
    queryFn: () => adminApi.getJson<Template[]>("/api/admin/whatsapp/templates"),
    enabled: open,
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      adminApi.postJson<BulkResult>("/api/admin/whatsapp/bulk", {
        lead_ids: leads.map((l) => l.id),
        session_id: sessionId,
        template_id: templateId,
      }),
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      adminToast.success(`${data.queued_count} messages queued.`);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.sessions() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  useEffect(() => {
    if (!open) {
      setStep("review");
      setSessionId("");
      setTemplateId("");
      setConsent(false);
      setResult(null);
    }
  }, [open]);

  const withPhone = leads.filter((l) => l.phone_e164);
  const noPhone = leads.filter((l) => !l.phone_e164);
  const notOnWhatsApp = leads.filter((l) => l.whatsapp_status === "not_found");
  const ready = withPhone.filter((l) => l.whatsapp_status !== "not_found");
  const overLimit = leads.length > 50;

  const selectedSession = (sessionsQuery.data || []).find((s) => s.id === sessionId);
  const selectedTemplate = (templatesQuery.data || []).find((t) => t.id === templateId);
  const estimatedTime = ready.length * 5; // 5s pacing

  const STEP_TITLES: Record<Step, string> = {
    review: "Bulk WhatsApp — Review",
    compose: "Bulk WhatsApp — Compose",
    confirm: "Bulk WhatsApp — Confirm",
    done: "Messages Queued",
  };

  const footer = () => {
    switch (step) {
      case "review":
        return (
          <div className="flex gap-3">
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={onClose}>Cancel</button>
            <button
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={ready.length === 0 || overLimit}
              onClick={() => setStep("compose")}
            >
              Continue ({ready.length} eligible)
            </button>
          </div>
        );
      case "compose":
        return (
          <div className="flex gap-3">
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={() => setStep("review")}>Back</button>
            <button
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={!sessionId || !templateId}
              onClick={() => setStep("confirm")}
            >
              Review & Confirm
            </button>
          </div>
        );
      case "confirm":
        return (
          <div className="flex gap-3">
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={() => setStep("compose")}>Back</button>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium text-white",
                "bg-green-600 hover:bg-green-700 disabled:opacity-50",
              )}
              disabled={!consent || bulkMutation.isPending}
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {bulkMutation.isPending ? "Queuing…" : `Queue ${ready.length} Messages`}
            </button>
          </div>
        );
      case "done":
        return (
          <div className="flex gap-3">
            {result?.batch_id && (
              <button
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm"
                onClick={() => { onClose(); navigate(adminSpaTo(`/admin/whatsapp/batches/${result.batch_id}`)); }}
              >
                View Batch Status
              </button>
            )}
            <button className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white" onClick={onClose}>Done</button>
          </div>
        );
    }
  };

  return (
    <AdminModal open={open} onClose={onClose} title={STEP_TITLES[step]} size="xl" footer={footer()}>
      {/* Step 1: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminMetricCard label="Selected" value={leads.length} variant="slate" />
            <AdminMetricCard label="Ready" value={ready.length} variant="emerald" />
            <AdminMetricCard label="No Phone" value={noPhone.length} variant="rose" />
            <AdminMetricCard label="Not on WhatsApp" value={notOnWhatsApp.length} variant="amber" />
          </div>

          {overLimit && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <strong>Too many leads.</strong> Maximum 50 per batch. Please reduce your selection to continue.
            </div>
          )}

          <p className="text-sm text-gray-700">
            <strong>{ready.length}</strong> leads are eligible to receive a WhatsApp message.
            {noPhone.length > 0 && ` ${noPhone.length} will be skipped (no phone).`}
            {notOnWhatsApp.length > 0 && ` ${notOnWhatsApp.length} will be skipped (not on WhatsApp).`}
          </p>
        </div>
      )}

      {/* Step 2: Compose */}
      {step === "compose" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Sending from</label>
            <select
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">Select session…</option>
              {(sessionsQuery.data || []).filter((s) => s.status === "connected" && !s.is_paused).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phone_number ? `(${s.phone_number})` : ""} — {200 - s.daily_send_count}/200 daily remaining
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Message Template</label>
            <select
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Choose template…</option>
              {(templatesQuery.data || []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {selectedTemplate && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="mb-1 text-xs font-medium text-gray-400">Preview (sample data):</p>
              <p className="whitespace-pre-wrap">{selectedTemplate.body}</p>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Estimated delivery: ~{Math.ceil(estimatedTime / 60)} minute{estimatedTime > 60 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Important Safety Notice</p>
                <p className="mt-1">
                  Messages will be queued and sent gradually over ~{Math.ceil(estimatedTime / 60)} minutes.
                  WhatsApp may restrict numbers that send too many messages too quickly. Only send to leads who expect to hear from you.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <p><strong>{ready.length}</strong> messages via <strong>{selectedSession?.name}</strong> using "<strong>{selectedTemplate?.name}</strong>" template</p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span className="text-gray-700">I understand that bulk messaging carries risk of WhatsApp restrictions</span>
          </label>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-base font-semibold text-gray-900">{result.queued_count} Messages Queued</p>
          <p className="text-sm text-gray-500">
            {result.skipped_count > 0 && `${result.skipped_count} skipped. `}
            Messages will be sent gradually via the queue.
          </p>
        </div>
      )}
    </AdminModal>
  );
}
