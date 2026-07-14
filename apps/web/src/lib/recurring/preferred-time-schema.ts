import { z } from "zod";

/** HH:MM or HH:MM:SS (24-hour). */
export const PREFERRED_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const preferredTimeSchema = z
  .string()
  .regex(PREFERRED_TIME_REGEX, "preferred_time must be HH:MM or HH:MM:SS");
