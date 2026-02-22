/**
 * Internationalization (i18n) Configuration
 * Multi-language support for the platform
 */

export type SupportedLanguage = "en" | "af" | "zu" | "xh" | "nso" | "tn" | "ts" | "ve" | "ss";

export const SUPPORTED_LANGUAGES: Array<{ code: SupportedLanguage; name: string; nativeName: string }> = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
  { code: "nso", name: "Northern Sotho", nativeName: "Sesotho sa Leboa" },
  { code: "tn", name: "Tswana", nativeName: "Setswana" },
  { code: "ts", name: "Tsonga", nativeName: "Xitsonga" },
  { code: "ve", name: "Venda", nativeName: "Tshivenḓa" },
  { code: "ss", name: "Swati", nativeName: "SiSwati" },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/**
 * Translation keys (simplified - in production, use a proper i18n library like next-intl)
 */
export const translations: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    "common.welcome": "Welcome",
    "common.book_now": "Book Now",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "booking.title": "Book an Appointment",
    "booking.select_service": "Select a Service",
    "booking.select_date": "Select Date",
    "booking.select_time": "Select Time",
    "booking.confirm": "Confirm Booking",
    "booking.cancelled": "Booking Cancelled",
    "booking.completed": "Booking Completed",
    "review.write": "Write a Review",
    "review.submit": "Submit Review",
    "payment.pay_now": "Pay Now",
    "payment.success": "Payment Successful",
  },
  af: {
    "common.welcome": "Welkom",
    "common.book_now": "Bespreek Nou",
    "common.cancel": "Kanselleer",
    "common.save": "Stoor",
    "booking.title": "Bespreek 'n Afspraak",
    "booking.select_service": "Kies 'n Diens",
    "booking.select_date": "Kies Datum",
    "booking.select_time": "Kies Tyd",
    "booking.confirm": "Bevestig Bespreking",
    "booking.cancelled": "Bespreking Gekanselleer",
    "booking.completed": "Bespreking Voltooi",
    "review.write": "Skryf 'n Resensie",
    "review.submit": "Dien Resensie In",
    "payment.pay_now": "Betaal Nou",
    "payment.success": "Betaling Suksesvol",
  },
  zu: {
    "common.welcome": "Siyakwamukela",
    "common.book_now": "Bhuka Manje",
    "common.cancel": "Khansela",
    "common.save": "Gcina",
    "booking.title": "Bhuka Isikhathi",
    "booking.select_service": "Khetha Inkonzo",
    "booking.select_date": "Khetha Usuku",
    "booking.select_time": "Khetha Isikhathi",
    "booking.confirm": "Qinisekisa Ukubhuka",
    "booking.cancelled": "Ukubhuka Kukhanseliwe",
    "booking.completed": "Ukubhuka Kuqediwe",
    "review.write": "Bhala Umbuyekezo",
    "review.submit": "Thumela Umbuyekezo",
    "payment.pay_now": "Khokha Manje",
    "payment.success": "Inkokhelo Iphumelele",
  },
  xh: {
    "common.welcome": "Wamkelekile",
    "common.book_now": "Bhukha Ngoku",
    "common.cancel": "Rhoxisa",
    "common.save": "Gcina",
    "booking.title": "Bhukha Ixesha",
    "booking.select_service": "Khetha Inkonzo",
    "booking.select_date": "Khetha Umhla",
    "booking.select_time": "Khetha Ixesha",
    "booking.confirm": "Qinisekisa Ukubhukha",
    "booking.cancelled": "Ukubhukha Kurhoxisiwe",
    "booking.completed": "Ukubhukha Kugqityiwe",
    "review.write": "Bhala Uvavanyo",
    "review.submit": "Thumela Uvavanyo",
    "payment.pay_now": "Hlawula Ngoku",
    "payment.success": "Intlawulo Iphumelele",
  },
  nso: {
    "common.welcome": "Rea amogela",
    "common.book_now": "Booka Bjale",
    "common.cancel": "Hlakola",
    "common.save": "Boloka",
    "booking.title": "Booka Nako",
    "booking.select_service": "Kgetha Tshebeletso",
    "booking.select_date": "Kgetha Letšatši",
    "booking.select_time": "Kgetha Nako",
    "booking.confirm": "Netefatša Booko",
    "booking.cancelled": "Booko e Hlakotšwe",
    "booking.completed": "Booko e Fetile",
    "review.write": "Ngwala Tekolo",
    "review.submit": "Romela Tekolo",
    "payment.pay_now": "Lefa Bjale",
    "payment.success": "Tefo e Atlegile",
  },
  tn: {
    "common.welcome": "Re a go amogela",
    "common.book_now": "Booka Jaanong",
    "common.cancel": "Khansela",
    "common.save": "Boloka",
    "booking.title": "Booka Nako",
    "booking.select_service": "Kgetha Tirelo",
    "booking.select_date": "Kgetha Letsatsi",
    "booking.select_time": "Kgetha Nako",
    "booking.confirm": "Netefatsa Booko",
    "booking.cancelled": "Booko e Khansetswe",
    "booking.completed": "Booko e Fetile",
    "review.write": "Kwala Tekolo",
    "review.submit": "Romela Tekolo",
    "payment.pay_now": "Lefa Jaanong",
    "payment.success": "Tefo e Atlegile",
  },
  ts: {
    "common.welcome": "Ri amukela",
    "common.book_now": "Booka Sweswi",
    "common.cancel": "Hoxa",
    "common.save": "Hlayisa",
    "booking.title": "Booka Nkarhi",
    "booking.select_service": "Hlawula Ntirho",
    "booking.select_date": "Hlawula Siku",
    "booking.select_time": "Hlawula Nkarhi",
    "booking.confirm": "Tiyisisa Booko",
    "booking.cancelled": "Booko ri Hoxiwe",
    "booking.completed": "Booko ri Herile",
    "review.write": "Tsala Vuyelo",
    "review.submit": "Rhuma Vuyelo",
    "payment.pay_now": "Hola Sweswi",
    "payment.success": "Muholo wu Humerile",
  },
  ve: {
    "common.welcome": "Ri amukela",
    "common.book_now": "Booka Zwino",
    "common.cancel": "Khanedza",
    "common.save": "Vhulunga",
    "booking.title": "Booka Tshifhinga",
    "booking.select_service": "Nanga Tshumelo",
    "booking.select_date": "Nanga Ḓuvha",
    "booking.select_time": "Nanga Tshifhinga",
    "booking.confirm": "Tshimbidza Booko",
    "booking.cancelled": "Booko dzo Khanedzwa",
    "booking.completed": "Booko dzo Fhedzwa",
    "review.write": "Ṱalula Mbuyelo",
    "review.submit": "Rumela Mbuyelo",
    "payment.pay_now": "Lipa Zwino",
    "payment.success": "Muholo wo Fhedza",
  },
  ss: {
    "common.welcome": "Siyakwemukela",
    "common.book_now": "Bhukha Manje",
    "common.cancel": "Khansela",
    "common.save": "Gcina",
    "booking.title": "Bhukha Sikhatsi",
    "booking.select_service": "Khetsa Tisebenti",
    "booking.select_date": "Khetsa Lusuku",
    "booking.select_time": "Khetsa Sikhatsi",
    "booking.confirm": "Cinisekisa Kubhukha",
    "booking.cancelled": "Kubhukha Kukhanseliwe",
    "booking.completed": "Kubhukha Kuphele",
    "review.write": "Bhala Umbuyekezo",
    "review.submit": "Thumela Umbuyekezo",
    "payment.pay_now": "Khokha Manje",
    "payment.success": "Inkokhelo Iphumelele",
  },
};

/**
 * Get translation for a key
 */
export function t(key: string, lang: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return translations[lang]?.[key] || translations[DEFAULT_LANGUAGE][key] || key;
}

/**
 * Get user's preferred language from database or browser
 */
export async function getUserLanguage(userId?: string): Promise<SupportedLanguage> {
  if (!userId) {
    // Try to get from browser
    if (typeof window !== "undefined") {
      const browserLang = navigator.language.split("-")[0];
      const supported = SUPPORTED_LANGUAGES.find((l) => l.code === browserLang);
      return supported?.code || DEFAULT_LANGUAGE;
    }
    return DEFAULT_LANGUAGE;
  }

  // Get from user preferences (would need to implement user preferences table)
  // For now, return default
  return DEFAULT_LANGUAGE;
}
