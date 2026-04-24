import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getPrivacySettings } from "@/app/api/me/privacy-settings/route";
import { GET as getRequestDataStatus } from "@/app/api/me/request-data/route";
import type { DataExportStatusState, PrivacyPageInitial, PrivacySettingsState } from "./privacy-initial-types";

function normalizeSettings(raw: Record<string, unknown> | null | undefined): PrivacySettingsState {
  const r = raw ?? {};
  return {
    accountVisibility: Boolean(r.accountVisibility),
    profileInformation: Boolean(r.profileInformation),
    readReceipts: Boolean(r.readReceipts),
    includeInSearchEngines: Boolean(r.includeInSearchEngines),
    showHomeCity: Boolean(r.showHomeCity),
    showTripType: Boolean(r.showTripType),
    showLengthOfStay: Boolean(r.showLengthOfStay),
    analytics_consent: r.analytics_consent !== false,
  };
}

export async function fetchPrivacyPageInitial(): Promise<PrivacyPageInitial | null> {
  const [psReq, rdReq] = await Promise.all([
    createNextRequestFromHeaders("/api/me/privacy-settings"),
    createNextRequestFromHeaders("/api/me/request-data"),
  ]);

  const [psRes, rdRes] = await Promise.all([
    getPrivacySettings(psReq),
    getRequestDataStatus(rdReq),
  ]);

  if (!psRes.ok) return null;

  const psJson = (await psRes.json().catch(() => ({}))) as { data?: Record<string, unknown> };
  const settings = normalizeSettings(psJson.data);

  let dataExportStatus: DataExportStatusState = {
    isReady: false,
    isPending: false,
  };
  if (rdRes.ok) {
    const rdJson = (await rdRes.json().catch(() => ({}))) as {
      data?: {
        isReady?: boolean;
        isPending?: boolean;
        downloadUrl?: string;
        fileName?: string;
      };
    };
    const d = rdJson.data;
    if (d) {
      dataExportStatus = {
        isReady: Boolean(d.isReady),
        isPending: Boolean(d.isPending),
        downloadUrl: d.downloadUrl,
        fileName: d.fileName,
      };
    }
  }

  return { settings, dataExportStatus };
}
