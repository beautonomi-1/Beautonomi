import {
  appleDisplayNameFallback,
  isApplePrimaryIdentity,
  resolveProfileEmailVerificationState,
} from "@beautonomi/utils";
import type { User } from "@supabase/supabase-js";

export type ProfileChecklistItem = {
  id: string;
  label: string;
  timeEstimate: string;
  completed: boolean;
  required: boolean;
};

export type ProfileCompletionResult = {
  checklistItems: ProfileChecklistItem[];
  completed: number;
  total: number;
  percentage: number;
  topItems: ProfileChecklistItem[];
};

type UserRow = {
  preferred_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  phone_verified?: boolean | null;
  email?: string | null;
  email_verified?: boolean | null;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  identity_verified?: boolean | null;
  identity_verification_status?: string | null;
  role?: string | null;
};

type ProfileRow = {
  about?: string | null;
  interests?: string[] | null;
  beauty_preferences?: Record<string, unknown> | null;
  school?: string | null;
  work?: string | null;
  location?: string | null;
  decade_born?: string | null;
  favorite_song?: string | null;
  obsessed_with?: string | null;
  fun_fact?: string | null;
  useless_skill?: string | null;
  biography_title?: string | null;
  spend_time?: string | null;
  pets?: string | null;
};

function preferredNameComplete(userData: UserRow, authUser: User | null): boolean {
  const preferred = userData.preferred_name?.trim();
  const full = (userData.full_name ?? "").trim();
  const name = preferred || full;
  if (!name) return false;
  if (name === "Apple user") return false;
  if (isApplePrimaryIdentity(authUser)) {
    const metaName = (authUser?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim();
    if (!metaName && name === appleDisplayNameFallback(authUser)) return false;
  }
  return true;
}

function phoneVerifiedComplete(userData: UserRow, authUser: User | null): boolean {
  if (userData.phone_verified === true) return true;
  const confirmedAt = (authUser as { phone_confirmed_at?: string | null } | null)?.phone_confirmed_at;
  return Boolean(confirmedAt);
}

function answeredProfileQuestions(profileData: ProfileRow | null | undefined): number {
  if (!profileData) return 0;
  return [
    profileData.school,
    profileData.work,
    profileData.location,
    profileData.decade_born,
    profileData.favorite_song,
    profileData.obsessed_with,
    profileData.fun_fact,
    profileData.useless_skill,
    profileData.biography_title,
    profileData.spend_time,
    profileData.pets,
  ].filter(Boolean).length;
}

function hasBeautyPreferences(profileData: ProfileRow | null | undefined): boolean {
  const beautyPrefs = profileData?.beauty_preferences || {};
  return Object.keys(beautyPrefs).some((key) => {
    const value = beautyPrefs[key];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return !!value;
  });
}

export function buildProfileCompletion(args: {
  userData: UserRow;
  profileData?: ProfileRow | null;
  authUser: User | null;
  hasAnyAddress: boolean;
  identityChecklistComplete: boolean;
  identityRequiredForCustomer: boolean;
}): ProfileCompletionResult {
  const { userData, profileData, authUser, hasAnyAddress, identityChecklistComplete, identityRequiredForCustomer } =
    args;
  const isCustomer = userData.role === "customer";
  const applePrimary = isApplePrimaryIdentity(authUser);

  const emailVerification = resolveProfileEmailVerificationState({
    profileEmail: userData.email?.trim() || null,
    authEmail: authUser?.email?.trim() || null,
    emailVerifiedFlag: userData.email_verified,
    emailConfirmedAt: (authUser as { email_confirmed_at?: string | null } | null)?.email_confirmed_at,
  });

  const checklistItems: ProfileChecklistItem[] = [
    {
      id: "photo",
      label: "Add profile photo",
      timeEstimate: "30 sec",
      completed: !!userData.avatar_url,
      required: false,
    },
    {
      id: "email",
      label: "Verify email",
      timeEstimate: "1 min",
      completed: emailVerification.verificationSatisfied,
      required: emailVerification.verificationRequired,
    },
    {
      id: "preferred_name",
      label: "Add preferred name",
      timeEstimate: "30 sec",
      completed: preferredNameComplete(userData, authUser),
      required: isCustomer && !applePrimary,
    },
    {
      id: "date_of_birth",
      label: "Add date of birth",
      timeEstimate: "1 min",
      completed: !!userData.date_of_birth,
      required: isCustomer,
    },
    {
      id: "bio",
      label: "Add bio",
      timeEstimate: "2 min",
      completed: !!(profileData?.about),
      required: false,
    },
    {
      id: "identity",
      label: "Verify identity",
      timeEstimate: "5 min",
      completed: identityChecklistComplete,
      required: identityRequiredForCustomer,
    },
    {
      id: "phone",
      label: "Verify phone",
      timeEstimate: "1 min",
      completed: phoneVerifiedComplete(userData, authUser),
      required: isCustomer,
    },
    {
      id: "address",
      label: "Add address",
      timeEstimate: "2 min",
      completed: hasAnyAddress,
      required: isCustomer,
    },
    {
      id: "emergency_contact",
      label: "Add emergency contact",
      timeEstimate: "1 min",
      completed: !!userData.emergency_contact_name,
      required: false,
    },
    {
      id: "profile_questions",
      label: "Answer 3 profile questions",
      timeEstimate: "3 min",
      completed: answeredProfileQuestions(profileData) >= 3,
      required: false,
    },
    {
      id: "interests",
      label: "Add interests",
      timeEstimate: "1 min",
      completed: !!(profileData?.interests && profileData.interests.length > 0),
      required: false,
    },
    {
      id: "beauty_preferences",
      label: "Add beauty preferences",
      timeEstimate: "3 min",
      completed: hasBeautyPreferences(profileData),
      required: false,
    },
  ];

  const requiredItems = checklistItems.filter((item) => item.required);
  const completedRequired = requiredItems.filter((item) => item.completed).length;
  const totalRequired = requiredItems.length;
  const percentage =
    totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 100;

  const incompleteRequired = checklistItems.filter((item) => item.required && !item.completed);
  const incompleteOptional = checklistItems.filter((item) => !item.required && !item.completed);
  const topItems = [...incompleteRequired, ...incompleteOptional].slice(0, 3);

  return {
    checklistItems,
    completed: completedRequired,
    total: totalRequired,
    percentage,
    topItems,
  };
}
