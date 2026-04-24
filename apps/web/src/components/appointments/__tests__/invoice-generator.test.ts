import { describe, expect, it } from "vitest";
import { generateInvoiceHTMLFromData } from "../invoice-generator";

describe("generateInvoiceHTMLFromData", () => {
  it("escapes user-controlled invoice text", () => {
    const html = generateInvoiceHTMLFromData({
      invoice_number: "INV-<script>",
      invoice_date: "2026-04-24",
      receipt_header: "<img src=x onerror=alert(1)>",
      provider: {
        name: "Provider <b>",
        email: "provider@example.com",
        phone: "123",
        address: { line1: "1 <Main>", line2: "", city: "Cape Town", state: "", postal_code: "" },
      },
      customer: {
        name: "Customer <script>alert(1)</script>",
        email: "customer@example.com",
        phone: "456",
      },
      location_type: "at_salon",
      items: [
        {
          description: "Service <script>alert(2)</script>",
          staff: "Staff <img>",
          duration: 60,
          quantity: 1,
          unit_price: 100,
          total: 100,
        },
      ],
      subtotal: 100,
      discount_amount: 0,
      travel_fee: 0,
      tax_amount: 0,
      tip_amount: 0,
      total_amount: 100,
      notes: "Note <iframe>",
      receipt_footer: "Footer <object>",
    });

    expect(html).toContain("INV-&lt;script&gt;");
    expect(html).toContain("Customer &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Service &lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
  });
});
