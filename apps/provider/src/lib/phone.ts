/**
 * Re-export shared phone helpers (libphonenumber-backed). Prefer importing from here in the app.
 */
export {
  normalizePhoneToE164,
  normalizeFullPhoneToE164,
  isCompleteE164,
  DEFAULT_PHONE_COUNTRY_CODE,
  dialCodeForIso3166Alpha2,
  nationalDigitsValidationMessage,
  splitValueForPhoneInput,
} from "@beautonomi/phone";

export { getDeviceDefaultCountryDial } from "./device-default-country-dial";
