import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import CategoryPageClient from "./category-page-client";
import { BreadcrumbSchema } from "@/components/seo/structured-data";
import type { Category } from "@/types/beautonomi";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";
import { isGlobalCategoryIconImageUrl } from "@/lib/icons/global-category-lucide";
import { withGlobalCategoryIconCacheBust } from "@beautonomi/utils";
import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdsForGlobalCategory } from "@/lib/categories/provider-ids-for-global-category";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/category/${slug}`;
  const h = await headers();
  const hostRaw =
    (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";
  const ogLocale = openGraphLocaleForHost(hostRaw);

  try {
    const supabase = await getSupabaseServer();
    const { data: category } = await supabase
      .from("global_service_categories")
      .select("name, description, icon")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!category) {
      return {
        title: "Category Not Found",
      };
    }

    const rawIcon = category.icon?.trim() ?? "";
    const iconCacheRev = process.env.NEXT_PUBLIC_CATEGORY_ICON_CACHE_REVISION?.trim();
    const ogCategoryIconUrl =
      rawIcon && isGlobalCategoryIconImageUrl(rawIcon)
        ? withGlobalCategoryIconCacheBust(
            rawIcon.startsWith("http://") || rawIcon.startsWith("https://")
              ? rawIcon
              : `${origin}${rawIcon.startsWith("/") ? "" : "/"}${rawIcon}`,
            iconCacheRev || undefined
          )
        : undefined;

    return {
      title: `${category.name} Services | Beautonomi`,
      description: category.description || `Discover top-rated ${category.name} services and providers on Beautonomi`,
      alternates: {
        canonical: `${origin}${path}`,
        languages: getHreflangAlternateUrls(path),
      },
      openGraph: {
        title: `${category.name} Services | Beautonomi`,
        description: category.description || `Find the best ${category.name} services near you`,
        url: `${origin}${path}`,
        locale: ogLocale,
        images: ogCategoryIconUrl ? [{ url: ogCategoryIconUrl }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${category.name} Services | Beautonomi`,
        description: category.description || `Find the best ${category.name} services`,
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Category | Beautonomi",
    };
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const req = await createNextRequestFromHeaders(`/category/${slug}`);
  let supabase: any;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    supabase = await getSupabaseServer(req);
  }

  // Fetch category with subcategories
  const { data: category, error: categoryError } = await supabase
    .from("global_service_categories")
    .select(`
      *,
      subcategories (
        id,
        category_id,
        slug,
        name,
        description,
        is_active
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (categoryError || !category) {
    notFound();
  }

  // Get category ID to find associated providers (same rules as /api/public/search ?category=)
  const categoryId = category.id;

  let tenantId: string | null = null;
  try {
    tenantId = await resolveTenantIdWithZaFallback(req);
  } catch {
    tenantId = null;
  }

  let providerIds: string[] = [];
  if (tenantId) {
    providerIds = await getProviderIdsForGlobalCategory({
      supabase,
      globalCategoryId: categoryId,
      tenantId,
    });
  } else {
    const { data: associations } = await supabase
      .from("provider_global_category_associations")
      .select("provider_id")
      .eq("global_category_id", categoryId);
    providerIds = associations?.map((a) => a.provider_id).filter(Boolean) || [];
  }

  let providers: any[] = [];
  if (providerIds.length > 0) {
    let q = supabase
      .from("providers")
      .select(`
        id,
        slug,
        business_name,
        business_type,
        rating_average,
        review_count,
        thumbnail_url,
        avatar_url,
        is_featured,
        is_verified,
        currency
      `)
      .eq("status", "active")
      .is("deleted_at", null)
      .in("id", providerIds)
      .limit(20);
    if (tenantId) {
      q = q.eq("tenant_id", tenantId);
    }
    const { data: providersData } = await q;
    providers = providersData || [];
  }

  const breadcrumbBaseUrl = await getPublicSiteOriginFromHeaders();
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Categories", url: "/categories" },
    { name: category.name, url: `/category/${slug}` },
  ];

  return (
    <>
      <BreadcrumbSchema baseUrl={breadcrumbBaseUrl} items={breadcrumbs} />
      <BeautonomiHeader />
      <CategoryPageClient 
        category={category as Category} 
        initialProviders={providers}
        slug={slug}
      />
      <Footer />
    </>
  );
}
