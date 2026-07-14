/**
 * CSV parsing and row normalization for provider lead bulk import.
 */

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const VALID_SOURCES = new Set([
  "manual", "import", "referral", "campaign", "outbound", "api", "form",
]);

export const HEADER_ALIASES: Record<string, string[]> = {
  business_name: [
    "business_name", "business", "company", "company_name", "salon",
    "salon_name", "provider", "provider_name",
  ],
  contact_person_name: [
    "contact_person", "contact_person_name", "contact", "contact_name",
    "full_name", "fullname", "person", "person_name",
  ],
  name: ["name", "lead_name", "lead"],
  email: [
    "email", "email_address", "e-mail", "e_mail", "mail", "contact_email",
  ],
  phone: [
    "phone", "phone_number", "phonenumber", "tel", "telephone", "mobile",
    "cell", "cellphone", "cell_phone", "contact_phone", "phone_e164",
    "phone_e_164", "phone_national", "whatsapp", "number",
  ],
  location: [
    "location", "address", "area", "suburb", "city", "town", "region",
    "suggested_location", "suggested_location_text", "place", "street",
    "street_address", "full_address",
  ],
  country: ["country", "country_name"],
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
  source_detail: [
    "source_detail", "source_details", "referral_detail", "referral_name",
    "referrer_name", "referrer",
  ],
  referrer_email: [
    "referrer_email", "referrer_e_mail", "referrer_mail", "referral_email",
  ],
  referrer_phone: [
    "referrer_phone", "referrer_phone_number", "referrer_tel", "referrer_mobile",
    "referral_phone",
  ],
  notes: [
    "notes", "note", "comments", "comment", "internal_notes", "admin_notes",
    "remarks", "remark",
  ],
  tags: ["tags", "tag", "labels", "label"],
};

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

export interface SkippedDuplicate {
  row: number;
  field: string;
  value: string;
  existing_lead_id: string | null;
  existing_lead_name: string | null;
  reason: "in_file" | "existing_lead";
}

export interface ParsedLeadRow {
  rowNum: number;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_country_code: string | null;
  phone_national: string | null;
  phone_e164: string | null;
  suggested_location_text: string | null;
  country: string | null;
  description: string | null;
  notes: string | null;
  source: string;
  source_detail: string | null;
  referrer_email: string | null;
  referrer_phone: string | null;
  referrer_user_id: string | null;
  referrer_provider_id: string | null;
  tags: string[];
  categoryIds: string[];
  warnings: ImportWarning[];
}

export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

