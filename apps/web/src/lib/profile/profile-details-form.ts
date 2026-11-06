import { coerceProfileStringList } from "@beautonomi/utils";

/** Same 11 keys `answeredProfileQuestions` counts in build-profile-completion.ts. */
export const PROFILE_QUESTION_FIELDS = [
  { key: "school", labelKey: "qSchool" },
  { key: "work", labelKey: "qWork" },
  { key: "location", labelKey: "qLocation" },
  { key: "decade_born", labelKey: "qDecadeBorn" },
  { key: "favorite_song", labelKey: "qFavoriteSong" },
  { key: "obsessed_with", labelKey: "qObsessedWith" },
  { key: "fun_fact", labelKey: "qFunFact" },
  { key: "useless_skill", labelKey: "qUselessSkill" },
  { key: "biography_title", labelKey: "qBiographyTitle" },
  { key: "spend_time", labelKey: "qSpendTime" },
  { key: "pets", labelKey: "qPets" },
] as const;

export type ProfileQuestionKey = (typeof PROFILE_QUESTION_FIELDS)[number]["key"];

export const DECADE_BORN_OPTIONS = [
  { value: "1950s", labelKey: "decade1950s" },
  { value: "1960s", labelKey: "decade1960s" },
  { value: "1970s", labelKey: "decade1970s" },
  { value: "1980s", labelKey: "decade1980s" },
  { value: "1990s", labelKey: "decade1990s" },
  { value: "2000s", labelKey: "decade2000s" },
  { value: "2010s", labelKey: "decade2010s" },
  { value: "Prefer not to say", labelKey: "decadePreferNot" },
] as const;

export const HAIR_TYPE_OPTIONS = [
  { value: "Straight", labelKey: "hairStraight" },
  { value: "Wavy", labelKey: "hairWavy" },
  { value: "Curly", labelKey: "hairCurly" },
  { value: "Coily", labelKey: "hairCoily" },
  { value: "Coloured", labelKey: "hairColoured" },
  { value: "Natural", labelKey: "hairNatural" },
  { value: "Relaxed", labelKey: "hairRelaxed" },
  { value: "Thin", labelKey: "hairThin" },
  { value: "Thick", labelKey: "hairThick" },
] as const;

export const SKIN_TYPE_OPTIONS = [
  { value: "Normal", labelKey: "skinNormal" },
  { value: "Oily", labelKey: "skinOily" },
  { value: "Dry", labelKey: "skinDry" },
  { value: "Combination", labelKey: "skinCombination" },
  { value: "Sensitive", labelKey: "skinSensitive" },
  { value: "Mature", labelKey: "skinMature" },
] as const;

export const THINGS_TO_AVOID_OPTIONS = [
  { value: "Strong fragrances", labelKey: "avoidStrongFragrances" },
  { value: "Alcohol-based products", labelKey: "avoidAlcohol" },
  { value: "Sulfates", labelKey: "avoidSulfates" },
  { value: "Parabens", labelKey: "avoidParabens" },
  { value: "Essential oils", labelKey: "avoidEssentialOils" },
  { value: "Latex", labelKey: "avoidLatex" },
  { value: "Nickel", labelKey: "avoidNickel" },
  { value: "Dyes", labelKey: "avoidDyes" },
  { value: "Formaldehyde", labelKey: "avoidFormaldehyde" },
] as const;

export const APPOINTMENT_STYLE_OPTIONS = [
  { value: "Quick & efficient", labelKey: "styleQuickEfficient" },
  { value: "Relaxed & unhurried", labelKey: "styleRelaxed" },
  { value: "Social & chatty", labelKey: "styleSocial" },
  { value: "Quiet & minimal", labelKey: "styleQuiet" },
  { value: "Flexible", labelKey: "styleFlexible" },
] as const;

export const PRODUCT_PREFERENCE_OPTIONS = [
  { value: "Vegan", labelKey: "prefVegan" },
  { value: "Cruelty-free", labelKey: "prefCrueltyFree" },
  { value: "Natural / organic", labelKey: "prefNaturalOrganic" },
  { value: "Fragrance-free", labelKey: "prefFragranceFree" },
  { value: "Hypoallergenic", labelKey: "prefHypoallergenic" },
  { value: "Luxury", labelKey: "prefLuxury" },
  { value: "Budget-friendly", labelKey: "prefBudgetFriendly" },
  { value: "No preference", labelKey: "prefNoPreference" },
] as const;

