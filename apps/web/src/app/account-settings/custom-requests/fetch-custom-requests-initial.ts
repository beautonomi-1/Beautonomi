import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getMeCustomRequests } from "@/app/api/me/custom-requests/route";
import { GET as getProviderCustomRequests } from "@/app/api/provider/custom-requests/route";
import { GET as getProviderClients } from "@/app/api/provider/clients/route";
import { GET as getProviderStaff } from "@/app/api/provider/staff/route";
import { GET as getProviderLocations } from "@/app/api/provider/locations/route";
import type {
  CustomRequestListItem,
  CustomRequestsPageInitial,
  ProviderClientRow,
} from "./custom-requests-page-types";

function mapStaffRow(s: { id?: string; name?: string; users?: { full_name?: string | null } | null }): {
  id: string;
  name: string;
} {
  const id = s.id ?? "";
  const name =
    (typeof s.name === "string" && s.name.trim()) ||
    (typeof s.users?.full_name === "string" && s.users.full_name.trim()) ||
    "Staff";
  return { id, name };
}

function mapLocationRow(l: { id?: string; name?: string }): { id: string; name: string } {
  return { id: l.id ?? "", name: (typeof l.name === "string" && l.name.trim()) || "Location" };
}

export async function fetchCustomRequestsPageInitial(): Promise<CustomRequestsPageInitial | null> {
  const meReq = await createNextRequestFromHeaders("/api/me/custom-requests");
  const meRes = await getMeCustomRequests(meReq);
  if (meRes.ok) {
    const j = (await meRes.json().catch(() => ({}))) as { data?: CustomRequestListItem[] };
    const items = Array.isArray(j.data) ? j.data : [];
    return { mode: "customer", items };
  }

  const prReq = await createNextRequestFromHeaders("/api/provider/custom-requests");
  const prRes = await getProviderCustomRequests(prReq);
  if (!prRes.ok) return null;

  const prJson = (await prRes.json().catch(() => ({}))) as { data?: CustomRequestListItem[] };
  const items = Array.isArray(prJson.data) ? prJson.data : [];

  const [cReq, sReq, lReq] = await Promise.all([
    createNextRequestFromHeaders("/api/provider/clients"),
    createNextRequestFromHeaders("/api/provider/staff"),
    createNextRequestFromHeaders("/api/provider/locations"),
  ]);

  const [cRes, sRes, lRes] = await Promise.all([
    getProviderClients(cReq),
    getProviderStaff(sReq),
    getProviderLocations(lReq),
  ]);

  let clients: ProviderClientRow[] = [];
  if (cRes.ok) {
    const cj = (await cRes.json().catch(() => ({}))) as { data?: ProviderClientRow[] };
    clients = Array.isArray(cj.data) ? cj.data : [];
  }

  let staffList: Array<{ id: string; name: string }> = [];
  if (sRes.ok) {
    const sj = (await sRes.json().catch(() => ({}))) as { data?: unknown[] };
    const rows = Array.isArray(sj.data) ? sj.data : [];
    staffList = rows.map((r) => mapStaffRow((r ?? {}) as Parameters<typeof mapStaffRow>[0])).filter((x) => x.id);
  }

  let locationsList: Array<{ id: string; name: string }> = [];
  if (lRes.ok) {
    const lj = (await lRes.json().catch(() => ({}))) as { data?: unknown[] };
    const rows = Array.isArray(lj.data) ? lj.data : [];
    locationsList = rows.map((r) => mapLocationRow((r ?? {}) as { id?: string; name?: string })).filter((x) => x.id);
  }

  return {
    mode: "provider",
    items,
    clients,
    staffList,
    locationsList,
  };
}
