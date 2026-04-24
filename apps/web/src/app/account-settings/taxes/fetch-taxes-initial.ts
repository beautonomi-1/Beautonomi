import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getTaxInfo } from "@/app/api/me/tax-info/route";
import { GET as getTaxDocuments } from "@/app/api/me/tax-documents/route";
import type { TaxDocumentPayload, TaxesPageInitial } from "./taxes-initial-types";

export async function fetchTaxesInitial(): Promise<TaxesPageInitial | null> {
  const [infoReq, docsReq] = await Promise.all([
    createNextRequestFromHeaders("/api/me/tax-info"),
    createNextRequestFromHeaders("/api/me/tax-documents"),
  ]);

  const [infoRes, docsRes] = await Promise.all([getTaxInfo(infoReq), getTaxDocuments(docsReq)]);

  if (!infoRes.ok) return null;

  const infoJson = (await infoRes.json().catch(() => ({}))) as {
    data?: { tax_info?: unknown; vat_id?: string | null };
  };
  const tax_info = (infoJson.data?.tax_info ?? null) as TaxesPageInitial["tax_info"];
  const vat_id = infoJson.data?.vat_id ?? null;

  let tax_documents: TaxDocumentPayload[] = [];
  if (docsRes.ok) {
    const docsJson = (await docsRes.json().catch(() => ({}))) as { data?: TaxDocumentPayload[] };
    tax_documents = Array.isArray(docsJson.data) ? docsJson.data : [];
  }

  return { tax_info, vat_id, tax_documents };
}
