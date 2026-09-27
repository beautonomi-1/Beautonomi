import { z } from "zod";
import type { GrcField, GrcModuleConfig } from "@beautonomi/admin-access";
import { grcBadRequest } from "./errors";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

function fieldSchema(field: GrcField): z.ZodType {
  let base: z.ZodType;
  switch (field.type) {
    case "number": {
      let n = z.coerce.number().int();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      base = n;
      break;
    }
    case "boolean":
      base = z.boolean();
      break;
    case "date":
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
      break;
    case "datetime":
      base = z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date/time")
        .transform((s) => new Date(s).toISOString());
      break;
    case "select": {
      const values = (field.options ?? []).map((o) => o.value);
      base = z.enum(values as [string, ...string[]]);
      break;
    }
    case "user":
      base = z.uuid();
      break;
    case "ref":
      base = z.string().min(1).max(200);
      break;
    default: {
      let s = z.string().trim().max(field.maxLength ?? (field.type === "text" ? 500 : 50_000));
      if (field.pattern) s = s.regex(new RegExp(field.pattern), field.help ?? "Invalid format");
      if (field.required) s = s.min(1, "Required");
      base = s;
    }
  }
  if (field.type === "boolean") return field.required ? base : base.optional();
  return field.required ? z.preprocess((v) => (v === "" ? undefined : v), base) : z.preprocess(emptyToNull, base.nullable()).optional();
}

/** Strict whitelist schema for a module: unknown keys are rejected, workflow-only fields don't exist. */
export function grcRecordSchema(mod: GrcModuleConfig, mode: "create" | "update") {
  const shape: Record<string, z.ZodType> = {};
  for (const f of mod.fields) {
    if (f.readOnly) continue;
    if (mode === "update" && f.createOnly) continue;
    const s = fieldSchema(f);
    shape[f.key] = mode === "update" ? s.optional() : s;
  }
  return z.strictObject(shape);
}

export function parseGrcRecord(mod: GrcModuleConfig, mode: "create" | "update", body: unknown): Record<string, unknown> {
  const parsed = grcRecordSchema(mod, mode).safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.join(".");
    const label = mod.fields.find((f) => f.key === field)?.label ?? field;
    throw grcBadRequest(label ? `${label}: ${issue?.message}` : issue?.message ?? "Invalid input");
  }
  const out = Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined));
  if (mode === "update" && Object.keys(out).length === 0) throw grcBadRequest("Nothing to update");
  return out;
}

/** Columns fetched for list views: table columns plus id/label/status and anything the UI needs to link. */
export function grcListColumns(mod: GrcModuleConfig): string {
  const cols = new Set<string>([mod.idColumn, mod.labelColumn, ...mod.columns.map((c) => c.key)]);
  if (mod.statusColumn) cols.add(mod.statusColumn);
  for (const f of mod.fields) if (f.type === "ref" || f.type === "user") cols.add(f.key);
  return Array.from(cols).join(",");
}

export const GRC_LIST_LIMIT = 500;
