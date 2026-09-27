import type { MeasuredCampaignSlice } from "./measured";

export type FunnelStep = {
  id: string;
  label: string;
  value: number | null;
  source: "measured" | "entered" | "estimated" | "amplitude";
  hint: string;
  rateFromPrior: number | null;
  amplitude?: { events: string[]; filter: string };
};

export function rateBetween(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  if (current !== current || prior !== prior) return null;
  return Math.round((current / prior) * 1000) / 10;
}

export function buildDemandFunnel(input: {
  trackingCode: string;
  measured: MeasuredCampaignSlice;
  enteredReach: number;
  enteredClicks: number;
}): FunnelStep[] {
  const reach = input.enteredReach;
  const clicks = input.enteredClicks + input.measured.ads_clicks;
  const signups = input.measured.signups;
  const bookings =
    input.measured.promo_redemptions +
    (input.measured.attributed_booking_value > 0 ? 1 : 0); // show redemption count primary

  const steps: FunnelStep[] = [
    {
      id: "reach",
      label: "Reach",
      value: reach,
      source: "entered",
      hint: "Sum of entered impressions / estimated reach in period",
      rateFromPrior: null,
    },
    {
      id: "response",
      label: "Response (clicks)",
      value: clicks,
      source: clicks === input.measured.ads_clicks && input.measured.ads_clicks > 0 ? "measured" : "entered",
      hint: "Entered paid clicks plus measured in-app ad clicks",
      rateFromPrior: rateBetween(clicks, reach),
    },
    {
      id: "on_site",
      label: "On site / in app",
      value: null,
      source: "amplitude",
      hint: "Open Amplitude with filter below — not computed in admin",
      rateFromPrior: null,
      amplitude: {
        events: ["page_view", "app_open"],
        filter: `brand_campaign_code = "${input.trackingCode}"`,
      },
    },
    {
      id: "signup",
      label: "Signup",
      value: signups,
      source: "measured",
      hint: "Users with first_touch_utm_campaign matching code (UTC created_at)",
      rateFromPrior: rateBetween(signups, clicks),
    },
    {
      id: "booking",
      label: "Booking (promo redemptions)",
      value: input.measured.promo_redemptions,
      source: "measured",
      hint: "promotion_usage in period; booking value on scorecard",
      rateFromPrior: rateBetween(input.measured.promo_redemptions, signups),
    },
  ];
  return steps;
}

export function buildSupplyFunnel(input: {
  measured: MeasuredCampaignSlice;
}): FunnelStep[] {
  const leads = input.measured.leads_created;
  const won = input.measured.leads_won;
  return [
    {
      id: "leads",
      label: "Leads created",
      value: leads,
      source: "measured",
      hint: "provider_leads.campaign_id = campaign code, created in period",
      rateFromPrior: null,
    },
    {
      id: "won",
      label: "Won / matched (as of now)",
      value: won,
      source: "measured",
      hint: "Current stage of leads created in window — not period transitions",
      rateFromPrior: rateBetween(won, leads),
    },
  ];
}
