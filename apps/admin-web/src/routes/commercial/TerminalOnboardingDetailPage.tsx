import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

type DetailResponse = {
  application: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

const EDITABLE_FIELDS: Array<{ key: string; label: string; group: string }> = [
  { key: "first_name", label: "First name", group: "Personal" },
  { key: "last_name", label: "Last name", group: "Personal" },
  { key: "email", label: "Email", group: "Personal" },
  { key: "phone", label: "Phone", group: "Personal" },
  { key: "otp_phone", label: "Term sheet phone", group: "Personal" },
  { key: "id_number", label: "ID number", group: "Personal" },
  { key: "legal_name", label: "Legal name", group: "Business" },
  { key: "trading_name", label: "Trading name", group: "Business" },
  { key: "registration_number", label: "Registration number", group: "Business" },
  { key: "vat_number", label: "VAT number", group: "Business" },
  { key: "physical_line1", label: "Address line 1", group: "Address" },
  { key: "physical_city", label: "City", group: "Address" },
  { key: "physical_province", label: "Province", group: "Address" },
  { key: "physical_postal_code", label: "Postal code", group: "Address" },
  { key: "bank_name", label: "Bank name", group: "Banking" },
  { key: "account_holder", label: "Account holder", group: "Banking" },
  { key: "acquirer_reference", label: "Acquirer reference", group: "Ops" },
];

const STAFF_DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: "id_document", label: "ID document" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "bank_confirmation_letter", label: "Bank confirmation letter" },
  { value: "company_registration", label: "Company registration" },
  { value: "trust_deed", label: "Trust deed" },
  { value: "resolution_letter", label: "Resolution letter" },
  { value: "other", label: "Other" },
];

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function TerminalOnboardingDetailPage() {
  const { id = "" } = useParams();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Application detail");

  const qc = useQueryClient();
  const [merchantNo, setMerchantNo] = useState("");
  const [storeNo, setStoreNo] = useState("");
  const [infoReason, setInfoReason] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [uploadDocType, setUploadDocType] = useState<string>("id_document");
  const [uploading, setUploading] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOnboardingDetail(id) });
    qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOnboarding });
    qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: adminQueryKeys.commercialTerminalOnboardingDetail(id),
    queryFn: () => adminApi.getJson<DetailResponse>(`/api/admin/terminal-merchant-applications/${id}`),
    enabled: !!id && allowed,
  });

  useEffect(() => {
    if (!data?.application) return;
    const next: Record<string, string> = {};
    for (const { key } of EDITABLE_FIELDS) {
      const v = data.application[key];
      next[key] = v == null ? "" : String(v);
    }
    setEditForm(next);
  }, [data?.application]);

  const statusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson(`/api/admin/terminal-merchant-applications/${id}/status`, body),
    onSuccess: () => {
      adminToast.success("Status updated");
      invalidate();
    },
    onError: () => adminToast.error("Failed to update status"),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/terminal-merchant-applications/${id}/approve`, {
        merchant_no: merchantNo,
        store_no: storeNo,
      }),
    onSuccess: () => {
      adminToast.success("Application approved");
      invalidate();
    },
    onError: () => adminToast.error("Failed to approve"),
  });

  const docMutation = useMutation({
    mutationFn: ({ docId, status, rejection_reason }: { docId: string; status: string; rejection_reason?: string }) =>
      adminApi.patchJson(`/api/admin/terminal-merchant-applications/${id}/documents/${docId}`, {
        status,
        rejection_reason,
      }),
    onSuccess: () => {
      adminToast.success("Document updated");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOnboardingDetail(id) });
    },
    onError: () => adminToast.error("Failed to update document"),
  });

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson(`/api/admin/terminal-merchant-applications/${id}`, body),
    onSuccess: () => {
      adminToast.success("Application saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOnboardingDetail(id) });
    },
    onError: () => adminToast.error("Failed to save application"),
  });

  async function viewDocument(docId: string) {
    try {
      const res = await adminApi.getJson<{ url: string | null }>(
        `/api/admin/terminal-merchant-applications/${id}/documents/${docId}`,
      );
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        adminToast.error("Could not open document");
      }
    } catch {
      adminToast.error("Could not open document");
    }
  }

  async function uploadOnBehalf(file: File) {
    setUploading(true);
    try {
      const content_base64 = await fileToBase64(file);
      await adminApi.postJson(`/api/admin/terminal-merchant-applications/${id}/documents/new`, {
        doc_type: uploadDocType,
        content_base64,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
      });
      adminToast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOnboardingDetail(id) });
    } catch {
      adminToast.error("Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  if (!allowed) {
    return denied;
  }

  if (isLoading) return <AdminPageSkeleton />;
  if (isError || !data) return <AdminRetryBlock onRetry={() => refetch()} message="Failed to load application" />;

  const app = data.application;
  const applicationNo = String(app.application_no ?? "");
  const status = String(app.status ?? "");
  const supportTicketId = app.support_ticket_id as string | undefined;
  const isTerminal = ["approved", "declined", "cancelled"].includes(status);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={applicationNo}
        description={`Status: ${status.replace(/_/g, " ")}`}
        actions={
          <Link to={adminSpaTo("/admin/commercial/terminal-onboarding")} className="text-sm text-indigo-600 hover:underline">
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AdminPanel
            title="Application data"
            actions={
              !isTerminal ? (
                editing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-sm"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                      disabled={editMutation.isPending}
                      onClick={() => editMutation.mutate(editForm)}
                    >
                      {editMutation.isPending ? "Saving…" : "Save"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm text-indigo-600"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )
              ) : null
            }
          >
            {editing ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {EDITABLE_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-gray-500">{label}</label>
                    <input
                      className="mt-1 w-full rounded border px-2 py-1"
                      value={editForm[key] ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Name", `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim()],
                  ["Email", app.email],
                  ["Phone", app.phone],
                  ["Term sheet phone", app.otp_phone],
                  ["Legal name", app.legal_name],
                  ["Trading name", app.trading_name],
                  ["Entity", app.entity_type],
                  ["Registration no", app.registration_number],
                  ["VAT no", app.vat_number],
                  ["Address", app.physical_line1],
                  ["City", app.physical_city],
                  ["Bank", app.bank_name],
                  ["Account holder", app.account_holder],
                  ["Account", app.account_number_last4 ? `••••${app.account_number_last4}` : "—"],
                  ["Acquirer ref", app.acquirer_reference],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-gray-500">{String(label)}</dt>
                    <dd className="font-medium">{String(value ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            )}
          </AdminPanel>

          <AdminPanel title="Documents">
            <ul className="space-y-3">
              {data.documents.map((doc) => (
                <li key={String(doc.id)} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                  <div>
                    <p className="font-medium">{String(doc.doc_type).replace(/_/g, " ")}</p>
                    <p className="text-gray-500">{String(doc.status)}</p>
                    {doc.rejection_reason ? (
                      <p className="text-amber-700">{String(doc.rejection_reason)}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-gray-700"
                      onClick={() => void viewDocument(String(doc.id))}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="rounded bg-green-100 px-2 py-1 text-green-800"
                      onClick={() => docMutation.mutate({ docId: String(doc.id), status: "approved" })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded bg-amber-100 px-2 py-1 text-amber-800"
                      onClick={() =>
                        docMutation.mutate({
                          docId: String(doc.id),
                          status: "rejected",
                          rejection_reason: "Please upload a clearer photo.",
                        })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
              {data.documents.length === 0 ? <p className="text-sm text-gray-500">No documents yet.</p> : null}
            </ul>

            {!isTerminal ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <span className="text-sm text-gray-500">Upload on behalf:</span>
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                >
                  {STAFF_DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label className="cursor-pointer rounded border px-3 py-1 text-sm text-indigo-600">
                  {uploading ? "Uploading…" : "Choose file"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadOnBehalf(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}
          </AdminPanel>

          <AdminPanel title="Timeline">
            <ul className="space-y-2 text-sm">
              {data.events.map((ev) => (
                <li key={String(ev.id)} className="border-b border-gray-100 pb-2">
                  <span className="font-medium">{String(ev.event_type)}</span>
                  {ev.message ? <span className="text-gray-600"> — {String(ev.message)}</span> : null}
                  <div className="text-xs text-gray-400">{ev.created_at ? new Date(String(ev.created_at)).toLocaleString() : ""}</div>
                </li>
              ))}
            </ul>
          </AdminPanel>
        </div>

        <div className="space-y-6">
          <AdminPanel title="Actions">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: "in_review" })}
              >
                Mark in review
              </button>
              <button
                type="button"
                className="rounded bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: "sent_to_acquirer" })}
              >
                Sent to acquirer
              </button>
              <button
                type="button"
                className="rounded bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: "awaiting_term_sheet", term_sheet_status: "sent" })}
              >
                Term sheet sent
              </button>
              <button
                type="button"
                className="rounded bg-violet-500 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ term_sheet_status: "accepted" })}
              >
                Term sheet accepted
              </button>
              <textarea
                className="mt-2 w-full rounded border p-2 text-sm"
                placeholder="Info required reason"
                value={infoReason}
                onChange={(e) => setInfoReason(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    status: "info_required",
                    info_required_reason: infoReason,
                    create_support_ticket: true,
                  })
                }
              >
                Request info + open ticket
              </button>
              <textarea
                className="mt-2 w-full rounded border p-2 text-sm"
                placeholder="Decline reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    status: "declined",
                    decline_reason: declineReason.trim() || "Unable to approve this application.",
                  })
                }
              >
                Decline application
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                disabled={isTerminal || statusMutation.isPending}
                onClick={() => {
                  if (window.confirm("Cancel this application? This cannot be undone.")) {
                    statusMutation.mutate({ status: "cancelled" });
                  }
                }}
              >
                Cancel application
              </button>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() =>
                  void downloadAdminBlob(
                    `/api/admin/terminal-merchant-applications/${id}/export?format=json`,
                    `${applicationNo}.json`,
                  )
                }
              >
                Export pack
              </button>
              {supportTicketId ? (
                <Link
                  to={adminSpaTo(`/admin/support-tickets/${supportTicketId}`)}
                  className="rounded border px-3 py-2 text-center text-sm text-indigo-600"
                >
                  Open support ticket
                </Link>
              ) : null}
            </div>
          </AdminPanel>

          <AdminPanel title="Approve">
            <div className="space-y-2">
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder="Merchant no"
                value={merchantNo}
                onChange={(e) => setMerchantNo(e.target.value)}
              />
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder="Store no"
                value={storeNo}
                onChange={(e) => setStoreNo(e.target.value)}
              />
              <button
                type="button"
                className={cn(
                  "w-full rounded bg-green-600 px-3 py-2 text-sm text-white",
                  (!merchantNo || !storeNo || isTerminal) && "opacity-50",
                )}
                disabled={!merchantNo || !storeNo || isTerminal || approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                Approve & create merchant
              </button>
              {isTerminal ? (
                <p className="text-xs text-gray-500">
                  This application is {status.replace(/_/g, " ")} — actions are locked.
                </p>
              ) : null}
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
