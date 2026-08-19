import {
  countCampaignsByChip,
  filterCampaignsByChip,
  isPastCampaign,
  listClearableDraftCampaigns,
  type FilterableCampaign,
} from "@/lib/ads/campaign-filters";

const sample: FilterableCampaign[] = [
  { id: "1", lifecycle: "active", payment_state: "paid" },
  { id: "2", lifecycle: "awaiting_payment", payment_state: "unpaid" },
  { id: "3", lifecycle: "payment_failed", payment_state: "failed" },
  { id: "4", lifecycle: "expired", payment_state: "paid" },
  { id: "5", lifecycle: "awaiting_payment", payment_state: "pending" },
];

describe("campaign-filters", () => {
  it("isPastCampaign detects ended lifecycles", () => {
    expect(isPastCampaign("expired")).toBe(true);
    expect(isPastCampaign("active")).toBe(false);
  });

  it("countCampaignsByChip returns expected buckets", () => {
    const counts = countCampaignsByChip(sample);
    expect(counts.all).toBe(4);
    expect(counts.needs_payment).toBe(2);
    expect(counts.payment_failed).toBe(1);
    expect(counts.active).toBe(1);
    expect(counts.past).toBe(1);
  });

  it("filterCampaignsByChip filters needs_payment", () => {
    const rows = filterCampaignsByChip(sample, "needs_payment");
    expect(rows.map((r) => r.id)).toEqual(["2", "5"]);
  });

  it("filterCampaignsByChip hides past on all unless showPast", () => {
    const rows = filterCampaignsByChip(sample, "all");
    expect(rows.some((r) => r.id === "4")).toBe(false);
    const withPast = filterCampaignsByChip(sample, "all", { showPast: true });
    expect(withPast.some((r) => r.id === "4")).toBe(true);
  });

  it("listClearableDraftCampaigns finds unpaid and failed drafts", () => {
    const drafts = listClearableDraftCampaigns(sample);
    expect(drafts.map((d) => d.id).sort()).toEqual(["2", "3", "5"]);
  });
});
