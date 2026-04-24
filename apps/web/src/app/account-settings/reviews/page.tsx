import ReviewsPageClient from "./ReviewsPageClient";
import { fetchReviewsInitial } from "./fetch-reviews-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialReviews = await fetchReviewsInitial();
  return <ReviewsPageClient initialReviews={initialReviews} />;
}
