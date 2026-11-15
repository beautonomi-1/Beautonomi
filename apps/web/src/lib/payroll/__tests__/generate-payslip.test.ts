import { describe, expect, it } from "vitest";
import { renderPayslipHtml, resolvePayslipTaxTreatment } from "../generate-payslip";

describe("renderPayslipHtml", () => {
  it("keeps a commission reversal inside commission and deducts the prior shortfall once", () => {
    const html = renderPayslipHtml({
      staffName: "Alex & Co",
      employerName: "Salon <One>",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      currency: "ZAR",
      commission: 230,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 230,
      clawback: 20,
      carryIn: 50,
      manual: 0,
      tax: 10,
      uif: 2,
      net: 168,
      carryOut: 0,
    });

    expect(html).toContain("Alex &amp; Co");
    expect(html).toContain("Salon &lt;One&gt;");
    expect(html).toContain("230.00");
    expect(html).toContain("already includes 20.00");
    expect(html).toContain("Carry-forward from last pay run");
    expect(html).toContain("62.00");
    expect(html).toContain("168.00");
    expect(html).not.toContain("Carried to the next pay run");
    expect(html).not.toContain("<td>Commission clawback</td>");
    expect(html).not.toContain("Other earnings");
  });

  it("adds the remainder so the earnings lines equal gross pay", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-07",
      currency: "ZAR",
      commission: 80,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 100,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 0,
      uif: 0,
      net: 100,
      carryOut: 0,
    });
    expect(html).not.toContain("amount recorded on this pay run");
    expect(html).toContain("Other earnings");
    expect(html).toContain("20.00");
    expect(html).toContain("100.00");
  });

  it("shows a zero net and the next-period shortfall when deductions exceed gross", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-01-08",
      periodEnd: "2026-01-14",
      currency: "ZAR",
      commission: 100,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 100,
      clawback: 0,
      carryIn: 150,
      manual: 0,
      tax: 0,
      uif: 0,
      net: 0,
      carryOut: 50,
    });

    expect(html).toContain(">0.00<");
    expect(html).toContain("150.00");
    expect(html).toContain("Shortfall carried to the next pay run: 50.00");
    expect(html).not.toContain("amount recorded on this pay run");
  });

  it("keeps a recorded net that does not match the lines and says so", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      currency: "ZAR",
      commission: 100,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 100,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 0,
      uif: 0,
      net: 40,
      carryOut: 0,
    });
    expect(html).toContain("40.00");
    expect(html).toContain("amount recorded on this pay run");
  });

  it("states employee PAYE is an estimate and that a fixed end date only prorates salary", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currency: "ZAR",
      commission: 0,
      hourly: 0,
      salary: 1000,
      tips: 0,
      gross: 1000,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 100,
      uif: 10,
      net: 890,
      carryOut: 0,
      engagement: "employee",
      taxTreatment: "estimated",
      proratedToEmploymentEnd: true,
    });
    expect(html).toContain("PAYE (estimate)");
    expect(html).toContain("UIF (employee)");
    expect(html).toContain("limited to the employment dates");
    expect(html).not.toContain("Independent contractor");
  });

  it("states a contractor is not on PAYE or UIF even when an amount was typed in", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currency: "ZAR",
      commission: 500,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 500,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 40,
      uif: 0,
      net: 460,
      carryOut: 0,
      engagement: "contractor",
      taxTreatment: "entered",
      proratedToEmploymentEnd: true,
    });
    expect(html).toContain("Independent contractor");
    expect(html).toContain("not calculated");
    expect(html).toContain("limited to the employment dates");
    expect(html).not.toContain("still apply");
    expect(html).toContain(">PAYE<");
    expect(html).toContain("40.00");
  });

  it("states an apprentice uses employee tax and has no learnership allowance", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currency: "ZAR",
      commission: 0,
      hourly: 800,
      salary: 0,
      tips: 0,
      gross: 800,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 0,
      uif: 8,
      net: 792,
      carryOut: 0,
      engagement: "apprentice",
      taxTreatment: "estimated",
    });
    expect(html).toContain("Apprentice");
    expect(html).toContain("learnership allowance is not applied");
  });

  it("states PAYE and UIF were left off when statutory mode is none", () => {
    const html = renderPayslipHtml({
      staffName: "Alex",
      employerName: "Salon",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currency: "ZAR",
      commission: 200,
      hourly: 0,
      salary: 0,
      tips: 0,
      gross: 200,
      clawback: 0,
      carryIn: 0,
      manual: 0,
      tax: 0,
      uif: 0,
      net: 200,
      carryOut: 0,
      engagement: "employee",
      taxTreatment: "not_calculated",
    });
    expect(html).toContain("were not calculated");
    expect(html).not.toContain("PAYE (estimate)");
  });
});

describe("resolvePayslipTaxTreatment", () => {
  it("keeps contractors off calculated tax unless an amount was entered", () => {
    expect(
      resolvePayslipTaxTreatment({
        engagement: "contractor",
        statutoryMode: "none",
        tax: 0,
        uif: 0,
        gross: 500,
      }),
    ).toBe("not_calculated");
    expect(
      resolvePayslipTaxTreatment({
        engagement: "contractor",
        statutoryMode: "none",
        tax: 40,
        uif: 0,
        gross: 500,
      }),
    ).toBe("entered");
  });

  it("treats a positive gross with no PAYE and no UIF as not calculated", () => {
    expect(
      resolvePayslipTaxTreatment({
        engagement: "employee",
        statutoryMode: "auto",
        tax: 0,
        uif: 0,
        gross: 1000,
      }),
    ).toBe("not_calculated");
  });

  it("treats an employee UIF or PAYE figure on automatic mode as an estimate", () => {
    expect(
      resolvePayslipTaxTreatment({
        engagement: "apprentice",
        statutoryMode: "auto",
        tax: 0,
        uif: 8,
        gross: 800,
      }),
    ).toBe("estimated");
  });
});
