import { z } from "zod";

export const COPILOT_ENTITY_TYPES = [
  "provider",
  "user",
  "booking",
  "support_ticket",
  "payout",
  "refund",
  "fraud_case",
  "content_report",
] as const;

export type CopilotEntityType = (typeof COPILOT_ENTITY_TYPES)[number];

export const copilotEntityRefSchema = z.object({
  entityType: z.enum(COPILOT_ENTITY_TYPES),
  entityId: z.string().min(1),
  label: z.string().optional(),
});

export const copilotPageContextSchema = copilotEntityRefSchema;

export const copilotMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

export const copilotInputSchema = z.object({
  question: z.string().min(1).max(2000),
  tenantId: z.string().uuid(),
  adminRole: z.string(),
  adminUserId: z.string().uuid(),
  allowedSections: z.array(z.string()),
  pageContext: copilotPageContextSchema.optional(),
  selectedEntity: copilotEntityRefSchema.optional(),
  conversationId: z.string().uuid().optional(),
  messages: z.array(copilotMessageSchema).max(16).optional(),
  resolvedEntities: z.record(z.string(), copilotEntityRefSchema).optional(),
});

export type CopilotInput = z.infer<typeof copilotInputSchema>;

export type CopilotDisambiguationOption = {
  entityType: CopilotEntityType;
  entityId: string;
  label: string;
  subtitle?: string;
};

export type CopilotResolvedEntities = Record<string, z.infer<typeof copilotEntityRefSchema>>;
