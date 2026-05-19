/**
 * Pricing CMS Functions
 * 
 * Functions to fetch pricing data from Supabase CMS
 */

import { getSupabaseClient } from './client';

type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  features: string[];
  /**
   * §Provider-launch (2026-05): clients use this to render free/paid badges
   * and decide checkout copy without re-deriving the rule. A plan is free when
   * price parses to 0/"free" *and* no Paystack plan codes are configured.
   */
  is_free: boolean;
};

function derivePlanIsFree(plan: {
  price?: string | number | null;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
}): boolean {
  const hasAnyPaystackCode = Boolean(
    plan.paystack_plan_code_monthly || plan.paystack_plan_code_yearly,
  );
  if (hasAnyPaystackCode) return false;
  const priceStr = String(plan.price ?? "").replace(/[^0-9.]/g, "");
  if (!priceStr) return true;
  const numeric = parseFloat(priceStr);
  if (Number.isNaN(numeric)) return true;
  if (numeric === 0) return true;
  return /free/i.test(String(plan.price ?? ""));
}

type PricingFAQ = {
  id: string;
  question: string;
  answer: string;
};

type PricingPageContent = {
  heroTitle: string;
  heroDescription: string;
};

/**
 * Fetch all active pricing plans with their features
 */
export async function getPricingPlans(): Promise<PricingPlan[]> {
  const supabase = getSupabaseClient();
  
  const { data: plans, error: plansError } = await supabase
    .from('pricing_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (plansError) {
    console.error('Error fetching pricing plans:', plansError);
    return [];
  }

  if (!plans || plans.length === 0) {
    return [];
  }

  // Fetch features for each plan
  const plansWithFeatures = await Promise.all(
    plans.map(async (plan) => {
      const { data: features, error: featuresError } = await supabase
        .from('pricing_plan_features')
        .select('feature_text')
        .eq('plan_id', plan.id)
        .order('display_order', { ascending: true });

      if (featuresError) {
        console.error(`Error fetching features for plan ${plan.id}:`, featuresError);
        return {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          period: plan.period,
          description: plan.description,
          cta_text: plan.cta_text,
          is_popular: plan.is_popular,
          features: [],
          is_free: derivePlanIsFree(plan),
        };
      }

      return {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        period: plan.period,
        description: plan.description,
        cta_text: plan.cta_text,
        is_popular: plan.is_popular,
        features: features?.map((f) => f.feature_text) || [],
        is_free: derivePlanIsFree(plan),
      };
    })
  );

  return plansWithFeatures;
}

/**
 * Fetch all active pricing FAQs
 */
export async function getPricingFAQs(): Promise<PricingFAQ[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('pricing_faqs')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching pricing FAQs:', error);
    return [];
  }

  return data?.map((faq) => ({
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
  })) || [];
}

/**
 * Fetch pricing page hero content
 */
export async function getPricingPageContent(): Promise<PricingPageContent> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('page_content')
    .select('section_key, content')
    .eq('page_slug', 'pricing')
    .eq('is_active', true)
    .in('section_key', ['hero_title', 'hero_description']);

  if (error) {
    console.error('Error fetching pricing page content:', error);
    return {
      heroTitle: 'Simple, transparent pricing',
      heroDescription: 'Choose the plan that\'s right for your business. All plans include a 14-day free trial.',
    };
  }

  const content: PricingPageContent = {
    heroTitle: 'Simple, transparent pricing',
    heroDescription: 'Choose the plan that\'s right for your business. All plans include a 14-day free trial.',
  };

  data?.forEach((item) => {
    if (item.section_key === 'hero_title') {
      content.heroTitle = item.content;
    } else if (item.section_key === 'hero_description') {
      content.heroDescription = item.content;
    }
  });

  return content;
}
