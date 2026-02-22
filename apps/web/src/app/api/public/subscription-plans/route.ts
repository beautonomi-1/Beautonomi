import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    // Fetch available subscription plans
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching plans:', error);
      // Return default plans if table doesn't exist
      return NextResponse.json({
        data: [
          {
            id: 'basic',
            name: 'Basic',
            price: 99,
            currency: 'ZAR',
            billing_period: 'monthly',
            features: [
              'Up to 50 bookings per month',
              'Basic analytics',
              'Email support',
              'Mobile app access',
            ],
          },
          {
            id: 'professional',
            name: 'Professional',
            price: 199,
            currency: 'ZAR',
            billing_period: 'monthly',
            features: [
              'Unlimited bookings',
              'Advanced analytics',
              'Priority support',
              'Custom branding',
              'API access',
            ],
            is_popular: true,
          },
          {
            id: 'enterprise',
            name: 'Enterprise',
            price: 399,
            currency: 'ZAR',
            billing_period: 'monthly',
            features: [
              'Unlimited everything',
              'Dedicated account manager',
              '24/7 phone support',
              'White-label solution',
              'Custom integrations',
            ],
          },
        ],
      });
    }

    // Shape expected by provider subscription UI: flatten into monthly/yearly options.
    const out = (plans || []).flatMap((p: any) => {
      const features =
        Array.isArray(p.features) ? p.features : (p.features ? Object.values(p.features) : []);
      const options: any[] = [];
      if (p.price_monthly != null) {
        options.push({
          id: `${p.id}:monthly`,
          plan_id: p.id,
          name: p.name,
          price: Number(p.price_monthly),
          currency: p.currency || "ZAR",
          billing_period: "monthly",
          features,
          is_popular: (p as any).is_popular || false,
        });
      }
      if (p.price_yearly != null) {
        options.push({
          id: `${p.id}:yearly`,
          plan_id: p.id,
          name: p.name,
          price: Number(p.price_yearly),
          currency: p.currency || "ZAR",
          billing_period: "yearly",
          features,
          is_popular: (p as any).is_popular || false,
        });
      }
      return options;
    });

    return NextResponse.json({ data: out });
  } catch (error) {
    console.error('Error in subscription-plans GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
