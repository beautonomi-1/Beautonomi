export interface BadgeBenefits {
  free_subscription?: boolean;
  featured?: boolean;
}

export interface BadgeRequirements {
  points?: number;
  min_rating?: number;
  min_reviews?: number;
  min_bookings?: number;
}

export type LadderBadgeStatus = "current" | "earned" | "next" | "locked";

export interface LadderBadge {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tier: number;
  color?: string | null;
  icon_url?: string | null;
  requirements?: BadgeRequirements;
  benefits?: BadgeBenefits;
  status: LadderBadgeStatus;
  points_required: number;
}

const MILESTONE_META: Record<string, { label: string }> = {
  first_booking: { label: "First booking" },
  "10_bookings": { label: "10 bookings" },
  ten_bookings: { label: "10 bookings" },
  "50_bookings": { label: "50 bookings" },
  fifty_bookings: { label: "50 bookings" },
  "100_bookings": { label: "100 bookings" },
  hundred_bookings: { label: "100 bookings" },
  "500_bookings": { label: "500 bookings" },
  five_hundred_bookings: { label: "500 bookings" },
  "1000_bookings": { label: "1000 bookings" },
  thousand_bookings: { label: "1000 bookings" },
  "100_reviews": { label: "100 reviews" },
  "10_reviews": { label: "10 reviews" },
  ten_reviews: { label: "10 reviews" },
  "50_reviews": { label: "50 reviews" },
  fifty_reviews: { label: "50 reviews" },
  first_review: { label: "First review" },
  perfect_rating: { label: "Perfect rating" },
  perfect_rating_month: { label: "Perfect rating month" },
};

export function formatGamificationDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatPointSource(source: string): string {
  const sourceMap: Record<string, string> = {
    booking_completed: "Completed booking",
    review_received: "Review received",
    milestone: "Milestone achievement",
    admin_adjustment: "Admin adjustment",
  };
  return sourceMap[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function formatMilestoneLabel(type: string): string {
  return (
    MILESTONE_META[type]?.label ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function formatRequirementHint(req?: BadgeRequirements): string | null {
  if (!req) return null;
  const parts: string[] = [];
  if (req.points) parts.push(`${req.points.toLocaleString()} pts`);
  if (req.min_reviews) parts.push(`${req.min_reviews}+ reviews`);
  if (req.min_bookings) parts.push(`${req.min_bookings}+ bookings`);
  if (req.min_rating) parts.push(`${req.min_rating}+ rating`);
  return parts.length ? parts.join(" · ") : null;
}

export function badgeAccentColor(color: string | null | undefined): string {
  return color && /^#/.test(color) ? color : "#FF0077";
}

export function ladderStatusLabel(status: LadderBadgeStatus): string {
  switch (status) {
    case "current":
      return "Current";
    case "earned":
      return "Unlocked";
    case "next":
      return "Up next";
    default:
      return "Locked";
  }
}

export const EARN_TIPS = [
  {
    title: "Complete bookings",
    body: "Every finished appointment adds points toward your next level.",
  },
  {
    title: "Earn great reviews",
    body: "Happy clients boost your rating and unlock higher tiers faster.",
  },
  {
    title: "Stay consistent",
    body: "Regular activity keeps your badge active and your profile visible.",
  },
] as const;
