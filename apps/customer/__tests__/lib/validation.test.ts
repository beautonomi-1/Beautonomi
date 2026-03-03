import {
  phoneSchema,
  otpSchema,
  emailLoginSchema,
  emailSignupSchema,
  reviewSchema,
  bookingAddressSchema,
} from "@/lib/validation";

describe("phoneSchema", () => {
  it("accepts valid phone data", () => {
    const result = phoneSchema.safeParse({
      countryCode: "+27",
      phone: "821234567",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty phone", () => {
    const result = phoneSchema.safeParse({
      countryCode: "+27",
      phone: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone with letters", () => {
    const result = phoneSchema.safeParse({
      countryCode: "+27",
      phone: "82abc4567",
    });
    expect(result.success).toBe(false);
  });

  it("rejects too short phone", () => {
    const result = phoneSchema.safeParse({
      countryCode: "+27",
      phone: "12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("otpSchema", () => {
  it("accepts 6 digit code", () => {
    const result = otpSchema.safeParse({ code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejects 5 digit code", () => {
    const result = otpSchema.safeParse({ code: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric code", () => {
    const result = otpSchema.safeParse({ code: "12345a" });
    expect(result.success).toBe(false);
  });
});

describe("emailLoginSchema", () => {
  it("accepts valid email and password", () => {
    const result = emailLoginSchema.safeParse({
      email: "user@example.com",
      password: "Password1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = emailLoginSchema.safeParse({
      email: "not-an-email",
      password: "Password1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = emailLoginSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("emailSignupSchema", () => {
  it("accepts valid signup data", () => {
    const result = emailSignupSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password without uppercase", () => {
    const result = emailSignupSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "password1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without number", () => {
    const result = emailSignupSchema.safeParse({
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password",
    });
    expect(result.success).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("accepts valid review", () => {
    const result = reviewSchema.safeParse({
      rating: 5,
      comment: "Great service and lovely atmosphere!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects 0 rating", () => {
    const result = reviewSchema.safeParse({
      rating: 0,
      comment: "Some review text here.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short comment", () => {
    const result = reviewSchema.safeParse({
      rating: 4,
      comment: "Good",
    });
    expect(result.success).toBe(false);
  });
});

describe("bookingAddressSchema", () => {
  it("accepts valid address", () => {
    const result = bookingAddressSchema.safeParse({
      address: "123 Main Street",
      city: "Cape Town",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty address", () => {
    const result = bookingAddressSchema.safeParse({
      address: "",
      city: "Cape Town",
    });
    expect(result.success).toBe(false);
  });
});
