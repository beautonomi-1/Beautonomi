import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getCountries } from "@/app/api/public/countries/route";
import { GET as getPlatformSettings } from "@/app/api/public/platform-settings/route";
import { GET as getVerification } from "@/app/api/me/verification/route";
import { GET as getProfile } from "@/app/api/me/profile/route";

export interface CountryDto {
  code: string;
  name: string;
  phone_country_code: string | null;
}

export interface PersonalInfoDataDto {
  legalName: { first: string; last: string };
  preferredName: string;
  email: string;
  phone: string;
  governmentId: string;
  address: {
    country: string;
    street: string;
    apt: string;
    city: string;
    state: string;
    zip: string;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    language: string;
    email: string;
    countryCode: string;
    phone: string;
  };
}

export interface PersonalInfoInitialPayload {
  countries: CountryDto[];
  sumsubAvailable: boolean;
  defaultCountryCode: string;
  defaultCountry: string;
  personalInfo: PersonalInfoDataDto | null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function maskEmail(email: string): string {
  const emailParts = email.split("@");
  if (emailParts[0].length > 0) {
    return `${emailParts[0].substring(0, 1)}****@${emailParts[1] || ""}`;
  }
  return email;
}

function maskPhone(phone: string): string {
  const phoneStr = phone.replace(/\D/g, "");
  if (phoneStr.length >= 4) {
    return `${phoneStr.substring(0, 3)} *** ***${phoneStr.substring(phoneStr.length - 4)}`;
  }
  return phone;
}

/**
 * Server-side parallel load for /account-settings/personal-info — invokes route
 * handlers with the current request cookies (no browser round-trip).
 */
export async function fetchPersonalInfoInitial(): Promise<PersonalInfoInitialPayload> {
  const [reqCountries, reqSettings, reqVerification, reqProfile] = await Promise.all([
    createNextRequestFromHeaders("/api/public/countries"),
    createNextRequestFromHeaders("/api/public/platform-settings"),
    createNextRequestFromHeaders("/api/me/verification"),
    createNextRequestFromHeaders("/api/me/profile"),
  ]);

  const [resCountries, resSettings, resVerification, resProfile] = await Promise.all([
    getCountries(reqCountries),
    getPlatformSettings(reqSettings),
    getVerification(reqVerification),
    getProfile(reqProfile),
  ]);

  const countriesJson = (await readJson(resCountries)) as { data?: CountryDto[] } | null;
  const loadedCountries = Array.isArray(countriesJson?.data) ? countriesJson.data : [];

  let sumsubAvailable = false;
  if (resVerification.ok) {
    const verJson = (await readJson(resVerification)) as { data?: { sumsub_available?: boolean } } | null;
    sumsubAvailable = Boolean(verJson?.data?.sumsub_available);
  }

  let defaultCountryCode = "+27";
  let defaultCountry = "South Africa";
  if (resSettings.ok) {
    const settingsJson = (await readJson(resSettings)) as {
      data?: { default_country_code?: string };
    } | null;
    defaultCountryCode = settingsJson?.data?.default_country_code || "+27";
    const country = loadedCountries.find((c) => c.phone_country_code === defaultCountryCode);
    if (country) {
      defaultCountry = country.name;
    } else {
      const fallbackCountry = loadedCountries.find((c) => c.code === "ZA") || loadedCountries[0];
      if (fallbackCountry) {
        defaultCountry = fallbackCountry.name;
      }
    }
  }

  let personalInfo: PersonalInfoDataDto | null = null;
  if (resProfile.ok) {
    const data = (await readJson(resProfile)) as { data?: Record<string, unknown> } | null;
    const profile = data?.data;
    if (profile && typeof profile === "object") {
      const p = profile as {
        email?: string;
        phone?: string;
        first_name?: string;
        last_name?: string;
        preferred_name?: string | null;
        government_id?: unknown;
        address?: {
          country?: string;
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
        };
        emergency_contact?: {
          name?: string;
          relationship?: string;
          language?: string;
          email?: string;
          country_code?: string;
          phone?: string;
        };
      };

      let maskedEmail = "";
      if (p.email) {
        maskedEmail = maskEmail(p.email);
      }

      let maskedPhone = "";
      if (p.phone) {
        maskedPhone = maskPhone(p.phone);
      }

      personalInfo = {
        legalName: {
          first: (p.first_name as string) || "",
          last: (p.last_name as string) || "",
        },
        preferredName: p.preferred_name || "Not provided",
        email: maskedEmail,
        phone: maskedPhone || "Not provided",
        governmentId: p.government_id ? "Provided" : "Not provided",
        address: p.address
          ? {
              country: p.address.country || "",
              street: p.address.line1 || "",
              apt: p.address.line2 || "",
              city: p.address.city || "",
              state: p.address.state || "",
              zip: p.address.postal_code || "",
            }
          : {
              country: "",
              street: "",
              apt: "",
              city: "",
              state: "",
              zip: "",
            },
        emergencyContact: {
          name: p.emergency_contact?.name || "",
          relationship: p.emergency_contact?.relationship || "",
          language: p.emergency_contact?.language || "",
          email: p.emergency_contact?.email || "",
          countryCode: p.emergency_contact?.country_code || "",
          phone: p.emergency_contact?.phone || "",
        },
      };
    }
  }

  return {
    countries: loadedCountries,
    sumsubAvailable,
    defaultCountryCode,
    defaultCountry,
    personalInfo,
  };
}
