import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { chunkIds } from "@/lib/provider-ops/postgrest-unbounded";
import { escapeLike } from "@/lib/provider-ops/lead-query-filters";
import {
  applyExistingLeadDedupe,
  applyInFileDedupe,
  leadNameFromRow,
  MAX_IMPORT_FILE_BYTES,
  type ExistingLeadMatch,
  type ImportWarning,
  type ParsedLeadRow,
  type SkippedDuplicate,
  parseLeadImportFile,
} from "@/lib/provider-ops/leads-csv-import";
import {
  buildReferrerLookupMaps,
  referrerSourceDetailFallback,
  resolveReferrerFromMaps,
} from "@/lib/provider-ops/resolve-referrer";

const BATCH_SIZE = 200;
const LOOKUP_CHUNK_SIZE = 200;

async function loadExistingLeadMatches(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  emails: string[],
  phones: string[],
): Promise<{
  existingByEmail: Map<string, ExistingLeadMatch>;
  existingByPhone: Map<string, ExistingLeadMatch>;
}> {
  const existingByEmail = new Map<string, ExistingLeadMatch>();
  const existingByPhone = new Map<string, ExistingLeadMatch>();

  for (const emailChunk of chunkIds(emails, LOOKUP_CHUNK_SIZE)) {
    const orClause = emailChunk.map((e) => `email.ilike.${escapeLike(e)}`).join(",");
    const { data, error } = await supabase
      .from("provider_leads")
      .select("id, email, phone_e164, business_name, lead_name, contact_person_name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .or(orClause);
    if (error) throw error;
    for (const row of data || []) {
      if (!row.email) continue;
      existingByEmail.set(row.email.toLowerCase(), {
        id: row.id,
        name: row.business_name || row.contact_person_name || row.lead_name,
        email: row.email,
        phone_e164: row.phone_e164,
      });
    }
  }

  for (const phoneChunk of chunkIds(phones, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("provider_leads")
      .select("id, email, phone_e164, business_name, lead_name, contact_person_name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("phone_e164", phoneChunk);
    if (error) throw error;
    for (const row of data || []) {
      if (!row.phone_e164) continue;
      existingByPhone.set(row.phone_e164, {
        id: row.id,
        name: row.business_name || row.contact_person_name || row.lead_name,
        email: row.email,
        phone_e164: row.phone_e164,
      });
    }
  }

  return { existingByEmail, existingByPhone };
}

/**
 * POST /api/admin/provider-ops/leads/import
 *
 * Bulk CSV import with flexible headers, duplicate skipping, and per-row reporting.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    let csvText: string;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return errorResponse("No file uploaded", "VALIDATION_ERROR", 400);
      }
      const upload = file as File;
      if (upload.size > MAX_IMPORT_FILE_BYTES) {
        return errorResponse(
          `File is too large (${Math.ceil(upload.size / (1024 * 1024))} MB). Maximum size is ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB.`,
          "VALIDATION_ERROR",
          400,
        );
      }
      csvText = await upload.text();
    } else {
      const body = await request.json();
      if (!body.csv_content) {
        return errorResponse("csv_content is required", "VALIDATION_ERROR", 400);
      }
      csvText = body.csv_content;
      if (csvText.length > MAX_IMPORT_FILE_BYTES) {
        return errorResponse(
          `CSV content exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB limit.`,
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const { data: platformCategories } = await supabase
      .from("global_service_categories")
      .select("id, name, slug")
      .eq("is_active", true);

    const catLookup = new Map<string, string>();
    for (const c of platformCategories || []) {
      catLookup.set(c.name.toLowerCase(), c.id);
      catLookup.set(c.slug.toLowerCase(), c.id);
    }

    let parsed;
    try {
      parsed = parseLeadImportFile(csvText, catLookup);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse CSV";
      if (message === "FILE_TOO_SMALL") {
        return errorResponse(
          "File must have a header row and at least one data row",
          "VALIDATION_ERROR",
          400,
        );
      }
      if (message.startsWith("UNRECOGNIZED_HEADERS:")) {
        const headers = message.slice("UNRECOGNIZED_HEADERS:".length);
        return errorResponse(
          `Could not recognize any columns. Use headers like: name, email, phone, location, category, description. Your headers: ${headers}`,
          "VALIDATION_ERROR",
          400,
        );
      }
      throw err;
    }

    const { headerMap, rawHeaders, parsedRows, skippedEmpty, dataRows } = parsed;

    if (parsedRows.length === 0) {
      return errorResponse(
        "No data rows found in the file. Make sure the file has a header row followed by data rows.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const inFileDedupe = applyInFileDedupe(parsedRows);
    const emails = [
      ...new Set(inFileDedupe.accepted.map((r) => r.email).filter(Boolean) as string[]),
    ];
    const phones = [
      ...new Set(inFileDedupe.accepted.map((r) => r.phone_e164).filter(Boolean) as string[]),
    ];
    const { existingByEmail, existingByPhone } = await loadExistingLeadMatches(
      supabase,
      tenantId,
      emails,
      phones,
    );
    const dbDedupe = applyExistingLeadDedupe(
      inFileDedupe.accepted,
      existingByEmail,
      existingByPhone,
    );

    const rowsToInsert = dbDedupe.accepted;
    const warnings: ImportWarning[] = rowsToInsert.flatMap((row) => row.warnings);
    const referrerEmails = rowsToInsert
      .map((row) => row.referrer_email)
      .filter(Boolean) as string[];
    const referrerPhones = rowsToInsert
      .map((row) => row.referrer_phone)
      .filter(Boolean) as string[];
    const referrerLookup = await buildReferrerLookupMaps(
      supabase,
      tenantId,
      referrerEmails,
      referrerPhones,
    );

    for (const row of rowsToInsert) {
      const resolved = resolveReferrerFromMaps(
        referrerLookup,
        row.referrer_email,
        row.referrer_phone,
      );
      if (resolved) {
        row.referrer_user_id = resolved.referrer_user_id;
        row.referrer_provider_id = resolved.referrer_provider_id;
        if (!row.source_detail && resolved.display_name) {
          row.source_detail = resolved.display_name;
        }
        continue;
      }

      if (row.referrer_email || row.referrer_phone) {
        warnings.push({
          row: row.rowNum,
          field: "referrer",
          message: `Could not resolve referrer${row.referrer_email ? ` email "${row.referrer_email}"` : ""}${row.referrer_phone ? ` phone "${row.referrer_phone}"` : ""}; stored in source_detail`,
        });
        if (!row.source_detail) {
          row.source_detail = referrerSourceDetailFallback(
            row.referrer_email,
            row.referrer_phone,
          );
        }
      }
    }

    const skippedDuplicates: SkippedDuplicate[] = [
      ...inFileDedupe.skippedDuplicates,
      ...dbDedupe.skippedDuplicates,
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadInserts: any[] = rowsToInsert.map((row) => ({
      tenant_id: tenantId,
      lead_name: leadNameFromRow(row),
      business_name: row.business_name,
      contact_person_name: row.contact_person_name,
      email: row.email,
      phone_country_code: row.phone_country_code,
      phone_national: row.phone_national,
      phone_e164: row.phone_e164,
      suggested_location_text: row.suggested_location_text,
      country: row.country,
      description: row.description,
      notes: row.notes,
      source: row.source,
      source_detail: row.source_detail,
      referrer_user_id: row.referrer_user_id,
      referrer_provider_id: row.referrer_provider_id,
      commercial_stage: "new",
      tags: row.tags,
      created_by: user.id,
    }));
    const rowCategories = rowsToInsert.map((row) => row.categoryIds);

    if (leadInserts.length === 0) {
      return successResponse({
        imported: 0,
        total_rows_in_file: dataRows.length - 1,
        skipped_empty: skippedEmpty,
        skipped_duplicates_count: skippedDuplicates.length,
        skipped_duplicates: skippedDuplicates,
        warnings,
        columns_detected: Object.keys(headerMap),
        columns_provided: rawHeaders,
        lead_ids: [],
      });
    }

    const allInsertedIds: string[] = [];
    let partialError: string | null = null;

    for (let batchStart = 0; batchStart < leadInserts.length; batchStart += BATCH_SIZE) {
      const batch = leadInserts.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;

      const { data: insertedBatch, error: insertError } = await supabase
        .from("provider_leads")
        .insert(batch)
        .select("id");

      if (insertError) {
        partialError = `Batch ${batchNumber} failed after ${allInsertedIds.length} leads imported: ${insertError.message}`;
        break;
      }

      const ids = (insertedBatch || []).map((r) => r.id);
      allInsertedIds.push(...ids);

      const catInserts: { lead_id: string; global_category_id: string }[] = [];
      for (let j = 0; j < ids.length; j++) {
        const cats = rowCategories[batchStart + j];
        for (const catId of cats) {
          catInserts.push({ lead_id: ids[j], global_category_id: catId });
        }
      }
      if (catInserts.length > 0) {
        const { error: catError } = await supabase
          .from("provider_lead_categories")
          .insert(catInserts);
        if (catError) {
          warnings.push({
            row: 0,
            field: "category",
            message: `Batch ${batchNumber} category insert failed: ${catError.message}`,
          });
        }
      }

      const actInserts = ids.map((id) => ({
        lead_id: id,
        activity_type: "lead_created" as const,
        description: `Imported via CSV (batch ${batchNumber})`,
        metadata: { source: "import", created_by_name: user.full_name || user.email },
        performed_by: user.id,
      }));
      const { error: actError } = await supabase
        .from("provider_lead_activities")
        .insert(actInserts);
      if (actError) {
        warnings.push({
          row: 0,
          field: "activity",
          message: `Batch ${batchNumber} activity log failed: ${actError.message}`,
        });
      }
    }

    const columnsDetected = Object.keys(headerMap);

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.leads.import",
      entity_type: "provider_lead",
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: {
        imported_count: allInsertedIds.length,
        total_rows: dataRows.length - 1,
        skipped_empty: skippedEmpty,
        skipped_duplicates: skippedDuplicates.length,
        columns_detected: columnsDetected,
        partial_error: partialError,
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      imported: allInsertedIds.length,
      total_rows_in_file: dataRows.length - 1,
      skipped_empty: skippedEmpty,
      skipped_duplicates_count: skippedDuplicates.length,
      skipped_duplicates: skippedDuplicates,
      warnings,
      columns_detected: columnsDetected,
      columns_provided: rawHeaders,
      lead_ids: allInsertedIds,
      error: partialError,
    });
  } catch (error) {
    console.error("[leads/import] error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to import leads",
      "INTERNAL_ERROR",
      500,
    );
  }
}
