import { describe, expect, it } from "vitest";
import {
  redactBookingCustomerContact,
  redactBookingCustomerContacts,
  redactOnDemandRequest,
  stripStoredOnDemandContact,
} from "../redact-booking-customer-contact";

const booking = {
  id: "b1",
  customers: { id: "c1", full_name: "Ada", email: "ada@example.com", phone: "+27111111111" },
  participants: [{ participant_name: "Ada", participant_email: "ada@example.com", participant_phone: "+27111111111" }],
  participant_phones: ["+27111111111"],
};

describe("redactBookingCustomerContact", () => {
  it("keeps the name and drops email and phone", () => {
    const redacted = redactBookingCustomerContact(booking, false);
    expect(redacted.customers.full_name).toBe("Ada");
    expect(redacted.customers.email).toBeNull();
    expect(redacted.customers.phone).toBeNull();
    expect(redacted.participants[0].participant_email).toBeNull();
    expect(redacted.participants[0].participant_phone).toBeNull();
    expect(redacted.participant_phones).toEqual([]);
    expect(booking.customers.email).toBe("ada@example.com");
  });

  it("drops group participant contact and child-booking customer contact", () => {
    const group = {
      id: "g1",
      booking_participants: [{ participant_name: "Bea", participant_email: "bea@example.com", participant_phone: "+27222222222" }],
      participants: [{ client_name: "Bea", client_email: "bea@example.com", client_phone: "+27222222222" }],
      bookings: [{ id: "b2", customer: { full_name: "Bea", email: "bea@example.com", phone: "+27222222222" } }],
    };
    const redacted = redactBookingCustomerContact(group, false);
    expect(redacted.booking_participants[0].participant_name).toBe("Bea");
    expect(redacted.booking_participants[0].participant_email).toBeNull();
    expect(redacted.participants[0].client_email).toBeNull();
    expect(redacted.participants[0].client_phone).toBeNull();
    expect(redacted.bookings[0].customer.full_name).toBe("Bea");
    expect(redacted.bookings[0].customer.email).toBeNull();
    expect(group.participants[0].client_email).toBe("bea@example.com");
  });

  it("drops a product-order customer's email and phone", () => {
    const order = {
      id: "o1",
      customer: { full_name: "Cara", email: "cara@example.com", phone: "+27333333333" },
    };
    const redacted = redactBookingCustomerContact(order, false);
    expect(redacted.customer.full_name).toBe("Cara");
    expect(redacted.customer.email).toBeNull();
    expect(redacted.customer.phone).toBeNull();
    expect(order.customer.email).toBe("cara@example.com");
  });

  it("drops receipt customer contact and keeps the salon contact", () => {
    const receipt = {
      provider: { name: "Salon", email: "salon@example.com", phone: "+27000000000" },
      customer: { name: "Ada", email: "ada@example.com", phone: "+27111111111" },
      items: [{ description: "Cut", email: "ada@example.com", phone: "+27111111111" }],
    };
    const redacted = redactBookingCustomerContact(receipt, false);
    expect(redacted.provider.email).toBe("salon@example.com");
    expect(redacted.provider.phone).toBe("+27000000000");
    expect(redacted.customer.name).toBe("Ada");
    expect(redacted.customer.email).toBeNull();
    expect(redacted.items[0].description).toBe("Cut");
    expect(redacted.items[0].email).toBeNull();
    expect(receipt.customer.email).toBe("ada@example.com");
  });

  it("drops inbox contact fields and keeps the display name", () => {
    const row = {
      customer_name: "Ada",
      customer_email: "ada@example.com",
      customer_phone: "+27111111111",
    };
    const redacted = redactBookingCustomerContact(row, false);
    expect(redacted.customer_name).toBe("Ada");
    expect(redacted.customer_email).toBeNull();
    expect(redacted.customer_phone).toBeNull();
    expect(row.customer_email).toBe("ada@example.com");
  });

  it("drops waitlist match contact on the row and the nested customer", () => {
    const match = {
      customer_name: "Ada",
      customer_email: "ada@example.com",
      customer_phone: "+27111111111",
      customer: { full_name: "Ada", email: "ada@example.com" },
    };
    const redacted = redactBookingCustomerContact(match, false);
    expect(redacted.customer_name).toBe("Ada");
    expect(redacted.customer_email).toBeNull();
    expect(redacted.customer_phone).toBeNull();
    expect(redacted.customer.full_name).toBe("Ada");
    expect(redacted.customer.email).toBeNull();
    expect(match.customer.email).toBe("ada@example.com");
  });

  it("drops report and route customer email and keeps the name", () => {
    const row = {
      clientName: "Ada",
      email: "ada@example.com",
      users: { full_name: "Ada", email: "ada@example.com" },
      booking: { customer: { full_name: "Ada", email: "ada@example.com", phone: "+27111111111" } },
    };
    const redacted = redactBookingCustomerContact(row, false);
    expect(redacted.clientName).toBe("Ada");
    expect(redacted.email).toBeNull();
    expect(redacted.users.full_name).toBe("Ada");
    expect(redacted.users.email).toBeNull();
    expect(redacted.booking.customer.phone).toBeNull();
    expect(row.users.email).toBe("ada@example.com");
  });

  it("drops on-demand client email and phone and keeps the service address", () => {
    const row = {
      id: "r1",
      request_payload: {
        services: [{ title: "Cut" }],
        address_line1: "12 Main",
        client_info: { full_name: "Ada", email: "ada@example.com", phone: "0820000000" },
      },
    };
    const redacted = redactOnDemandRequest(row, false);
    expect(redacted.request_payload.client_info.full_name).toBe("Ada");
    expect(redacted.request_payload.client_info.email).toBeNull();
    expect(redacted.request_payload.client_info.phone).toBeNull();
    expect(redacted.request_payload.address_line1).toBe("12 Main");
    expect(row.request_payload.client_info.email).toBe("ada@example.com");
  });

  it("strips email and phone before an on-demand draft is stored", () => {
    const payload = {
      address_line1: "12 Main",
      email: "ada@example.com",
      client_info: { firstName: "Ada", email: "ada@example.com", phone: "0820000000" },
    };
    const stored = stripStoredOnDemandContact(payload);
    expect(stored.client_info.firstName).toBe("Ada");
    expect(stored.client_info.email).toBeNull();
    expect(stored.client_info.phone).toBeNull();
    expect(stored.email).toBeNull();
    expect(stored.address_line1).toBe("12 Main");
    expect(payload.client_info.email).toBe("ada@example.com");
  });

  it("leaves contact in place for a viewer who can see clients", () => {
    const rows = redactBookingCustomerContacts([booking], true);
    expect(rows[0].customers.email).toBe("ada@example.com");
    expect(rows[0].participant_phones).toEqual(["+27111111111"]);
  });
});
