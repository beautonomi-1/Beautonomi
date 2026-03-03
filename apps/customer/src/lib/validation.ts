import { z } from "zod";

/**
 * Shared validation schemas using Zod.
 * Used with react-hook-form via @hookform/resolvers/zod.
 */

// ── Auth Schemas ─────────────────────────────────────────────────────────────

export const phoneSchema = z.object({
  countryCode: z.string().min(1, "Country code is required"),
  phone: z
    .string()
    .min(6, "Phone number must be at least 6 digits")
    .max(15, "Phone number is too long")
    .regex(/^\d+$/, "Phone number must contain only digits"),
});

export const otpSchema = z.object({
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Code must contain only digits"),
});

export const emailLoginSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const emailSignupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

// ── Profile Schemas ──────────────────────────────────────────────────────────

export const personalInfoSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Please enter a valid email address"),
  phone: z.string().optional(),
});

export const addressSchema = z.object({
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().min(1, "Country is required"),
});

// ── Booking Schemas ──────────────────────────────────────────────────────────

export const bookingAddressSchema = z.object({
  address: z.string().min(3, "Please enter a valid address"),
  city: z.string().min(2, "City is required"),
});

export const reviewSchema = z.object({
  rating: z.number().min(1, "Please select a rating").max(5),
  comment: z
    .string()
    .min(10, "Review must be at least 10 characters")
    .max(2000, "Review is too long"),
});

// ── Business Schemas ─────────────────────────────────────────────────────────

export const businessEmailSchema = z.object({
  email: z
    .email("Please enter a valid email address")
    .refine(
      (val) => {
        const free = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];
        const domain = val.split("@")[1]?.toLowerCase();
        return domain != null && !free.includes(domain);
      },
      { message: "Please use a business email address" }
    ),
});

// ── Type Exports ─────────────────────────────────────────────────────────────

export type PhoneFormData = z.infer<typeof phoneSchema>;
export type OtpFormData = z.infer<typeof otpSchema>;
export type EmailLoginFormData = z.infer<typeof emailLoginSchema>;
export type EmailSignupFormData = z.infer<typeof emailSignupSchema>;
export type PersonalInfoFormData = z.infer<typeof personalInfoSchema>;
export type AddressFormData = z.infer<typeof addressSchema>;
export type BookingAddressFormData = z.infer<typeof bookingAddressSchema>;
export type ReviewFormData = z.infer<typeof reviewSchema>;
export type BusinessEmailFormData = z.infer<typeof businessEmailSchema>;
