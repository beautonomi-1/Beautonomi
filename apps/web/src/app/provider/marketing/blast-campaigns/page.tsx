"use client";

/*
 * §Provider-launch (audit 2026-04): the original page on this route was a
 * toast-only stub ("Blast campaign builder coming soon…") even though the
 * real multi-channel builder already exists at /provider/marketing/campaigns
 * and is backed by /api/provider/campaigns{,/[id]/send}. Rather than keep
 * two competing UIs, this route now redirects to the canonical builder so
 * any existing bookmarks or sidebar links keep working.
 */

import { redirect } from "next/navigation";

export default function ProviderBlastCampaignsRedirect() {
  redirect("/provider/marketing/campaigns");
}