export function detectDelimiter(firstLine: string): string {
  const tab = (firstLine.match(/\t/g) || []).length;
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

/**
 * Parse CSV/TSV text into rows, supporting quoted fields that span newlines.
 */
export function parseCSVRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (ch === "\n") {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/** Drop comment rows (# prefix) and fully empty rows. */
export function filterDataRows(rows: string[][]): string[][] {
  return rows.filter((row) => {
    const firstNonEmpty = row.find((cell) => cell.trim() !== "")?.trim() ?? "";
    if (firstNonEmpty.startsWith("#")) return false;
    return row.some((cell) => cell.trim() !== "");
  });
}

export function buildHeaderMap(rawHeaders: string[]): Record<string, number> {
  const normalized = rawHeaders.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""),
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

const COUNTRY_DIAL_CODES: Record<string, string> = {
  "+27": "ZA", "+1": "US", "+44": "GB", "+91": "IN", "+234": "NG",
  "+254": "KE", "+256": "UG", "+255": "TZ", "+233": "GH", "+263": "ZW",
  "+267": "BW", "+266": "LS", "+268": "SZ", "+260": "ZM", "+258": "MZ",
  "+61": "AU", "+64": "NZ", "+971": "AE", "+966": "SA", "+33": "FR",
  "+49": "DE", "+34": "ES", "+39": "IT", "+351": "PT", "+55": "BR",
  "+86": "CN", "+81": "JP", "+82": "KR", "+65": "SG", "+60": "MY",
};

export function normalizePhone(raw: string): {
  phone_e164: string | null;
  phone_country_code: string | null;
  phone_national: string | null;
  inferred_country: string | null;
} {
  if (!raw) {
    return {
      phone_e164: null,
      phone_country_code: null,
      phone_national: null,
      inferred_country: null,
    };
  }

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
    const code = cleaned.slice(0, 4).includes(cleaned.slice(0, 3))
      ? cleaned.slice(0, 3)
      : cleaned.slice(0, 4);
    const national = cleaned.slice(code.length);
    return {
      phone_e164: cleaned,
      phone_country_code: code,
      phone_national: national,
      inferred_country: null,
    };
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
    return {
      phone_e164: `+${cleaned}`,
      phone_country_code: null,
      phone_national: cleaned,
      inferred_country: null,
    };
  }

  return {
    phone_e164: null,
    phone_country_code: null,
    phone_national: raw.trim(),
    inferred_country: null,
  };
}

const BUSINESS_SIGNALS =
  /\b(salon|spa|studio|beauty|barber|shop|clinic|centre|center|wellness|aesthetics|nails|hair|lashes|brows|tattoo|parlour|parlor|enterprise|trading|pty|ltd|cc|inc|llc|group|services|solutions|boutique|lounge|academy|institute|co\.?\s|the\s)/i;

export function classifyName(raw: string): {
  business_name: string | null;
  contact_person_name: string | null;
} {
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

export function parseLeadImportFile(
  csvText: string,
  catLookup: Map<string, string>,
): {
  dataRows: string[][];
  headerMap: Record<string, number>;
  rawHeaders: string[];
  parsedRows: ParsedLeadRow[];
  skippedEmpty: number;
} {
  const text = stripBom(csvText);
  const delimiter = detectDelimiterFromText(text);
  const allRows = parseCSVRecords(text, delimiter);
  const dataRows = filterDataRows(allRows);

  if (dataRows.length < 2) {
    throw new Error("FILE_TOO_SMALL");
  }

  const rawHeaders = dataRows[0];
  const headerMap = buildHeaderMap(rawHeaders);

  if (Object.keys(headerMap).length === 0) {
    throw new Error(`UNRECOGNIZED_HEADERS:${rawHeaders.join(", ")}`);
  }

  const getField = (fields: string[], field: string): string | null => {
    const idx = headerMap[field];
    if (idx === undefined || idx >= fields.length) return null;
    const val = fields[idx].trim();
    return val || null;
  };

  const parsedRows: ParsedLeadRow[] = [];
  let skippedEmpty = 0;

  for (let i = 1; i < dataRows.length; i++) {
    const fields = dataRows[i];
    const rowNum = i + 1;
    const hasAnyData = fields.some((f) => f.trim() !== "");
    if (!hasAnyData) {
      skippedEmpty++;
      continue;
    }

    const warnings: ImportWarning[] = [];

    const explicitBusiness = getField(fields, "business_name");
    const explicitContact = getField(fields, "contact_person_name");
    const rawName = getField(fields, "name");
    let business_name = explicitBusiness;
    let contact_person_name = explicitContact;

    if (!business_name && !contact_person_name && rawName) {
      const classified = classifyName(rawName);
      business_name = classified.business_name;
      contact_person_name = classified.contact_person_name;
    }

    const email = getField(fields, "email")?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push({
        row: rowNum,
        field: "email",
        message: `Invalid email format "${email}", stored as-is`,
      });
    }

    const rawPhone = getField(fields, "phone");
    const phoneResult = normalizePhone(rawPhone || "");
    if (rawPhone && !phoneResult.phone_e164) {
      warnings.push({
        row: rowNum,
        field: "phone",
        message: `Could not normalize phone "${rawPhone}", stored raw`,
      });
    }

    const location = getField(fields, "location");
    const explicitCountry = getField(fields, "country");
    const country = explicitCountry || phoneResult.inferred_country || null;

    const rawCats = getField(fields, "category") || "";
    const categoryNames = rawCats.split(/[;,|]/).map((c) => c.trim()).filter(Boolean);
    const categoryIds: string[] = [];
    for (const catName of categoryNames) {
      const id = catLookup.get(catName.toLowerCase());
      if (id) {
        if (!categoryIds.includes(id)) categoryIds.push(id);
      } else {
        warnings.push({
          row: rowNum,
          field: "category",
          message: `"${catName}" not found in platform categories, skipped`,
        });
      }
    }

    const rawSource = getField(fields, "source") || "";
    const source = VALID_SOURCES.has(rawSource.toLowerCase()) ? rawSource.toLowerCase() : "import";

    const explicitSourceDetail = getField(fields, "source_detail");
    const referrerEmail = getField(fields, "referrer_email")?.toLowerCase() || null;
    const referrerPhoneRaw = getField(fields, "referrer_phone");
    const referrerPhoneNormalized = referrerPhoneRaw
      ? normalizePhone(referrerPhoneRaw).phone_e164 || referrerPhoneRaw.trim()
      : null;

    const description = getField(fields, "description");
    const notes = getField(fields, "notes");
    const rawTags = getField(fields, "tags") || "";
    const tags = rawTags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);

    parsedRows.push({
      rowNum,
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
      source_detail: explicitSourceDetail,
      referrer_email: referrerEmail,
      referrer_phone: referrerPhoneNormalized,
      referrer_user_id: null,
      referrer_provider_id: null,
      tags,
      categoryIds,
      warnings,
    });
  }

  return {
    dataRows,
    headerMap,
    rawHeaders,
    parsedRows,
    skippedEmpty,
  };
}

