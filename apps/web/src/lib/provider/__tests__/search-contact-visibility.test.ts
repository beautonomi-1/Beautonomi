import { describe, expect, it } from "vitest";
import {
  bookingCustomerLabel,
  clientSearchSuggestion,
} from "@/lib/provider/search-contact-visibility";

const customer = {
  id: "user-1",
  full_name: "Ada",
  email: "ada@example.com",
  phone: "0820000000",
};

describe("provider search contact visibility", () => {
  it("hides client email and phone when the viewer cannot see clients", () => {
    expect(clientSearchSuggestion(customer, "pc-1", false)).toBeNull();
    expect(bookingCustomerLabel(customer, false)).toBe("Ada");
    expect(bookingCustomerLabel({ email: "ada@example.com" }, false)).toBe("");
  });

  it("keeps the contact line for someone who can see clients", () => {
    expect(clientSearchSuggestion(customer, "pc-1", true)?.subtitle).toBe("ada@example.com");
    expect(bookingCustomerLabel({ email: "ada@example.com" }, true)).toBe("ada@example.com");
  });
});
