/**
 * Radix UI Select reserves empty string for "clear selection".
 * SelectItem must not use value=""; use these sentinels and map in onValueChange / submit.
 */
export const RADIX_SELECT_ALL = "__select_all__";
export const RADIX_SELECT_NONE = "__select_none__";
export const RADIX_SELECT_ANY = "__select_any__";
export const RADIX_SELECT_UNSET = "__select_unset__";
