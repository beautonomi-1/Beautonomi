"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";

type ProfilePatch = {
  headline?: string;
  bio?: string;
  specialties?: string[];
  faq?: string[];
  policies?: string[];
};

type ContentStudio = {
  post_captions?: string[];
  hashtags?: string[];
  short_description?: string;
};

const FEATURES = [
  {
    key: "ai.provider.profile_completion",
    title: "Profile suggestions",
    description: "Headline, bio, specialties, FAQ, and policy ideas from your business context.",
  },
  {
    key: "ai.provider.content_studio",
    title: "Content studio",
    description: "Captions, hashtags, and a short description for social posts.",
  },
] as const;

export default function ProviderAiStudioPage() {
  const [extra, setExtra] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePatch | null>(null);
  const [content, setContent] = useState<ContentStudio | null>(null);
  const [applying, setApplying] = useState(false);

  async function run(featureKey: string) {
    setLoadingKey(featureKey);
    try {
      const res = await fetcher.post<{ data?: { suggested_profile_patch?: ProfilePatch } & ContentStudio }>(
        `/api/provider/ai/${encodeURIComponent(featureKey)}`,
        { input: extra.trim() || undefined },
      );
      const payload = (res as { data?: Record<string, unknown> }).data ?? res;
      if (featureKey === "ai.provider.profile_completion") {
        const patch =
          (payload as { suggested_profile_patch?: ProfilePatch }).suggested_profile_patch ?? null;
        setProfile(patch);
        setContent(null);
      } else {
        setContent(payload as ContentStudio);
        setProfile(null);
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "AI request failed");
    } finally {
      setLoadingKey(null);
    }
  }

  async function applyBio() {
    const bio = profile?.bio?.trim();
    if (!bio) {
      toast.error("Generate a bio first");
      return;
    }
    setApplying(true);
    try {
      await fetcher.patch("/api/provider/profile", { description: bio });
      toast.success("Business description updated");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Could not apply bio");
    } finally {
      setApplying(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="w-full max-w-3xl">
        <PageHeader
          title="AI studio"
          subtitle="Suggestions from your plan entitlements. Review before applying."
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Settings", href: "/provider/settings" },
            { label: "AI studio" },
          ]}
        />

        <label className="mb-2 block text-sm font-medium text-gray-700">Optional extra context</label>
        <Textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="e.g. focus on bridal makeup, Cape Town"
          className="mb-6 min-h-[88px]"
        />

        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.key} className="rounded-2xl border border-gray-100 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">{f.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{f.description}</p>
              <Button
                className="mt-3 w-full"
                disabled={loadingKey !== null}
                onClick={() => void run(f.key)}
              >
                {loadingKey === f.key ? "Generating…" : "Generate"}
              </Button>
            </div>
          ))}
        </div>

        {profile ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            {profile.headline ? (
              <p>
                <span className="text-xs font-semibold uppercase text-gray-500">Headline</span>
                <br />
                {profile.headline}
              </p>
            ) : null}
            {profile.bio ? (
              <p>
                <span className="text-xs font-semibold uppercase text-gray-500">Bio</span>
                <br />
                {profile.bio}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void applyBio()} disabled={applying || !profile.bio}>
                {applying ? "Applying…" : "Apply bio to profile"}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/provider/settings/business-description">Open business description</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {content ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            {(content.post_captions ?? []).map((c) => (
              <div key={c} className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800">{c}</p>
                <Button variant="outline" size="sm" onClick={() => void copyText(c)}>
                  Copy
                </Button>
              </div>
            ))}
            {content.hashtags?.length ? (
              <p className="text-sm text-gray-600">{content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}
