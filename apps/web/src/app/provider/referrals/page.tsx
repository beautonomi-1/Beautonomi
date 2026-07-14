"use client";

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

const STATUS_LABELS: Record<ReferralStatus, string> = {
  submitted: "Submitted",
  invited: "Invited",
  joined: "Joined",
};

export default function ProviderReferralsPage() {
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
      toast.error("Business name is required");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      toast.error("Provide an email or phone number for the business you're referring");
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
      toast.success("Thank you — your referral has been submitted");
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
            "Failed to submit referral";
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
          title="Refer a business"
          subtitle="Know another salon or beauty business that would benefit from Beautonomi? Send us their details and our team will reach out."
        />

        {submitted ? (
          <SectionCard>
            <div className="space-y-3 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Send className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm text-gray-700">
                Your referral is in our pipeline. Provider Ops will review and follow up with the business.
              </p>
              <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                Refer another business
              </Button>
            </div>
          </SectionCard>
        ) : null}

        {referrals.length > 0 ? (
          <SectionCard title="Your referrals">
            <ul className="divide-y divide-gray-100">
              {referrals.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {row.business_name || "Referred business"}
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
                    {STATUS_LABELS[row.status]}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : !loadingReferrals ? (
          <SectionCard>
            <p className="text-sm text-gray-600">You have not referred any businesses yet.</p>
          </SectionCard>
        ) : null}

        <SectionCard>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                We check for duplicates before creating a lead. Include at least an email or phone so we can contact them.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_name">Business name *</Label>
              <Input
                id="business_name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Glow Beauty Studio"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact person</Label>
              <Input
                id="contact_person"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Owner or manager name"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@business.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <PhoneInput
                  inputId="phone"
                  label=""
                  value={phone}
                  onChange={setPhone}
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or area"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Why are you referring them?</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context for our team"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Private notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else we should know"
                rows={2}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" asChild>
                <Link href="/provider/dashboard">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit referral"}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </RoleGuard>
  );
}
