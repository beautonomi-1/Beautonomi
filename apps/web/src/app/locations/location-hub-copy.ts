import { getCategoryLabelForSeo } from "@/app/home/home-category-labels";

type SeoTranslate = (key: string, vars?: Record<string, string>) => string;

export function locationHubMetaTitle(
  t: SeoTranslate,
  params: {
    countryName: string;
    cityName?: string;
    categorySlug?: string | null;
  },
): string {
  const cat =
    params.categorySlug && params.categorySlug !== "all"
      ? getCategoryLabelForSeo(params.categorySlug)
      : null;
  if (params.cityName && cat) {
    return t("web.seo.locationHubCityCategoryTitle", {
      category: cat,
      city: params.cityName,
    }) as string;
  }
  if (params.cityName) {
    return t("web.seo.locationHubCityTitle", { city: params.cityName }) as string;
  }
  if (cat) {
    return t("web.seo.locationHubCountryCategoryTitle", {
      category: cat,
      country: params.countryName,
    }) as string;
  }
  return t("web.seo.locationHubCountryTitle", { country: params.countryName }) as string;
}

export function locationHubMetaDescription(
  t: SeoTranslate,
  params: {
    countryName: string;
    cityName?: string;
    categorySlug?: string | null;
  },
): string {
  const cat =
    params.categorySlug && params.categorySlug !== "all"
      ? getCategoryLabelForSeo(params.categorySlug)
      : null;
  if (params.cityName && cat) {
    return t("web.seo.locationHubCityCategoryDescription", {
      category: cat.toLowerCase(),
      city: params.cityName,
    }) as string;
  }
  if (params.cityName) {
    return t("web.seo.locationHubCityDescription", {
      city: params.cityName,
      country: params.countryName,
    }) as string;
  }
  if (cat) {
    return t("web.seo.locationHubCountryCategoryDescription", {
      category: cat.toLowerCase(),
      country: params.countryName,
    }) as string;
  }
  return t("web.seo.locationHubCountryDescription", {
    country: params.countryName,
  }) as string;
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
