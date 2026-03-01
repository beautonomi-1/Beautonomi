import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import CategoryPageClient from "./category-page-client";
import { BreadcrumbSchema } from "@/components/seo/structured-data";
import type { Category } from "@/types/beautonomi";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
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

    return {
      title: `${category.name} Services | Beautonomi`,
      description: category.description || `Discover top-rated ${category.name} services and providers on Beautonomi`,
      alternates: {
        canonical: `${baseUrl}/category/${slug}`,
      },
      openGraph: {
        title: `${category.name} Services | Beautonomi`,
        description: category.description || `Find the best ${category.name} services near you`,
        url: `${baseUrl}/category/${slug}`,
        images: category.icon ? [{ url: category.icon }] : undefined,
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
  const supabase = await getSupabaseServer();

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

  // Get category ID to find associated providers
  const categoryId = category.id;

  // Get provider IDs associated with this category
  const { data: associations } = await supabase
    .from("provider_global_category_associations")
    .select("provider_id")
    .eq("global_category_id", categoryId);

  const providerIds = associations?.map((a) => a.provider_id) || [];

  // Fetch providers if we have any associations
  let providers: any[] = [];
  if (providerIds.length > 0) {
    const { data: providersData } = await supabase
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
      .in("id", providerIds)
      .limit(20);

    providers = providersData || [];
  }

  const _baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Categories", url: "/categories" },
    { name: category.name, url: `/category/${slug}` },
  ];

  return (
    <>
      <BreadcrumbSchema items={breadcrumbs} />
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
