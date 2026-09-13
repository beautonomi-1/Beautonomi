"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Building2, Send } from "lucide-react";
import Link from "next/link";

type ReferralStatus = "submitted" | "invited" | "joined";

interface ReferralRow {
  id: string;
  business_name: string | null;
  status: ReferralStatus;
  created_at: string;
}

const STATUS_LABEL_KEYS: Record<ReferralStatus, string> = {
  submitted: "web.provider.pages.referrals.submitted",
  invited: "web.provider.pages.referrals.invited",
  joined: "web.provider.pages.referrals.joined",
};

export default function ProviderReferralsPage() {
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: { referrals: ReferralRow[] } }>("/api/provider/referrals");
        if (!cancelled) setReferrals(res.data?.referrals ?? []);
      } catch {
        if (!cancelled) setReferrals([]);
      } finally {
        if (!cancelled) setLoadingReferrals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submitted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      toast.error(t("web.provider.pages.referrals.businessNameRequired"));
      return;
    }
    if (!email.trim() && !phone.trim()) {
      toast.error(t("web.provider.pages.referrals.emailOrPhoneRequired"));
      return;
    }

    try {
      setSubmitting(true);
      await fetcher.post("/api/provider/referrals", {
        business_name: businessName.trim(),
        contact_person_name: contactPerson.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        suggested_location_text: location.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(t("web.provider.pages.referrals.thankYou"));
      setSubmitted(true);
      setBusinessName("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setLocation("");
      setDescription("");
      setNotes("");
    } catch (error) {
      const message =
        error instanceof FetchError
          ? error.message
          : (error as { error?: { message?: string } })?.error?.message ||
            t("web.provider.pages.referrals.submitFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard
      allowedRoles={["provider_owner", "provider_staff"]}
      redirectTo="/provider/dashboard"
    >
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-16">
        <PageHeader
          title={t("web.provider.pages.referrals.title")}
          subtitle={t("web.provider.pages.referrals.subtitle")}
        />

        {submitted ? (
          <SectionCard>
            <div className="space-y-3 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Send className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm text-gray-700">
                {t("web.provider.pages.referrals.pipelineHint")}
              </p>
              <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                {t("web.provider.pages.referrals.referAnother")}
              </Button>
            </div>
          </SectionCard>
        ) : null}

        {referrals.length > 0 ? (
          <SectionCard title={t("web.provider.pages.referrals.yourReferrals")}>
            <ul className="divide-y divide-gray-100">
              {referrals.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {row.business_name || t("web.provider.pages.referrals.referredBusiness")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={
                      row.status === "joined"
                        ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                        : row.status === "invited"
                          ? "rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
                          : "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                    }
                  >
                    {t(STATUS_LABEL_KEYS[row.status])}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : !loadingReferrals ? (
          <SectionCard>
            <p className="text-sm text-gray-600">{t("web.provider.pages.referrals.empty")}</p>
          </SectionCard>
        ) : null}

        <SectionCard>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {t("web.provider.pages.referrals.duplicatesHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_name">{t("web.provider.pages.referrals.businessNameRequiredLabel")}</Label>
              <Input
                id="business_name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t("web.provider.pages.referrals.businessNamePlaceholder")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_person">{t("web.provider.pages.referrals.contactPerson")}</Label>
              <Input
                id="contact_person"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder={t("web.provider.pages.referrals.contactPersonPlaceholder")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">{t("web.provider.common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("web.provider.pages.referrals.emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("web.provider.common.phone")}</Label>
                <PhoneInput
                  inputId="phone"
                  label=""
                  value={phone}
                  onChange={setPhone}
                  placeholder={t("web.provider.pages.referrals.phonePlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{t("web.provider.common.location")}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("web.provider.pages.referrals.cityOrArea")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("web.provider.pages.referrals.whyReferring")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("web.provider.pages.referrals.whyPlaceholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t("web.provider.pages.referrals.privateNotes")}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("web.provider.pages.referrals.notesPlaceholder")}
                rows={2}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" asChild>
                <Link href="/provider/dashboard">{t("web.provider.common.cancel")}</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("web.provider.pages.referrals.submitting") : t("web.provider.pages.referrals.submitReferral")}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </RoleGuard>
  );
}
