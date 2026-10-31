"use client";

import { useMemo, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

export type WebContentReportTargetType =
  | "explore_post"
  | "explore_comment"
  | "message"
  | "review"
  | "product_review";

export type WebContentReportReason =
  | "inappropriate"
  | "misleading"
  | "harassment"
  | "spam"
  | "safety"
  | "illegal_exploitative"
  | "other";

const REASONS: WebContentReportReason[] = [
  "inappropriate",
  "misleading",
  "harassment",
  "spam",
  "safety",
  "illegal_exploitative",
  "other",
];

type Props = {
  open: boolean;
  onClose: () => void;
  targetType: WebContentReportTargetType;
  targetId: string;
  title?: string;
};

export function ContentReportDialog({ open, onClose, targetType, targetId, title }: Props) {
  const { t } = useTranslation();
  const tr = useMemo(
    () => (key: string) => t(`customer.contentReport.${key}` as never) as string,
    [t],
  );
  const reasonLabels = useMemo(
    () =>
      Object.fromEntries(REASONS.map((r) => [r, tr(`reason.${r}`)])) as Record<
        WebContentReportReason,
        string
      >,
    [tr],
  );
  const [selectedReason, setSelectedReason] = useState<WebContentReportReason | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setSelectedReason("");
    setDetails("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!selectedReason) {
      toast.error(tr("selectReasonTitle"), { description: tr("selectReasonBody") });
      return;
    }
    setSubmitting(true);
    try {
      await fetcher.post("/api/reports/content", {
        target_type: targetType,
        target_id: targetId,
        reason: selectedReason,
        details: details.trim() || undefined,
      });
      toast.success(tr("submittedTitle"), { description: tr("submittedBody") });
      handleClose();
    } catch {
      toast.error(tr("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="content-report-title"
      >
        <h2 id="content-report-title" className="text-lg font-semibold text-gray-900">
          {title ?? tr("modalTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{tr("modalLead")}</p>
        <div className="mt-4 flex flex-col gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setSelectedReason(reason)}
              className={`rounded-lg border px-3 py-2 text-start text-sm ${
                selectedReason === reason
                  ? "border-[#FF0077] bg-pink-50 text-gray-900"
                  : "border-gray-200 text-gray-800 hover:bg-gray-50"
              }`}
            >
              {reasonLabels[reason]}
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          placeholder={tr("detailsPlaceholder")}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-[#FF0077] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {tr("submitCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
