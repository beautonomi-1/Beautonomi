/**
 * Shared environment variable types for the Beautonomi platform.
 * Apps define their own .env files; this provides centralized type definitions.
 */

/** Core Supabase environment variables */
export interface SupabaseEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/** Payment provider environment variables */
export interface PaymentEnv {
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
  PAYSTACK_WEBHOOK_SECRET?: string;
  YOCO_SECRET_KEY?: string;
  YOCO_PUBLIC_KEY?: string;
}

/** Third-party integration environment variables */
export interface IntegrationEnv {
  NEXT_PUBLIC_MAPBOX_TOKEN?: string;
  ONESIGNAL_APP_ID?: string;
  ONESIGNAL_REST_API_KEY?: string;
  AMPLITUDE_API_KEY?: string;
  SENTRY_DSN?: string;
}

/** System environment variables */
export interface SystemEnv {
  NEXT_PUBLIC_APP_URL: string;
  CRON_SECRET?: string;
  NODE_ENV: "development" | "staging" | "production";
}

/** Complete platform environment */
export interface BeautonomiEnv extends SupabaseEnv, PaymentEnv, IntegrationEnv, SystemEnv {}

/** Mobile app environment (subset) */
export interface MobileEnv {
  EXPO_PUBLIC_SUPABASE_URL: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  EXPO_PUBLIC_APP_URL: string;
  EXPO_PUBLIC_MAPBOX_TOKEN?: string;
  EXPO_PUBLIC_ONESIGNAL_APP_ID?: string;
  EXPO_PUBLIC_AMPLITUDE_API_KEY?: string;
  EXPO_PUBLIC_SENTRY_DSN?: string;
}
