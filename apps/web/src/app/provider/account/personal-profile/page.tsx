"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";

const SOFT_LIMIT = 200;
const HARD_LIMIT = 1000;

type MeProfile = {
  full_name?: string | null;
  preferred_name?: string | null;
  about?: string | null;
  biography_title?: string | null;
};

export default function ProviderPersonalProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [about, setAbout] = useState("");
  const [biographyTitle, setBiographyTitle] = useState("");
  const [displayName, setDisplayName] = useState("Your profile");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: MeProfile }>("/api/me/profile");
        if (cancelled) return;
        const profile = res.data ?? {};
        setAbout(typeof profile.about === "string" ? profile.about : "");
        setBiographyTitle(
          typeof profile.biography_title === "string" ? profile.biography_title : "",
        );
        setDisplayName(
          profile.preferred_name?.trim() ||
            profile.full_name?.trim() ||
            "Your profile",
        );
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof FetchError ? err.message : "Failed to load profile",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = about.trim();
    if (!trimmed) {
      toast.error("Add a short bio so customers know who they're booking with.");
      return;
    }
    if (trimmed.length > HARD_LIMIT) {
      toast.error(`Bio is too long. Keep it under ${HARD_LIMIT} characters.`);
      return;
    }

    setSaving(true);
    try {
      await fetcher.patch("/api/me/profile", {
        about: trimmed,
        biography_title: biographyTitle.trim() || null,
      });
      toast.success("Personal profile saved");
      if (returnTo) {
        router.push(returnTo);
      } else {
        router.back();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }, [about, biographyTitle, returnTo, router]);

  if (loading) {
    return (
      <SettingsDetailLayout
        title="Personal Profile"
        breadcrumbs={[
          { label: "Provider", href: "/provider" },
          { label: "Account", href: "/provider/account/profile" },
          { label: "Personal Profile" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading your profile…" />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Personal Profile"
      breadcrumbs={[
        { label: "Provider", href: "/provider" },
        { label: "Account", href: "/provider/account/profile" },
        { label: "Personal Profile" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <SectionCard title={displayName} description="How customers see you as a freelancer">
          <div className="space-y-4">
            <div>
              <Label htmlFor="biography_title">Headline (optional)</Label>
              <Input
                id="biography_title"
                value={biographyTitle}
                onChange={(e) => setBiographyTitle(e.target.value)}
                placeholder="e.g. Mobile nail artist · Cape Town"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="about">About you</Label>
              <Textarea
                id="about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Tell customers about your experience, style, and what makes you unique…"
                rows={6}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {about.trim().length}/{HARD_LIMIT} characters
                {about.trim().length > 0 && about.trim().length < SOFT_LIMIT
                  ? " — we recommend at least 200 characters for a strong profile."
                  : ""}
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
              {returnTo ? (
                <Button variant="outline" onClick={() => router.push(returnTo)}>
                  Back to checklist
                </Button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>
    </SettingsDetailLayout>
  );
}