function detectDelimiterFromText(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return detectDelimiter(line);
  }
  return ",";
}

export function applyInFileDedupe(rows: ParsedLeadRow[]): {
  accepted: ParsedLeadRow[];
  skippedDuplicates: SkippedDuplicate[];
} {
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const accepted: ParsedLeadRow[] = [];
  const skippedDuplicates: SkippedDuplicate[] = [];

  for (const row of rows) {
    if (row.email && seenEmails.has(row.email)) {
      skippedDuplicates.push({
        row: row.rowNum,
        field: "email",
        value: row.email,
        existing_lead_id: null,
        existing_lead_name: null,
        reason: "in_file",
      });
      continue;
    }
    if (row.phone_e164 && seenPhones.has(row.phone_e164)) {
      skippedDuplicates.push({
        row: row.rowNum,
        field: "phone",
        value: row.phone_e164,
        existing_lead_id: null,
        existing_lead_name: null,
        reason: "in_file",
      });
      continue;
    }

    if (row.email) seenEmails.add(row.email);
    if (row.phone_e164) seenPhones.add(row.phone_e164);
    accepted.push(row);
  }

  return { accepted, skippedDuplicates };
}

export interface ExistingLeadMatch {
  id: string;
  name: string | null;
  email: string | null;
  phone_e164: string | null;
}

export function applyExistingLeadDedupe(
  rows: ParsedLeadRow[],
  existingByEmail: Map<string, ExistingLeadMatch>,
  existingByPhone: Map<string, ExistingLeadMatch>,
): {
  accepted: ParsedLeadRow[];
  skippedDuplicates: SkippedDuplicate[];
} {
  const accepted: ParsedLeadRow[] = [];
  const skippedDuplicates: SkippedDuplicate[] = [];

  for (const row of rows) {
    if (row.email) {
      const match = existingByEmail.get(row.email);
      if (match) {
        skippedDuplicates.push({
          row: row.rowNum,
          field: "email",
          value: row.email,
          existing_lead_id: match.id,
          existing_lead_name: match.name,
          reason: "existing_lead",
        });
        continue;
      }
    }
    if (row.phone_e164) {
      const match = existingByPhone.get(row.phone_e164);
      if (match) {
        skippedDuplicates.push({
          row: row.rowNum,
          field: "phone",
          value: row.phone_e164,
          existing_lead_id: match.id,
          existing_lead_name: match.name,
          reason: "existing_lead",
        });
        continue;
      }
    }
    accepted.push(row);
  }

  return { accepted, skippedDuplicates };
}

export function leadNameFromRow(row: ParsedLeadRow): string {
  return (
    row.business_name ||
    row.contact_person_name ||
    row.email ||
    row.phone_e164 ||
    `Row ${row.rowNum}`
  );
}
