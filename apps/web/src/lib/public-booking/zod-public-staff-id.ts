import { z } from "zod";
import { isPublicStaffIdForBooking } from "@beautonomi/utils";

/** `provider_staff` UUID or solo placeholder `provider-{uuid}` (validated; normalize to DB with `normalizePublicStaffIdForDatabase`). */
export const zPublicBookingStaffIdOptional = z.preprocess(
  (val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === "string") {
      const t = val.trim();
      if (t === "" || t === "any") return null;
      return t;
    }
    return val;
  },
  z
    .union([z.string(), z.null(), z.undefined()])
    .refine(
      (v) => v == null || v === undefined || isPublicStaffIdForBooking(v),
      "Invalid staff ID"
    )
);
