import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const VALID_SOURCES = new Set([
  "manual", "import", "referral", "campaign", "outbound", "api", "form",
]);

const BATCH_SIZE = 200;

/* ─── Flexible header mapping ─── */

const HEADER_ALIASES: Record<string, string[]> = {
  name: [
    "name", "business_name", "business", "company", "company_name", "salon",
    "salon_name", "provider", "provider_name", "contact", "contact_name",
    "contact_person", "contact_person_name", "lead_name", "lead", "full_name",
    "fullname", "person", "person_name",
  ],
  email: [
    "email", "email_address", "e-mail", "e_mail", "mail", "contact_email",
  ],
  phone: [
    "phone", "phone_number", "phonenumber", "tel", "telephone", "mobile",
    "cell", "cellphone", "cell_phone", "contact_phone", "phone_e164",
    "phone_national", "whatsapp", "number",
  ],
  location: [
    "location", "address", "area", "suburb", "city", "town", "region",
    "suggested_location", "suggested_location_text", "place", "street",
    "street_address", "full_address",
  ],
  country: [
    "country", "country_name",
  ],
  category: [
    "category", "categories", "service", "services", "service_category",
    "service_type", "type", "industry", "speciality", "specialty",
  ],
  description: [
    "description", "desc", "about", "info", "details", "context", "bio",
  ],
  source: [
    "source", "lead_source", "origin", "channel", "acquisition",
    "how_found", "referral_source",
  ],
  notes: [
    "notes", "note", "comments", "comment", "internal_notes", "admin_notes",
    "remarks", "remark",
  ],
  tags: [
    "tags", "tag", "labels", "label",
  ],
};

function buildHeaderMap(rawHeaders: string[]): Record<string, number> {
  const normalized = rawHeaders.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  );

  const mapped: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i]) && mapped[field] === undefined) {
        mapped[field] = i;
        break;
      }
    }
  }

  return mapped;
}

/* ─── CSV parsing ─── */

