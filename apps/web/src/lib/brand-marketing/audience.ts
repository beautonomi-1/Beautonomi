import { z } from "zod";

export const brandAudienceSchema = z.object({
  segment: z.enum(["customer", "provider"]).default("customer"),
  personas: z.array(z.string()).default([]),
  cities: z.array(z.string()).default([]),
  age_bands: z.array(z.string()).default([]),
  gender: z.array(z.string()).default([]),
  service_categories: z.array(z.string()).default([]),
  lifecycle: z.enum(["new", "lapsed", "loyal", "all"]).default("all"),
  insight: z.string().optional(),
  estimated_reachable: z.number().optional(),
});

export type BrandAudience = z.infer<typeof brandAudienceSchema>;

export function parseAudienceDefinition(raw: unknown): BrandAudience {
  if (raw == null || typeof raw !== "object") return brandAudienceSchema.parse({});
  const o = raw as Record<string, unknown>;
  const parsed = brandAudienceSchema.safeParse({
    segment: o.segment ?? o.audience_type ?? "customer",
    personas: o.personas ?? o.persona ?? [],
    cities: o.cities ?? o.city ?? [],
    age_bands: o.age_bands ?? o.ageBands ?? [],
    gender: o.gender ?? [],
    service_categories: o.service_categories ?? o.categories ?? [],
    lifecycle: o.lifecycle ?? "all",
    insight: typeof o.insight === "string" ? o.insight : undefined,
    estimated_reachable: typeof o.estimated_reachable === "number" ? o.estimated_reachable : undefined,
  });
  return parsed.success ? parsed.data : brandAudienceSchema.parse({});
}

export function audienceToJson(a: BrandAudience): Record<string, unknown> {
  return { ...a };
}
