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
  grc_roles: z.array(z.string()).optional(),
  grc_permissions: z.array(z.string()).optional(),
  feature_flags: z
    .object({
      grc_hub_enabled: z.boolean().optional(),
    })
    .optional(),
  can_access_security_compliance: z.boolean().optional(),
});

export type AdminBootstrap = z.infer<typeof adminBootstrapSchema>;
