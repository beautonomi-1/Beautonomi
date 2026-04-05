import { getCategoryLabelForSeo } from "@/app/home/home-category-labels";

export function locationHubMetaTitle(params: {
  countryName: string;
  cityName?: string;
  categorySlug?: string | null;
}): string {
  const cat =
    params.categorySlug && params.categorySlug !== "all"
      ? getCategoryLabelForSeo(params.categorySlug)
      : null;
  if (params.cityName && cat) {
    return `${cat} freelancers & salons in ${params.cityName} | Beautonomi`;
  }
  if (params.cityName) {
    return `Book beauty freelancers & salons in ${params.cityName} | Beautonomi`;
  }
  if (cat) {
    return `${cat} across ${params.countryName} — verified beauty professionals | Beautonomi`;
  }
  return `Beauty freelancers & salons in ${params.countryName} | Beautonomi`;
}

export function locationHubMetaDescription(params: {
  countryName: string;
  cityName?: string;
  categorySlug?: string | null;
}): string {
  const cat =
    params.categorySlug && params.categorySlug !== "all"
      ? getCategoryLabelForSeo(params.categorySlug)
      : null;
  if (params.cityName && cat) {
    return `Find top-rated ${cat.toLowerCase()} freelancers and salons in ${params.cityName}. Compare reviews, book verified beauty professionals on Beautonomi.`;
  }
  if (params.cityName) {
    return `Discover salons and mobile beauty freelancers in ${params.cityName}, ${params.countryName}. Book verified professionals on Beautonomi.`;
  }
  if (cat) {
    return `Browse ${cat.toLowerCase()} services from verified freelancers and salons across ${params.countryName} on Beautonomi.`;
  }
  return `Explore beauty freelancers and salons across ${params.countryName}. Book hair, nails, spa, and more on Beautonomi.`;
}

export function sectionTopRatedTitle(cityName: string | undefined, categorySlug: string | null | undefined): string {
  const cat =
    categorySlug && categorySlug !== "all"
      ? getCategoryLabelForSeo(categorySlug)
      : "Beauty";
  const place = cityName ? ` in ${cityName}` : "";
  return `Top-rated ${cat} freelancers & salons${place}`;
}

export function sectionFreelancersTitle(cityName: string | undefined): string {
  return cityName ? `Mobile & freelance beauty professionals in ${cityName}` : "Mobile & freelance beauty professionals";
}

export function sectionSalonsTitle(cityName: string | undefined): string {
  return cityName ? `Salons & studios in ${cityName}` : "Salons & studios";
}
