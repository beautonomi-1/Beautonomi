import ReturnsPageClient from "./ReturnsPageClient";
import { fetchReturnsInitial } from "./fetch-returns-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialReturns = await fetchReturnsInitial();
  return <ReturnsPageClient initialReturns={initialReturns} />;
}
