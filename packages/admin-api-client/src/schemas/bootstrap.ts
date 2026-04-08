import { z } from "zod";

export const adminBootstrapUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
});

export const adminBootstrapSchema = z.object({
  user: adminBootstrapUserSchema,
  role: z.string(),
  is_superadmin: z.boolean(),
});

export type AdminBootstrap = z.infer<typeof adminBootstrapSchema>;
