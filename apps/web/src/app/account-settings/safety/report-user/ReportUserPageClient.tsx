"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchError, fetcher } from "@/lib/http/fetcher";
import { buildUserReportPayload, canSubmitUserReport } from "@/lib/safety/report-user-payload";
import AccountPageFrame from "../../components/account-page-frame";

export default function ReportUserPageClient() {
  const { t } = useTranslation();
  const ru = useCallback((key: string) => t(`customer.mobile.screens.reportUser.${key}`) as string, [t]);

  const [identifier, setIdentifier] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = canSubmitUserReport(identifier, description);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!canSubmit) {
      toast.error(t("web.accountSettings.safety.reportValidation"));
      return;
    }
    setSubmitting(true);
    try {
      await fetcher.post("/api/reports", buildUserReportPayload(identifier, description));
      setSubmitted(true);
    } catch (error) {
      toast.error(ru("submitFailedTitle"), {
        description: error instanceof FetchError && error.message ? error.message : ru("submitFailedFallback"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const parents = [{ label: t("customer.mobile.screens.safetyHub.title") as string, href: "/account-settings/safety" }];

  if (submitted) {
    return (
      <AccountPageFrame title={ru("title")} backHref="/account-settings/safety" parents={parents}>
        <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">{ru("submittedTitle")}</h2>
          <p className="mt-1 text-sm text-gray-700">{ru("submittedBody")}</p>
          <Button asChild className="mt-4 min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]">
            <Link href="/account-settings/safety">{t("customer.mobile.screens.safetyHub.title")}</Link>
          </Button>
        </div>
      </AccountPageFrame>
    );
  }

  return (
    <AccountPageFrame title={ru("title")} subtitle={ru("intro")} backHref="/account-settings/safety" parents={parents}>
      <form onSubmit={(e) => void submit(e)} className="space-y-5 rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
        <div className="space-y-1.5">
          <Label htmlFor="report-identifier">{ru("identifierLabel")}</Label>
          <Input
            id="report-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={ru("identifierPlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-11 text-base sm:text-sm"
          />
          <p className="text-xs text-gray-500">{ru("identifierHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-description">{ru("descriptionLabel")}</Label>
          <Textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ru("descriptionPlaceholder")}
            rows={5}
            maxLength={2000}
            className="text-base sm:text-sm"
          />
        </div>
        <Button
          type="submit"
          disabled={!canSubmit || submitting}
          className="min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : ru("submit")}
        </Button>
      </form>
      <Link
        href="/help/submit-ticket?category=safety_report_user"
        className="inline-flex min-h-11 items-center text-sm text-[#FF0077] underline"
      >
        {ru("supportFallback")}
      </Link>
    </AccountPageFrame>
  );
}