function detectDelimiter(firstLine: string): string {
  const tab = (firstLine.match(/\t/g) || []).length;
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/* ─── Smart phone normalization ─── */

const COUNTRY_DIAL_CODES: Record<string, string> = {
  "+27": "ZA", "+1": "US", "+44": "GB", "+91": "IN", "+234": "NG",
  "+254": "KE", "+256": "UG", "+255": "TZ", "+233": "GH", "+263": "ZW",
  "+267": "BW", "+266": "LS", "+268": "SZ", "+260": "ZM", "+258": "MZ",
  "+61": "AU", "+64": "NZ", "+971": "AE", "+966": "SA", "+33": "FR",
  "+49": "DE", "+34": "ES", "+39": "IT", "+351": "PT", "+55": "BR",
  "+86": "CN", "+81": "JP", "+82": "KR", "+65": "SG", "+60": "MY",
};

function normalizePhone(raw: string): {
  phone_e164: string | null;
  phone_country_code: string | null;
  phone_national: string | null;
  inferred_country: string | null;
} {
  if (!raw) return { phone_e164: null, phone_country_code: null, phone_national: null, inferred_country: null };

  const cleaned = raw.replace(/[\s\-().]/g, "");

  if (cleaned.startsWith("+") && cleaned.length >= 10) {
    for (const [code, country] of Object.entries(COUNTRY_DIAL_CODES)) {
      if (cleaned.startsWith(code)) {
        const national = cleaned.slice(code.length);
        return {
          phone_e164: cleaned,
          phone_country_code: code,
          phone_national: national,
          inferred_country: country === "ZA" ? "South Africa" : null,
        };
      }
    }
    const code = cleaned.slice(0, 4).includes(cleaned.slice(0, 3)) ? cleaned.slice(0, 3) : cleaned.slice(0, 4);
    const national = cleaned.slice(code.length);
    return { phone_e164: cleaned, phone_country_code: code, phone_national: national, inferred_country: null };
  }

  if (cleaned.startsWith("0") && cleaned.length >= 9 && cleaned.length <= 12) {
    const national = cleaned.slice(1);
    return {
      phone_e164: `+27${national}`,
      phone_country_code: "+27",
      phone_national: national,
      inferred_country: "South Africa",
    };
  }

  if (/^\d{9,15}$/.test(cleaned)) {
    return { phone_e164: `+${cleaned}`, phone_country_code: null, phone_national: cleaned, inferred_country: null };
  }

  return { phone_e164: null, phone_country_code: null, phone_national: raw.trim(), inferred_country: null };
}

/* ─── Smart name detection ─── */

const BUSINESS_SIGNALS = /\b(salon|spa|studio|beauty|barber|shop|clinic|centre|center|wellness|aesthetics|nails|hair|lashes|brows|tattoo|parlour|parlor|enterprise|trading|pty|ltd|cc|inc|llc|group|services|solutions|boutique|lounge|academy|institute|co\.?\s|the\s)/i;

function classifyName(raw: string): { business_name: string | null; contact_person_name: string | null } {
  if (!raw) return { business_name: null, contact_person_name: null };
  const trimmed = raw.trim();
  if (BUSINESS_SIGNALS.test(trimmed)) {
    return { business_name: trimmed, contact_person_name: null };
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 3 && words.every((w) => /^[A-Z][a-z]+$/.test(w))) {
    return { business_name: null, contact_person_name: trimmed };
  }
  return { business_name: trimmed, contact_person_name: null };
}

/* ─── Main import handler ─── */

interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

/**
 * POST /api/admin/provider-ops/leads/import
 *
 * World-class bulk import: every column is optional, no row limit,
 * flexible header names, smart auto-detection for phone/name/category.
 * Never rejects a row — imports whatever data is present.
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
      csvText = await (file as File).text();
    } else {
      const body = await request.json();
      if (!body.csv_content) {
        return errorResponse("csv_content is required", "VALIDATION_ERROR", 400);
      }
      csvText = body.csv_content;
    }

    // Strip BOM
    if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

    const allLines = csvText.split(/\r?\n/);
    const dataLines = allLines.filter((l) => !l.startsWith("#") && l.trim() !== "");

    if (dataLines.length < 2) {
      return errorResponse(
        "File must have a header row and at least one data row",
        "VALIDATION_ERROR",
        400
      );
    }

    const delimiter = detectDelimiter(dataLines[0]);
    const rawHeaders = parseCSVLine(dataLines[0], delimiter);
    const headerMap = buildHeaderMap(rawHeaders);

    if (Object.keys(headerMap).length === 0) {
      return errorResponse(
        `Could not recognize any columns. Use headers like: name, email, phone, location, category, description. Your headers: ${rawHeaders.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Load categories for matching
    const { data: platformCategories } = await supabase
      .from("global_service_categories")
      .select("id, name, slug")
      .eq("is_active", true);

    const catLookup = new Map<string, string>();
    for (const c of platformCategories || []) {
      catLookup.set(c.name.toLowerCase(), c.id);
      catLookup.set(c.slug.toLowerCase(), c.id);
    }

    const getField = (fields: string[], field: string): string | null => {
      const idx = headerMap[field];
      if (idx === undefined || idx >= fields.length) return null;
      const val = fields[idx].trim();
      return val || null;
    };

    const warnings: ImportWarning[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadInserts: any[] = [];
    const rowCategories: string[][] = [];
    let skippedEmpty = 0;

    for (let i = 1; i < dataLines.length; i++) {
      const line = dataLines[i];
      if (!line.trim()) { skippedEmpty++; continue; }

      const fields = parseCSVLine(line, delimiter);
      const rowNum = i + 1;

      // Check if the entire row is empty
      const hasAnyData = fields.some((f) => f.trim() !== "");
      if (!hasAnyData) { skippedEmpty++; continue; }

      // Name (flexible)
      const rawName = getField(fields, "name");
      const { business_name, contact_person_name } = classifyName(rawName || "");

      // Email
      const email = getField(fields, "email")?.toLowerCase() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        warnings.push({ row: rowNum, field: "email", message: `Invalid email format "${email}", stored as-is` });
      }

      // Phone
      const rawPhone = getField(fields, "phone");
      const phoneResult = normalizePhone(rawPhone || "");
      if (rawPhone && !phoneResult.phone_e164) {
        warnings.push({ row: rowNum, field: "phone", message: `Could not normalize phone "${rawPhone}", stored raw` });
      }

      // Location
      const location = getField(fields, "location");

      // Country (explicit or inferred from phone)
      const explicitCountry = getField(fields, "country");
      const country = explicitCountry || phoneResult.inferred_country || null;

      // Categories
      const rawCats = getField(fields, "category") || "";
      const categoryNames = rawCats.split(/[;,|]/).map((c) => c.trim()).filter(Boolean);
      const resolvedCatIds: string[] = [];
      for (const catName of categoryNames) {
        const id = catLookup.get(catName.toLowerCase());
        if (id) {
          if (!resolvedCatIds.includes(id)) resolvedCatIds.push(id);
        } else {
          warnings.push({ row: rowNum, field: "category", message: `"${catName}" not found in platform categories, skipped` });
        }
      }

      // Source
      const rawSource = getField(fields, "source") || "";
      const source = VALID_SOURCES.has(rawSource.toLowerCase()) ? rawSource.toLowerCase() : "import";

      // Description, notes, tags
      const description = getField(fields, "description");
      const notes = getField(fields, "notes");
      const rawTags = getField(fields, "tags") || "";
      const tags = rawTags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);

      const leadName = business_name || contact_person_name || email || rawPhone || `Row ${rowNum}`;

      leadInserts.push({
        tenant_id: tenantId,
        lead_name: leadName,
        business_name,
        contact_person_name,
        email,
        phone_country_code: phoneResult.phone_country_code,
        phone_national: phoneResult.phone_national,
        phone_e164: phoneResult.phone_e164,
        suggested_location_text: location,
        country,
        description,
        notes,
        source,
        commercial_stage: "new",
        tags,
        created_by: user.id,
      });
      rowCategories.push(resolvedCatIds);
    }

    if (leadInserts.length === 0) {
      return errorResponse(
        "No data rows found in the file. Make sure the file has a header row followed by data rows.",
        "VALIDATION_ERROR",
        400
      );
    }

    // Insert leads in batches
    const allInsertedIds: string[] = [];

    for (let batchStart = 0; batchStart < leadInserts.length; batchStart += BATCH_SIZE) {
      const batch = leadInserts.slice(batchStart, batchStart + BATCH_SIZE);

      const { data: insertedBatch, error: insertError } = await supabase
        .from("provider_leads")
        .insert(batch)
        .select("id");

      if (insertError) throw insertError;

      const ids = (insertedBatch || []).map((r) => r.id);
      allInsertedIds.push(...ids);

      // Categories for this batch
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
        if (catError) console.error("[leads/import] category insert error:", catError);
      }

      // Activity log for this batch
      const actInserts = ids.map((id) => ({
        lead_id: id,
        activity_type: "lead_created" as const,
        description: `Imported via CSV (batch ${Math.floor(batchStart / BATCH_SIZE) + 1})`,
        metadata: { source: "import", created_by_name: user.full_name || user.email },
        performed_by: user.id,
      }));
      const { error: actError } = await supabase
        .from("provider_lead_activities")
        .insert(actInserts);
      if (actError) console.error("[leads/import] activity insert error:", actError);
    }

    const columnsDetected = Object.keys(headerMap);

    return successResponse({
      imported: allInsertedIds.length,
      total_rows_in_file: dataLines.length - 1,
      skipped_empty: skippedEmpty,
      warnings,
      columns_detected: columnsDetected,
      columns_provided: rawHeaders,
      lead_ids: allInsertedIds,
    });
  } catch (error) {
    console.error("[leads/import] error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to import leads",
      "INTERNAL_ERROR",
      500
    );
  }
}
