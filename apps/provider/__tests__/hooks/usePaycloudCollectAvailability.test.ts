import { computePaycloudBookingChargeAmount } from "../../src/hooks/usePaycloudCollectAvailability";

describe("computePaycloudBookingChargeAmount", () => {
  it("charges deposit when still due", () => {
    expect(
      computePaycloudBookingChargeAmount({
        outstanding: 1000,
        depositRequired: true,
        depositAmount: 300,
        totalPaid: 0,
      }),
    ).toEqual({ chargeAmount: 300, depositAmount: 300, fullOutstanding: 1000 });
  });

  it("charges full outstanding after deposit satisfied", () => {
    expect(
      computePaycloudBookingChargeAmount({
        outstanding: 700,
        depositRequired: true,
        depositAmount: 300,
        totalPaid: 300,
      }),
    ).toEqual({ chargeAmount: 700, depositAmount: null, fullOutstanding: 700 });
  });
});
