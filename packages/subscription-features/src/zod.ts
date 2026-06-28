import { z } from "zod";
import { FEATURE_REGISTRY } from "./registry";

function fieldZodSchema(field: (typeof FEATURE_REGISTRY)[number]["fields"][number]): z.ZodTypeAny {
  switch (field.type) {
    case "toggle":
      return z.boolean().optional();
    case "limit":
      return z.number().nullable().optional();
    case "multiselect":
      return z.array(z.string()).optional();
    case "text":
      return z.string().optional();
    default:
      return z.unknown().optional();
  }
}

/** Zod schema for subscription_plans.features — one optional object per registry category. */
export function buildFeaturesZodSchema() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const category of FEATURE_REGISTRY) {
    const fieldShape: Record<string, z.ZodTypeAny> = {};
    for (const field of category.fields) {
      fieldShape[field.key] = fieldZodSchema(field);
    }
    shape[category.key] = z.object(fieldShape).partial().optional();
  }
  return z.object(shape).partial();
}

export const planFeaturesSchema = buildFeaturesZodSchema();
