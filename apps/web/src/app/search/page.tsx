import SearchPageClient from "./search-page-client";
import { getPublicSearchCategories } from "@/lib/search/public-categories";

export const revalidate = 3600;

export default async function SearchPage() {
  const initialCategories = await getPublicSearchCategories();
  return <SearchPageClient initialCategories={initialCategories} />;
}
