import { describe, expect, it } from "vitest";
import {
  applyExistingLeadDedupe,
  applyInFileDedupe,
  buildHeaderMap,
  filterDataRows,
  isEnrichmentToken,
  looksLikeEmail,
  looksLikePhone,
  parseCSVRecords,
  parseEnrichmentToken,
  parseLeadImportFile,
  sniffRowFields,
  type ExistingLeadMatch,
  type ParsedLeadRow,
} from "../leads-csv-import";

const catLookup = new Map<string, string>([
  ["hair", "cat-hair"],
  ["nails", "cat-nails"],
  ["makeup", "cat-makeup"],
  ["brows & lashes", "cat-brows"],
  ["braids", "cat-braids"],
]);

describe("parseCSVRecords", () => {
  it("parses quoted fields that span newlines", () => {
    const text = 'name,notes\n"Glow Salon","Line one\nLine two"';
    const rows = parseCSVRecords(text, ",");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["Glow Salon", "Line one\nLine two"]);
  });

  it("handles tab delimiters", () => {
    const text = "name\temail\nGlow\thello@test.com";
    const rows = parseCSVRecords(text, "\t");
    expect(rows[1]).toEqual(["Glow", "hello@test.com"]);
  });
});

describe("filterDataRows", () => {
  it("drops comment and empty rows", () => {
    const rows = filterDataRows([
      ["# comment"],
      [],
      ["name", "email"],
      ["Glow", "a@b.com"],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("name");
  });
});

describe("buildHeaderMap", () => {
  it("maps export-style business and contact columns separately", () => {
    const map = buildHeaderMap(["Business Name", "Contact Person", "Email"]);
    expect(map.business_name).toBe(0);
    expect(map.contact_person_name).toBe(1);
    expect(map.email).toBe(2);
  });

  it("maps export-style phone E.164 column", () => {
    const map = buildHeaderMap(["Business Name", "Phone E.164", "Email"]);
    expect(map.business_name).toBe(0);
    expect(map.phone).toBe(1);
    expect(map.email).toBe(2);
  });
});

describe("parseLeadImportFile", () => {
  it("parses rows with separate business and contact columns", () => {
    const csv = [
      "business_name,contact_person_name,email",
      "Glow Salon,Thandi Mokoena,thandi@test.com",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);
    expect(result.parsedRows).toHaveLength(1);
    expect(result.parsedRows[0].business_name).toBe("Glow Salon");
    expect(result.parsedRows[0].contact_person_name).toBe("Thandi Mokoena");
    expect(result.parsedRows[0].email).toBe("thandi@test.com");
  });

  it("parses export round-trip columns", () => {
    const csv = [
      "Business Name,Contact Person,Email,Phone E.164,Country,Categories",
      "Glow Salon,Thandi Mokoena,thandi@test.com,+27711234567,South Africa,Hair",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);
    expect(result.parsedRows[0].business_name).toBe("Glow Salon");
    expect(result.parsedRows[0].contact_person_name).toBe("Thandi Mokoena");
    expect(result.parsedRows[0].email).toBe("thandi@test.com");
    expect(result.parsedRows[0].phone_e164).toBe("+27711234567");
    expect(result.parsedRows[0].country).toBe("South Africa");
    expect(result.parsedRows[0].categoryIds).toEqual(["cat-hair"]);
  });

  it("parses referrer_email and referrer_phone columns", () => {
    const csv = [
      "business_name,email,referrer_email,referrer_phone,source_detail",
      "New Salon,new@test.com,ref@test.com,+27710000000,Manual note",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);
    expect(result.parsedRows[0].referrer_email).toBe("ref@test.com");
    expect(result.parsedRows[0].referrer_phone).toBe("+27710000000");
    expect(result.parsedRows[0].source_detail).toBe("Manual note");
  });

  it("recovers misaligned enrichment export rows instead of importing shifted values", () => {
    const csv = [
      "name,email,phone,location,country,category,description,source,notes,tags",
      "Angel Artis,username,rating=4.9,+27711234567,Sandton,South Africa,Makeup,Brows & Lashes,Braids,outbound,Enriched from Malakyt search Algolia hits by email match,\"malakyt, unique-lead, enriched-from-search, has-phone, has-location\"",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);

    expect(result.recoveredRows).toBe(1);
    const row = result.parsedRows[0];
    expect(row.contact_person_name).toBe("Angel Artis");
    expect(row.email).toBeNull();
    expect(row.phone_e164).toBe("+27711234567");
    expect(row.suggested_location_text).toBe("Sandton");
    expect(row.country).toBe("South Africa");
    expect(row.source).toBe("outbound");
    expect(row.categoryIds).toEqual(
      expect.arrayContaining(["cat-makeup", "cat-brows", "cat-braids"]),
    );
    expect(row.tags).toEqual(
      expect.arrayContaining([
        "malakyt",
        "unique-lead",
        "enriched-from-search",
        "has-phone",
        "has-location",
      ]),
    );
    expect(row.notes).toContain("Enriched from Malakyt search");
    expect(row.notes).toContain("username");
    expect(row.notes).toContain("rating=4.9");
    expect(row.warnings.some((w) => w.field === "row")).toBe(true);
  });

  it("does not recover well-formed rows", () => {
    const csv = [
      "name,email,phone,location,country,category,description,source,notes,tags",
      "Glow Salon,hello@glow.com,+27719876543,Sandton,South Africa,Hair,Great salon,outbound,Some notes,prospect",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);

    expect(result.recoveredRows).toBe(0);
    expect(result.parsedRows[0].business_name).toBe("Glow Salon");
    expect(result.parsedRows[0].email).toBe("hello@glow.com");
    expect(result.parsedRows[0].phone_e164).toBe("+27719876543");
    expect(result.parsedRows[0].categoryIds).toEqual(["cat-hair"]);
    expect(result.parsedRows[0].tags).toEqual(["prospect"]);
    expect(result.parsedRows[0].warnings.some((w) => w.field === "row")).toBe(false);
  });

  it("preserves valid positional notes when trailing enrichment columns trigger recovery", () => {
    const csv = [
      "name,email,phone,location,country,category,description,source,notes,tags",
      "Glow Salon,hello@glow.com,+27719876543,Sandton,South Africa,Hair,Great salon,outbound,Some notes,prospect,username,rating=4.9",
    ].join("\n");
    const result = parseLeadImportFile(csv, catLookup);
    const row = result.parsedRows[0];

    expect(result.recoveredRows).toBe(1);
    expect(row.email).toBe("hello@glow.com");
    expect(row.tags).toEqual(["prospect"]);
    expect(row.notes).toContain("Some notes");
    expect(row.notes).toContain("username");
    expect(row.notes).toContain("rating=4.9");
  });
});

describe("content sniffing helpers", () => {
  it("detects enrichment tokens", () => {
    expect(parseEnrichmentToken("username")).toEqual({ key: "username", value: null });
    expect(parseEnrichmentToken("rating=4.9")).toEqual({ key: "rating", value: "4.9" });
    expect(parseEnrichmentToken("social=https://instagram.com/angel")).toEqual({
      key: "social",
      value: "https://instagram.com/angel",
    });
    expect(isEnrichmentToken("hello@glow.com")).toBe(false);
  });

  it("sniffs email and phone from shifted cells", () => {
    const sniffed = sniffRowFields(
      ["Angel Artis", "username", "rating=4.9", "+27711234567", "Sandton"],
      catLookup,
    );
    expect(sniffed.contact_person_name).toBe("Angel Artis");
    expect(sniffed.phone_e164).toBe("+27711234567");
    expect(sniffed.suggested_location_text).toBe("Sandton");
    expect(looksLikeEmail("username")).toBe(false);
    expect(looksLikePhone("rating=4.9")).toBe(false);
  });
});

describe("applyInFileDedupe", () => {
  it("skips later rows with the same email or phone", () => {
    const rows: ParsedLeadRow[] = [
      {
        rowNum: 2,
        business_name: "A",
        contact_person_name: null,
        email: "dup@test.com",
        phone_e164: "+27111111111",
        phone_country_code: "+27",
        phone_national: "111111111",
        suggested_location_text: null,
        country: null,
        description: null,
        notes: null,
        source: "import",
        source_detail: null,
        referrer_email: null,
        referrer_phone: null,
        referrer_user_id: null,
        referrer_provider_id: null,
        tags: [],
        categoryIds: [],
        warnings: [],
      },
      {
        rowNum: 3,
        business_name: "B",
        contact_person_name: null,
        email: "dup@test.com",
        phone_e164: null,
        phone_country_code: null,
        phone_national: null,
        suggested_location_text: null,
        country: null,
        description: null,
        notes: null,
        source: "import",
        source_detail: null,
        referrer_email: null,
        referrer_phone: null,
        referrer_user_id: null,
        referrer_provider_id: null,
        tags: [],
        categoryIds: [],
        warnings: [],
      },
      {
        rowNum: 4,
        business_name: "C",
        contact_person_name: null,
        email: null,
        phone_e164: "+27111111111",
        phone_country_code: "+27",
        phone_national: "111111111",
        suggested_location_text: null,
        country: null,
        description: null,
        notes: null,
        source: "import",
        source_detail: null,
        referrer_email: null,
        referrer_phone: null,
        referrer_user_id: null,
        referrer_provider_id: null,
        tags: [],
        categoryIds: [],
        warnings: [],
      },
    ];

    const result = applyInFileDedupe(rows);
    expect(result.accepted).toHaveLength(1);
    expect(result.skippedDuplicates).toHaveLength(2);
    expect(result.skippedDuplicates[0].reason).toBe("in_file");
  });
});

describe("applyExistingLeadDedupe", () => {
  it("skips rows that match existing leads by email or phone", () => {
    const rows: ParsedLeadRow[] = [
      {
        rowNum: 2,
        business_name: "A",
        contact_person_name: null,
        email: "exists@test.com",
        phone_e164: "+27222222222",
        phone_country_code: "+27",
        phone_national: "222222222",
        suggested_location_text: null,
        country: null,
        description: null,
        notes: null,
        source: "import",
        source_detail: null,
        referrer_email: null,
        referrer_phone: null,
        referrer_user_id: null,
        referrer_provider_id: null,
        tags: [],
        categoryIds: [],
        warnings: [],
      },
      {
        rowNum: 3,
        business_name: "B",
        contact_person_name: null,
        email: null,
        phone_e164: "+27333333333",
        phone_country_code: "+27",
        phone_national: "333333333",
        suggested_location_text: null,
        country: null,
        description: null,
        notes: null,
        source: "import",
        source_detail: null,
        referrer_email: null,
        referrer_phone: null,
        referrer_user_id: null,
        referrer_provider_id: null,
        tags: [],
        categoryIds: [],
        warnings: [],
      },
    ];

    const existingByEmail = new Map<string, ExistingLeadMatch>([
      ["exists@test.com", { id: "lead-1", name: "Existing Lead", email: "exists@test.com", phone_e164: null }],
    ]);
    const existingByPhone = new Map<string, ExistingLeadMatch>([
      ["+27333333333", { id: "lead-2", name: "Phone Lead", email: null, phone_e164: "+27333333333" }],
    ]);

    const result = applyExistingLeadDedupe(rows, existingByEmail, existingByPhone);
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedDuplicates).toHaveLength(2);
    expect(result.skippedDuplicates[0].existing_lead_id).toBe("lead-1");
    expect(result.skippedDuplicates[1].existing_lead_id).toBe("lead-2");
  });
});
