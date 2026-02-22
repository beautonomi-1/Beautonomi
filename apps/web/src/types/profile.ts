// Profile page type definitions

export interface ProfileUser {
  id: string;
  email: string;
  full_name: string | null;
  first_name?: string;
  last_name?: string;
  preferred_name: string | null;
  handle: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  identity_verification_status: string;
  identity_verification_submitted_at?: string | null;
  identity_verification_rejection_reason?: string | null;
  identity_verification_document_url?: string | null;
  identity_verification_document_type?: string | null;
  identity_verification_id?: string | null;
  created_at: string;
  address?: {
    country: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
  } | null;
  emergency_contact?: {
    name: string;
    relationship: string;
    language: string;
    email: string;
    country_code: string;
    phone: string;
  } | null;
  beauty_preferences?: BeautyPreferences;
  privacy_settings?: {
    services_booked_visible?: boolean;
  };
}

export interface ProfileData {
  about: string | null;
  interests: string[] | null;
}

export interface CompletionData {
  completed: number;
  total: number;
  percentage: number;
  topItems: Array<{
    id: string;
    label: string;
    timeEstimate: string;
    completed: boolean;
    required?: boolean;
  }>;
}

export interface BeautyPreferences {
  hair_type?: string;
  skin_type?: string;
  allergies?: string[];
  things_to_avoid?: string;
  appointment_style?: string;
  preferred_times?: string[];
  preferred_days?: string[];
  product_preferences?: string;
}

export interface QuickActionBadge {
  type: 'email' | 'photo' | 'phone' | 'id';
  label: string;
  verified?: boolean;
  pending?: boolean;
}
