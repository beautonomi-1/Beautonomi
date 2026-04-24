import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getReviews } from "@/app/api/me/reviews/route";
import type { CustomerReviewListItem } from "./review-list-types";

export async function fetchReviewsInitial(): Promise<CustomerReviewListItem[] | null> {
  const req = await createNextRequestFromHeaders("/api/me/reviews?limit=50&offset=0");
  const res = await getReviews(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { reviews?: CustomerReviewListItem[] };
  };
  if (!res.ok) return null;
  const reviews = json.data?.reviews;
  return Array.isArray(reviews) ? reviews : [];
}