export const INTEREST_SUGGESTION_KEYS = [
  "interestHair", "interestNails", "interestSkincare", "interestMakeup", "interestPedicure", "interestManicure",
  "interestFacial", "interestMassage", "interestHairColour", "interestBraids", "interestWaxing", "interestLashes",
  "interestBrows", "interestTravel", "interestPhotography", "interestCooking",
] as const;

export const ALLERGY_SUGGESTION_KEYS = [
  "allergyFragrance", "allergyParabens", "allergySulfates", "allergyAlcohol", "allergyDyes",
  "allergyFormaldehyde", "allergyLatex", "allergyNickel",
] as const;

export interface ProfileDetailsFormState {
  about: string;
  questions: Record<ProfileQuestionKey, string>;
  interests: string[];
  hairType: string;
  skinType: string;
  appointmentStyle: string;
  allergies: string[];
  thingsToAvoid: string[];
  productPreferences: string[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function list(value: unknown): string[] {
  if (typeof value === "string") return value.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  return coerceProfileStringList(value);
}

export function profileDetailsFormFromApi(
  profile: Record<string, unknown> | null | undefined,
  beauty: Record<string, unknown> | null | undefined,
): ProfileDetailsFormState {
  const questions = {} as Record<ProfileQuestionKey, string>;
  for (const { key } of PROFILE_QUESTION_FIELDS) questions[key] = str(profile?.[key]);
  return {
    about: str(profile?.about),
    questions,
    interests: coerceProfileStringList(profile?.interests),
    hairType: str(beauty?.hair_type),
    skinType: str(beauty?.skin_type),
    appointmentStyle: str(beauty?.appointment_style),
    allergies: coerceProfileStringList(beauty?.allergies),
    thingsToAvoid: list(beauty?.things_to_avoid),
    productPreferences: list(beauty?.product_preferences),
  };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Body for POST /api/me/profile-data with only the fields the user changed (the route updates only keys present). */
export function buildProfileDataPatch(
  initial: ProfileDetailsFormState,
  current: ProfileDetailsFormState,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (current.about.trim() !== initial.about) body.about = current.about.trim();
  for (const { key } of PROFILE_QUESTION_FIELDS) {
    const next = current.questions[key].trim();
    if (next !== initial.questions[key]) body[key] = next;
  }
  if (!sameList(current.interests, initial.interests)) body.interests = current.interests;
  return body;
}

/** Body for PATCH /api/me/beauty-preferences with only changed fields; list fields keep mobile's comma-string shape. */
export function buildBeautyPreferencesPatch(
  initial: ProfileDetailsFormState,
  current: ProfileDetailsFormState,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (current.hairType !== initial.hairType) body.hair_type = current.hairType;
  if (current.skinType !== initial.skinType) body.skin_type = current.skinType;
  if (current.appointmentStyle !== initial.appointmentStyle) body.appointment_style = current.appointmentStyle;
  if (!sameList(current.allergies, initial.allergies)) body.allergies = current.allergies;
  if (!sameList(current.thingsToAvoid, initial.thingsToAvoid)) body.things_to_avoid = current.thingsToAvoid.join(", ");
  if (!sameList(current.productPreferences, initial.productPreferences)) {
    body.product_preferences = current.productPreferences.join(", ");
  }
  return body;
}

/** Hash targets on /account-settings/profile-details (used by completion deeplinks). */
export const PROFILE_DETAILS_SECTION_IDS = ["about", "profile-questions", "interests", "beauty-preferences"] as const;

/** Baseline after a successful save, so the next diff compares against what the server now stores. */
export function mergeSavedBaseline(
  initial: ProfileDetailsFormState,
  current: ProfileDetailsFormState,
  saved: { profile: boolean; beauty: boolean },
): ProfileDetailsFormState {
  const next = { ...initial };
  if (saved.profile) {
    const questions = { ...current.questions };
    for (const { key } of PROFILE_QUESTION_FIELDS) questions[key] = questions[key].trim();
    Object.assign(next, { about: current.about.trim(), questions, interests: current.interests });
  }
  if (saved.beauty) {
    Object.assign(next, {
      hairType: current.hairType,
      skinType: current.skinType,
      appointmentStyle: current.appointmentStyle,
      allergies: current.allergies,
      thingsToAvoid: current.thingsToAvoid,
      productPreferences: current.productPreferences,
    });
  }
  return next;
}

export function countAnsweredQuestions(state: ProfileDetailsFormState): number {
  return PROFILE_QUESTION_FIELDS.filter(({ key }) => state.questions[key].trim().length > 0).length;
}
