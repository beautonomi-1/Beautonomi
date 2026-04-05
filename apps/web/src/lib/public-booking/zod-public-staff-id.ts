import { z } from "zod";
import { isPublicStaffIdForBooking } from "@beautonomi/utils";

/** `provider_staff` UUID or solo placeholder `provider-{uuid}` (validated; normalize to DB with `normalizePublicStaffIdForDatabase`). */
export const zPublicBookingStaffIdOptional = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) => v == null || v === "" || isPublicStaffIdForBooking(v),
    "Invalid staff ID"
  );
