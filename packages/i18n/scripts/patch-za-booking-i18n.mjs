#!/usr/bin/env node
/**
 * Surgical ZA-market translations for booking venue/engine + home sr-only title.
 * Replaces existing English clones in locale JSON without rewriting the whole file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === '"') break;
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Unbalanced brace");
}

function replaceNamedObject(src, key, obj, indent = 6, fromIndex = 0) {
  const needle = `"${key}": {`;
  const start = src.indexOf(needle, fromIndex);
  if (start < 0) throw new Error(`Missing ${key} object`);
  const brace = src.indexOf("{", start);
  const end = findMatchingBrace(src, brace);
  const pretty = JSON.stringify(obj, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `${" ".repeat(indent)}${line}`))
    .join("\n");
  return src.slice(0, start) + `"${key}": ${pretty}` + src.slice(end + 1);
}

function replaceFirst(src, key, oldVal, newVal) {
  const needle = `"${key}": ${JSON.stringify(oldVal)}`;
  const next = `"${key}": ${JSON.stringify(newVal)}`;
  const idx = src.indexOf(needle);
  if (idx < 0) return src;
  return src.slice(0, idx) + next + src.slice(idx + needle.length);
}

function insertAfter(src, afterNeedle, insert) {
  const idx = src.indexOf(afterNeedle);
  if (idx < 0 || src.includes('"homeSrOnlyTitle"')) return src;
  const at = idx + afterNeedle.length;
  return src.slice(0, at) + insert + src.slice(at);
}

const engine = {
  af: {
    chooseDateTime: "Kies 'n datum en tyd",
    timesLocalTimezone: "Alle tye is in jou plaaslike tydsone ({{timezone}}).",
    nextAvailableSlot: "Volgende beskikbare tyd",
    monthView: "Maand-aansig",
    todayBadge: "VANDAG",
    availableTimes: "Beskikbare tye",
    noOpeningsToday: "Geen oop tye vandag nie",
    noOpeningsHint: "Probeer 'n ander datum of gebruik \"Volgende beskikbare\" hierbo.",
    waitlistNotifyWhen: "Ons laat jou weet wanneer {{time}} beskikbaar word.",
    yourNameRequired: "Jou naam *",
    phoneOptional: "Foon (opsioneel)",
    invalidPhoneOrBlank: "Voer 'n geldige foonnommer in of laat die veld leeg.",
    addressCheckFailed: "Adreskontrole het misluk. Jy kan steeds voortgaan.",
    couldNotConfirmTravel: "Ons kon nie reis na hierdie adres bevestig nie.",
    venueExperienceProvider: "Hoe wil jy {{providerName}} ervaar?",
    whereAppointment: "Waar wil jy jou afspraak hê?",
    visitSalon: "Besoek die salon",
    visitSalonSubtitle: "Professionele versorging in die ateljee",
    atYourHomeTitle: "By jou huis",
    atYourHomeSubtitle: "Luukse tot by jou voordeur",
    selectLocation: "Kies 'n ligging",
    noSalonLocations: "Hierdie verskaffer het geen salonliggings nie. Kies By jou huis of probeer 'n ander verskaffer.",
    serviceArea: "Diensarea",
    addressSearchLabel: "Jou adres (soek vir geokodering en reiskoste)",
    streetAddressPlaceholder: "Begin jou straatadres tik...",
    countryLabel: "Land *",
    countryPlaceholder: "Land",
    postalCodeLabel: "Poskode",
    cityRequiredLabel: "Stad *",
    selectProfessional: "Kies 'n professionele persoon",
    noSpecialistListed: "Geen genoemde spesialis is nog vir hierdie ligging gelys nie. Gaan voort met enigiemand wat beskikbaar is.",
    chooseSpecialist: "Kies jou voorkeurspesialis of die vinnigste beskikbaarheid",
    anyProfessional: "Enige professionele persoon",
    ratingLabel: "★ {{rating}} gradering",
    categoryMenu: "{{categoryName}}-kieslys",
    whatWouldYouLike: "Wat wil jy hê?",
    chooseFromCategory: "Kies 'n diens uit hierdie kategorie",
    bundleIncludedHint: "Jou bundel is ingesluit — voeg dienste by of pas dit hieronder aan indien nodig",
    choosePackageOrService: "Kies 'n pakket of 'n enkele diens",
    packages: "Pakkette",
    yourDetails: "Jou besonderhede",
    detailsConfirmHint: "Ons gebruik dit om jou bespreking te bevestig",
    firstName: "Voornaam",
    lastName: "Van",
    emailPlaceholder: "jy@example.com",
    phoneLooksGood: "Lyk goed",
    phoneCompleteCountryCode: "Voltooi die nommer met landkode",
    specialRequestsOptional: "Spesiale versoeke (opsioneel)",
    allergiesPlaceholder: "Allergieë, voorkeure, toegangnotas...",
    additionalDetails: "Bykomende besonderhede",
    requiredFieldsHint: "Voltooi asseblief alle verpligte velde (gemerk met *).",
    optionalBookingInfo: "Opsionele inligting vir hierdie bespreking.",
    providerFormsTitle: "Vorms van jou verskaffer",
    providerFormsHint: "Voltooi asseblief die volgende soos deur die verskaffer vereis.",
    typeNameToSign: "Tik jou naam om te teken",
    nameRequired: "Voer asseblief jou voornaam en van in.",
    fillNameEmailPhone: "Vul asseblief jou naam, e-pos en foon in.",
    phoneWithCountryCode: "Voer asseblief 'n geldige foonnommer met landkode in.",
    completeProviderForms: "Voltooi asseblief alle verpligte verskaffervorms.",
    completeRequiredDetails: "Vul asseblief alle verpligte bykomende besonderhede in (gemerk met *).",
    noServicesSelected: "Geen dienste gekies nie — gaan terug om dienste by te voeg.",
    fullNameRequired: "Volle naam *",
    depositOrPayAtVenue: "'n Deposito of volle betaling kan by afhandeling vereis word.",
    payOnlineOrInPerson: "Betaal nou aanlyn of persoonlik by die lokaal.",
    withStaff: "Saam met:",
    anyoneAvailable: "Enigiemand beskikbaar",
    reviewTitle: "Hersien jou bespreking",
    reviewSubtitle: "Bevestig besonderhede voordat jy die tydtoesluit",
    edit: "Wysig",
    packageSuffix: "{{name}} (pakket)",
    durationMin: " · {{minutes}} min",
    addons: "Byvoegings",
    total: "Totaal",
    when: "Wanneer:",
    where: "Waar:",
    changeTime: "Verander tyd",
    changeVenue: "Verander lokaal",
    securingSlot: "Besig om tyd toe te sluit...",
    confirmContinue: "Bevestig en gaan voort",
    secureCheckout: "Veilige afhandeling · Jou betalingsbesonderhede is beskerm",
    addExtras: "Voeg extras by",
    addExtrasSubtitle: "Opsionele behandelings om jou besoek te verbeter",
    noAddonsSkip: "Geen byvoegings vir hierdie keuse nie. Jy kan hierdie stap oorslaan.",
    boostYourSession: "Versterk jou sessie",
    durationPlusMin: "+{{minutes}} min • ",
    services: "Dienste",
    groupTitle: "Besprek jy vir jouself of 'n groep?",
    groupSubtitle: "Voeg ander gaste by en kies hul dienste. Jy is die primêre kontak vir die bespreking.",
    justMe: "Net ek",
    justMeHint: "Een afspraak vir jou",
    groupBooking: "Groepbespreking",
    groupBookingHint: "Dieselfde tydgleuf, elke persoon kies hul eie dienste (tot {{count}} mense)",
    youPrimary: "Jy (primêre kontak)",
    durationPrice: "{{minutes}} min · {{amount}}",
    guestNumber: "Gas {{n}}",
    theirServices: "Hul dienste",
    addAnotherGuest: "Voeg nog 'n gas by",
    checkingTravelFee: "Kontroleer reiskoste…",
    estimatedTravelFee: "Geskatte reiskoste: {{amount}}",
    aboutKm: "Ongeveer {{km}} km",
    minDrive: "~{{minutes}} min ry",
    finalAmountAfterSlot: "Die finale bedrag kan by afhandeling bevestig word nadat ons jou tyd toesluit.",
    travelArea: "Reisarea",
    continueIfAddressCorrect: "Jy kan steeds voortgaan as jy glo die adres is korrek.",
    chooseCategory: "Kies 'n kategorie",
    chooseCategoryHint: "Kies die tipe diens waarna jy soek",
    savePercentBadge: "Bespaar {{percent}}%",
    includedCount: "{{count}} ingesluit · ",
    optionsTapHide: "{{count}} opsies · tik om te versteek",
    optionsTapShow: "{{count}} opsies · tik om te wys",
    durationMinShort: "{{minutes}} min",
  },
  zu: {
    chooseDateTime: "Khetha usuku nesikhathi",
    timesLocalTimezone: "Zonke izikhathi zisesikhathini sendawo yakho ({{timezone}}).",
    nextAvailableSlot: "Isikhathi esilandelayo esitholakalayo",
    monthView: "Ukubuka kwenyanga",
    todayBadge: "NAMUHLA",
    availableTimes: "Izikhathi ezitholakalayo",
    noOpeningsToday: "Azikho izikhathi ezivulekile namuhla",
    noOpeningsHint: "Zama olunye usuku noma sebenzisa \"Okulandelayo okutholakalayo\" ngenhla.",
    waitlistNotifyWhen: "Sizokwazisa lapho {{time}} sitholakala.",
    yourNameRequired: "Igama lakho *",
    phoneOptional: "Ucingo (ungakhetha)",
    invalidPhoneOrBlank: "Faka inombolo yocingo evumelekile noma ushiye inkundla ingenalutho.",
    addressCheckFailed: "Ukuhlola ikheli kuhlulekile. Usengaqhubeka.",
    couldNotConfirmTravel: "Asikwazanga ukuqinisekisa uhambo lwaleli kheli.",
    venueExperienceProvider: "Ungathanda ukuzwa kanjani u-{{providerName}}?",
    whereAppointment: "Ungathanda ukuba iqhinga lakho libe kuphi?",
    visitSalon: "Vakashela isaluni",
    visitSalonSubtitle: "Ukunakekelwa kobungcweti esitudiyo",
    atYourHomeTitle: "Ekhaya lakho",
    atYourHomeSubtitle: "Ubuhle bufika emnyango wakho",
    selectLocation: "Khetha indawo",
    noSalonLocations: "Lo mhlinzeki akanazo izindawo zesaluni. Khetha Ekhaya lakho noma uzame omunye umhlinzeki.",
    serviceArea: "Indawo yesevisi",
    addressSearchLabel: "Ikheli lakho (sesha ukuze kutholakale imali yohambo)",
    streetAddressPlaceholder: "Qala ukuthayipha ikheli lomgwaqo...",
    countryLabel: "Izwe *",
    countryPlaceholder: "Izwe",
    postalCodeLabel: "Ikhodi yeposi",
    cityRequiredLabel: "Idolobha *",
    selectProfessional: "Khetha uchwepheshe",
    noSpecialistListed: "Akukabikho uchwepheshe oqokiwe kule ndawo. Qhubeka nanoma ubani otholakalayo.",
    chooseSpecialist: "Khetha uchwepheshe owuthandayo noma ukutholakala okusheshayo",
    anyProfessional: "Noma yimuphi uchwepheshe",
    ratingLabel: "★ {{rating}} isilinganiso",
    categoryMenu: "Imenyu ye-{{categoryName}}",
    whatWouldYouLike: "Ungathanda ini?",
    chooseFromCategory: "Khetha isevisi kulesi sigaba",
    bundleIncludedHint: "Iphakheji yakho ifakiwe — engeza noma ulungise izinsizakalo ngezansi uma kudingeka",
    choosePackageOrService: "Khetha iphakheji noma isevisi eyodwa",
    packages: "Amaphakheji",
    yourDetails: "Imininingwane yakho",
    detailsConfirmHint: "Sizoyisebenzisa ukuqinisekisa ukubhuka kwakho",
    firstName: "Igama",
    lastName: "Isibongo",
    emailPlaceholder: "wena@example.com",
    phoneLooksGood: "Kubukeka kuhle",
    phoneCompleteCountryCode: "Qedela inombolo ngekhodi yezwe",
    specialRequestsOptional: "Izicelo ezikhethekile (ungakhetha)",
    allergiesPlaceholder: "Ukungezwani, izintandokazi, amanothi okufinyelela...",
    additionalDetails: "Imininingwane eyengeziwe",
    requiredFieldsHint: "Sicela ugcwalise zonke izinkundla ezidingekayo (ezimakwe nge-*).",
    optionalBookingInfo: "Ulwazi olungakhethwa lwalo ukubhuka.",
    providerFormsTitle: "Amafomu avela kumhlinzeki wakho",
    providerFormsHint: "Sicela uqedele okulandelayo njengoba kudingwa umhlinzeki.",
    typeNameToSign: "Thayipha igama lakho ukuze usayine",
    nameRequired: "Sicela ufake igama nesibongo sakho.",
    fillNameEmailPhone: "Sicela ugcwalise igama, i-imeyili nocingo.",
    phoneWithCountryCode: "Sicela ufake inombolo yocingo evumelekile enekhodi yezwe.",
    completeProviderForms: "Sicela uqedele wonke amafomu adingekayo omhlinzeki.",
    completeRequiredDetails: "Sicela ugcwalise yonke imininingwane eyengeziwe edingekayo (emakwe nge-*).",
    noServicesSelected: "Azikho izinsizakalo ezikhethiwe — buyela emuva ukuze wengeze.",
    fullNameRequired: "Igama eligcwele *",
    depositOrPayAtVenue: "Idiphozithi noma inkokhelo ephelele ingadingeka ekukhokheni.",
    payOnlineOrInPerson: "Khokha ku-inthanethi manje noma mathupha endaweni.",
    withStaff: "No:",
    anyoneAvailable: "Noma ubani otholakalayo",
    reviewTitle: "Buyekeza ukubhuka kwakho",
    reviewSubtitle: "Qinisekisa imininingwane ngaphambi kokubamba isikhathi",
    edit: "Hlela",
    packageSuffix: "{{name}} (iphakheji)",
    durationMin: " · {{minutes}} amaminithi",
    addons: "Okungeziwe",
    total: "Ingqikithi",
    when: "Nini:",
    where: "Kuphi:",
    changeTime: "Shintsha isikhathi",
    changeVenue: "Shintsha indawo",
    securingSlot: "Sibamba isikhathi...",
    confirmContinue: "Qinisekisa bese uqhubeka",
    secureCheckout: "Ukukhokha okuphephile · Imininingwane yakho yokukhokha ivikelekile",
    addExtras: "Engeza okungeziwe",
    addExtrasSubtitle: "Ukwelashwa okungakhethwa ukuze kuthuthukise ukuvakasha kwakho",
    noAddonsSkip: "Akukho okungeziwe kulokhu okukhethiwe. Ungayeqa lesi sinyathelo.",
    boostYourSession: "Thuthukisa iseshini yakho",
    durationPlusMin: "+{{minutes}} amaminithi • ",
    services: "Izinsizakalo",
    groupTitle: "Ubhukela wena noma iqembu?",
    groupSubtitle: "Engeza ezinye izivakashi ukhethe izinsizakalo zazo. Uzoba oxhumana nabo oyinhloko walokhu kubhuka.",
    justMe: "Mina kuphela",
    justMeHint: "I-aphoyintimenti eyodwa yakho",
    groupBooking: "Ukubhuka kweqembu",
    groupBookingHint: "Isikhathi esifanayo, umuntu ngamunye ukhetha izinsizakalo zakhe (kuze kube ngabantu abangu-{{count}})",
    youPrimary: "Wena (oxhumana nabo oyinhloko)",
    durationPrice: "{{minutes}} amaminithi · {{amount}}",
    guestNumber: "Isivakashi {{n}}",
    theirServices: "Izinsizakalo zabo",
    addAnotherGuest: "Engeza esinye isivakashi",
    checkingTravelFee: "Sihlola imali yohambo…",
    estimatedTravelFee: "Imali yohambo elinganisiwe: {{amount}}",
    aboutKm: "Cishe u-{{km}} km",
    minDrive: "~{{minutes}} amaminithi ukushayela",
    finalAmountAfterSlot: "Inani lokugcina lingaqinisekiswa ekukhokheni ngemva kokubamba isikhathi.",
    travelArea: "Indawo yohambo",
    continueIfAddressCorrect: "Usengaqhubeka uma ukholelwa ukuthi ikheli lilungile.",
    chooseCategory: "Khetha isigaba",
    chooseCategoryHint: "Khetha uhlobo lwesevisi olufunayo",
    savePercentBadge: "Londoloza {{percent}}%",
    includedCount: "{{count}} kufakiwe · ",
    optionsTapHide: "{{count}} izinketho · thepha ukufihla",
    optionsTapShow: "{{count}} izinketho · thepha ukubonisa",
    durationMinShort: "{{minutes}} amaminithi",
  },
};

engine.xh = {
  ...engine.zu,
  chooseDateTime: "Khetha umhla nexesha",
  venueExperienceProvider: "Ungathanda ukuva njani u-{{providerName}}?",
  whereAppointment: "Ungathanda idinga lakho libe phi?",
  visitSalon: "Tyelela isaluni",
  visitSalonSubtitle: "Ukhathalelo lobungcali estudiyo",
  atYourHomeTitle: "Ekhaya lakho",
  atYourHomeSubtitle: "Ubuhle bufika emnyango wakho",
  noSalonLocations: "Lo mboneleli akanazo iindawo zesaluni. Khetha Ekhaya lakho okanye uzame omnye umboneleli.",
  serviceArea: "Indawo yenkonzo",
  cityRequiredLabel: "Isixeko *",
  countryLabel: "Ilizwe *",
  continueIfAddressCorrect: "Usenokuqhubeka ukuba ukholelwa ukuba idilesi ichanekile.",
  checkingTravelFee: "Kujongwa intlawulo yokuhamba…",
  estimatedTravelFee: "Intlawulo yokuhamba eqikelelweyo: {{amount}}",
  travelArea: "Indawo yokuhamba",
};

engine.ss = {
  ...engine.zu,
  visitSalon: "Vakashela lisaluni",
  atYourHomeTitle: "Ekhaya lakho",
  noSalonLocations: "Lomnikele akanato tindzawo tesaluni. Khetsa Ekhaya lakho noma uzame lomunye umnikele.",
  serviceArea: "Indzawo yensita",
};

engine.st = {
  chooseDateTime: "Khetha letsatsi le nako",
  timesLocalTimezone: "Dinako tsohle di ka nako ya sebaka sa hao ({{timezone}}).",
  nextAvailableSlot: "Nako e latelang e fumanehang",
  monthView: "Pono ya khoeli",
  todayBadge: "KAJENO",
  availableTimes: "Dinako tse fumanehang",
  noOpeningsToday: "Ha ho na dinako tse bulehileng kajeno",
  noOpeningsHint: "Leka letsatsi le leng kapa sebedisa \"E latelang e fumanehang\" ka holimo.",
  waitlistNotifyWhen: "Re tla o tsebisa ha {{time}} e fumaneha.",
  yourNameRequired: "Lebitso la hao *",
  phoneOptional: "Fono (boikgethelo)",
  invalidPhoneOrBlank: "Kenya nomoro e nepahetseng kapa tlohela lebala le le se nang letho.",
  addressCheckFailed: "Tlhahlobo ya aterese e hlolehile. O ka tswela pele.",
  couldNotConfirmTravel: "Ha re a kgona ho tiisa leeto ho aterese ena.",
  venueExperienceProvider: "O ka rata ho utlwa {{providerName}} jwang?",
  whereAppointment: "O ka rata kopano ya hao e be kae?",
  visitSalon: "Etela salune",
  visitSalonSubtitle: "Tlhokomelo ya setsebi ka studio",
  atYourHomeTitle: "Ha hao",
  atYourHomeSubtitle: "Monehelo o tla monyako wa hao",
  selectLocation: "Khetha sebaka",
  noSalonLocations: "Mofani enwa ha a na dibaka tsa salune. Khetha Ha hao kapa leka mofani e mong.",
  serviceArea: "Sebaka sa tshebeletso",
  addressSearchLabel: "Aterese ya hao (batla bakeng sa tefo ya leeto)",
  streetAddressPlaceholder: "Qala ho thaepa aterese ya seterata...",
  countryLabel: "Naha *",
  countryPlaceholder: "Naha",
  postalCodeLabel: "Khouto ya poso",
  cityRequiredLabel: "Toropo *",
  selectProfessional: "Khetha setsebi",
  noSpecialistListed: "Ha ho setsebi se thathamisitsweng bakeng sa sebaka sena. Tswela pele le mang kapa mang ya fumanehang.",
  chooseSpecialist: "Khetha setsebi seo o se ratang kapa phumaneho e potlakileng",
  anyProfessional: "Setsebi sefe kapa sefe",
  ratingLabel: "★ {{rating}} tlhahlobo",
  categoryMenu: "Lenane la {{categoryName}}",
  whatWouldYouLike: "O ka rata eng?",
  chooseFromCategory: "Khetha tshebeletso sehlopheng sena",
  bundleIncludedHint: "Sephuthelo sa hao se kenyeleditswe — eketsa kapa lokisa ditirelo ka tlase ha ho hlokahala",
  choosePackageOrService: "Khetha sephuthelo kapa tshebeletso e le nngwe",
  packages: "Dipakete",
  yourDetails: "Dintlha tsa hao",
  detailsConfirmHint: "Re tla di sebedisa ho tiisa reserveshene ya hao",
  firstName: "Lebitso",
  lastName: "Sefane",
  emailPlaceholder: "wena@example.com",
  phoneLooksGood: "E shebahala hantle",
  phoneCompleteCountryCode: "Qetella nomoro ka khoutu ya naha",
  specialRequestsOptional: "Dikopo tse kgethehileng (boikgethelo)",
  allergiesPlaceholder: "Mafu a letlalo, dikgetho, dintlha tsa ho fihlella...",
  additionalDetails: "Dintlha tse eketsehileng",
  requiredFieldsHint: "Ka kopo tlatsa masimo ohle a hlokehang (a tshwailweng ka *).",
  optionalBookingInfo: "Tlhahisoleseding e sa qobellwang bakeng sa reserveshene ena.",
  providerFormsTitle: "Diforomo tse tswang ho mofani wa hao",
  providerFormsHint: "Ka kopo qeta tse latelang jwalo ka ha mofani a hloka.",
  typeNameToSign: "Thaepa lebitso la hao ho saena",
  nameRequired: "Ka kopo kenya lebitso le sefane sa hao.",
  fillNameEmailPhone: "Ka kopo tlatsa lebitso, imeile le fono.",
  phoneWithCountryCode: "Ka kopo kenya nomoro e nepahetseng e nang le khoutu ya naha.",
  completeProviderForms: "Ka kopo qeta diforomo tsohle tse hlokehang tsa mofani.",
  completeRequiredDetails: "Ka kopo tlatsa dintlha tsohle tse eketsehileng tse hlokehang (tse tshwailweng ka *).",
  noServicesSelected: "Ha ho ditirelo tse kgethilweng — kgutlela morao ho eketsa.",
  fullNameRequired: "Lebitso le felletseng *",
  depositOrPayAtVenue: "Dipositi kapa tefo e felletseng e ka hlokahala ha o lefa.",
  payOnlineOrInPerson: "Lefa inthaneteng hona jwale kapa ka seqo sebakeng.",
  withStaff: "Le:",
  anyoneAvailable: "Mang kapa mang ya fumanehang",
  reviewTitle: "Hlahloba reserveshene ya hao",
  reviewSubtitle: "Tiisa dintlha pele o tshwara nako",
  edit: "Fetola",
  packageSuffix: "{{name}} (pakete)",
  durationMin: " · metsotso e {{minutes}}",
  addons: "Tse eketsehileng",
  total: "Kakaretso",
  when: "Neng:",
  where: "Kae:",
  changeTime: "Fetola nako",
  changeVenue: "Fetola sebaka",
  securingSlot: "Re tshwara nako...",
  confirmContinue: "Tiisa ebe o tswela pele",
  secureCheckout: "Tefo e sireletsehileng · Dintlha tsa hao tsa tefo di sireleditswe",
  addExtras: "Eketsa tse ding",
  addExtrasSubtitle: "Kalafo tsa boikgethelo ho ntlafatsa ketelo ya hao",
  noAddonsSkip: "Ha ho tse eketsehileng bakeng sa kgetho ena. O ka tlola mohato ona.",
  boostYourSession: "Matlafatsa seshene ya hao",
  durationPlusMin: "+metsotso e {{minutes}} • ",
  services: "Ditirelo",
  groupTitle: "O beha bakeng sa hao kapa sehlopha?",
  groupSubtitle: "Eketsa baeti ba bang mme o kgethe ditirelo tsa bona. O tla ba moikarabelli wa reserveshene.",
  justMe: "Nna feela",
  justMeHint: "Kopano e le nngwe bakeng sa hao",
  groupBooking: "Reserveshene ya sehlopha",
  groupBookingHint: "Nako e tshwanang, motho ka mong o kgetha ditirelo tsa hae (ho fihla ho batho ba {{count}})",
  youPrimary: "Wena (moikarabelli)",
  durationPrice: "metsotso e {{minutes}} · {{amount}}",
  guestNumber: "Moeti {{n}}",
  theirServices: "Ditirelo tsa bona",
  addAnotherGuest: "Eketsa moeti e mong",
  checkingTravelFee: "Ho hlahloba tefo ya leeto…",
  estimatedTravelFee: "Tefo ya leeto e hakanyetswang: {{amount}}",
  aboutKm: "Hoo e ka bang {{km}} km",
  minDrive: "~metsotso e {{minutes}} ho kganna",
  finalAmountAfterSlot: "Chelete e qetellang e ka tiiswa ha o lefa ka mora hore re tshware nako.",
  travelArea: "Sebaka sa leeto",
  continueIfAddressCorrect: "O ka tswela pele ha o dumela hore aterese e nepahetse.",
  chooseCategory: "Khetha sehlopha",
  chooseCategoryHint: "Khetha mofuta wa tshebeletso eo o e batlang",
  savePercentBadge: "Boloka {{percent}}%",
  includedCount: "{{count}} e kenyeleditswe · ",
  optionsTapHide: "{{count}} dikgetho · tobetsa ho pata",
  optionsTapShow: "{{count}} dikgetho · tobetsa ho bontsha",
  durationMinShort: "metsotso e {{minutes}}",
};

engine.nso = { ...engine.st };
engine.nso.visitSalon = "Etela salune";
engine.nso.atYourHomeTitle = "Gae ga gago";
engine.nso.noSalonLocations =
  "Mophilegi yo ga a na mafelo a salune. Kgetha Gae ga gago goba leka mophilegi yo mongwe.";
engine.nso.serviceArea = "Lefelo la tirelo";
engine.nso.venueExperienceProvider = "O ka rata go itemogela {{providerName}} bjang?";
engine.nso.whereAppointment = "O ka rata kopano ya gago e be kae?";

engine.tn = { ...engine.st };
engine.tn.visitSalon = "Etela salune";
engine.tn.atYourHomeTitle = "Kwa gae ga gago";
engine.tn.noSalonLocations =
  "Mabeeledi yo ga a na mafelo a salune. Tlhopha Kwa gae ga gago kgotsa leka mabeeledi yo mongwe.";
engine.tn.serviceArea = "Lefelo la tirelo";

engine.ts = { ...engine.st };
engine.ts.visitSalon = "Endzela saluni";
engine.ts.atYourHomeTitle = "Ekaya ra wena";
engine.ts.noSalonLocations =
  "Muavelo loyi a nga na tindhawu ta saluni. Hlawula Ekaya ra wena kumbe ringeta muavelo un'wana.";
engine.ts.serviceArea = "Ndhawu ya vukorhokeri";

engine.ve = { ...engine.st };
engine.ve.visitSalon = "Dalela saluni";
engine.ve.atYourHomeTitle = "Haya hau";
engine.ve.noSalonLocations =
  "Mune wa tshumelo u si na fhethu dza saluni. Nanga Haya hau kana linga mune wa tshumelo unwe.";
engine.ve.serviceArea = "Fhethu ha tshumelo";

const extras = {
  af: {
    continue: "Gaan voort",
    loading: "Laai tans...",
    useCurrentLocation: "Gebruik huidige ligging",
    cityPlaceholder: "Stad",
    postalCodePlaceholder: "Poskode",
    homeTitle: "Markplek vir skoonheidsdienste",
    homeDescription: "Ontdek en bespreek skoonheidsdienste by geverifieerde verskaffers naby jou.",
    homeSrOnlyTitle: "Ontdek en bespreek geverifieerde skoonheidsprofessionals",
    homeSrOnlyTitleCategory: "{{label}} — bespreek vertroude skoonheidsprofessionals naby jou",
    providerClient: {
      loadFailed: "Kon nie verskaffer laai nie",
      loadingYourBooking: "Laai tans jou bespreking...",
      loadingBooking: "Laai tans bespreking...",
      onlineBookingUnavailable: "Aanlyn bespreking is nie beskikbaar nie",
      onlineBookingDisabled: "{{name}} het nie aanlyn bespreking aangeskakel nie. Kontak hulle direk om te bespreek.",
      findAnotherProvider: "Vind 'n ander verskaffer",
    },
    flow: {
      otherServices: "Ander dienste",
      anyProfessional: "Enige professionele persoon",
      fastestAvailability: "Vinnigste beskikbaarheid",
      services: "Dienste",
      allServices: "Alle dienste",
      noPreference: "Geen voorkeur",
      failedLoad: "Kon nie laai nie",
      noSlotsTwoWeeks: "Geen beskikbare tye in die volgende twee weke nie",
      chooseDateTime: "Kies asseblief 'n datum en tyd om voort te gaan.",
      acceptCancellationPolicy: "Aanvaar asseblief die kansellasiebeleid om voort te gaan.",
      enterAddress: "Voer asseblief jou adres in vir 'n tuisbespreking",
      failedSecureSlot: "Kon nie die tyd toesluit nie. Probeer asseblief weer.",
      anyoneAvailable: "Enigiemand beskikbaar",
      failedSecureSlotTryAnother: "Kon nie die tyd toesluit nie. Probeer 'n ander tyd.",
      failedSecureSlotShort: "Kon nie die tyd toesluit nie",
      summary: "Opsomming",
      serviceCount_one: "{{count}} diens",
      serviceCount_other: "{{count}} dienste",
      discardConfirm: "Gooi hierdie bespreking weg en begin oor? Jou keuses en byvoegings sal uitgevee word.",
    },
  },
  zu: {
    continue: "Qhubeka",
    loading: "Iyalayisha...",
    useCurrentLocation: "Sebenzisa indawo yamanje",
    cityPlaceholder: "Idolobha",
    postalCodePlaceholder: "Ikhodi yeposi",
    homeTitle: "Imakethe yezinsizakalo zobuhle",
    homeDescription: "Thola ubhuke izinsizakalo zobuhle ezivela kubahlinzeki abaqinisekisiwe eduze kwakho.",
    homeSrOnlyTitle: "Thola ubhuke ochwepheshe bobuhle abaqinisekisiwe",
    homeSrOnlyTitleCategory: "{{label}} — bhuka ochwepheshe bobuhle abathembekile eduze kwakho",
    providerClient: {
      loadFailed: "Yehlulekile ukulayisha umhlinzeki",
      loadingYourBooking: "Iyalayisha ukubhuka kwakho...",
      loadingBooking: "Iyalayisha ukubhuka...",
      onlineBookingUnavailable: "Ukubhuka ku-inthanethi akutholakali",
      onlineBookingDisabled: "{{name}} akaqalisi ukubhuka ku-inthanethi. Baxhumane ngqo ukuze ubhuke.",
      findAnotherProvider: "Thola omunye umhlinzeki",
    },
    flow: {
      otherServices: "Ezinye izinsizakalo",
      anyProfessional: "Noma yimuphi uchwepheshe",
      fastestAvailability: "Ukutholakala okusheshayo",
      services: "Izinsizakalo",
      allServices: "Zonke izinsizakalo",
      noPreference: "Akukho okuncamelayo",
      failedLoad: "Yehlulekile ukulayisha",
      noSlotsTwoWeeks: "Azikho izikhathi ezitholakalayo emasontweni amabili ezayo",
      chooseDateTime: "Sicela ukhethe usuku nesikhathi ukuze uqhubeke.",
      acceptCancellationPolicy: "Sicela wamukele inqubomgomo yokukhansela ukuze uqhubeke.",
      enterAddress: "Sicela ufake ikheli lakho ukuze ubhuke ekhaya",
      failedSecureSlot: "Yehlulekile ukubamba isikhathi. Sicela uzame futhi.",
      anyoneAvailable: "Noma ubani otholakalayo",
      failedSecureSlotTryAnother: "Yehlulekile ukubamba isikhathi. Zama esinye isikhathi.",
      failedSecureSlotShort: "Yehlulekile ukubamba isikhathi",
      summary: "Isifinyezo",
      serviceCount_one: "isevisi engu-{{count}}",
      serviceCount_other: "izinsizakalo ezingu-{{count}}",
      discardConfirm: "Lahla lokhu kubhuka uqale phansi? Okukhethile nokungeziwe kuzosuswa.",
    },
  },
};

extras.xh = {
  ...extras.zu,
  continue: "Qhubeka",
  useCurrentLocation: "Sebenzisa indawo yangoku",
  cityPlaceholder: "Isixeko",
  homeSrOnlyTitle: "Fumana uze ubhuke iingcali zobuhle eziqinisekisiweyo",
  homeSrOnlyTitleCategory: "{{label}} — bhuka iingcali zobuhle ezithembekileyo kufutshane nawe",
  providerClient: {
    ...extras.zu.providerClient,
    loadFailed: "Kusilele ukulayisha umboneleli",
    findAnotherProvider: "Fumana omnye umboneleli",
  },
};
extras.ss = { ...extras.zu, continue: "Chubeka", cityPlaceholder: "Lidolobha" };
extras.st = {
  continue: "Tswela pele",
  loading: "E ya jarisa...",
  useCurrentLocation: "Sebedisa sebaka sa hona jwale",
  cityPlaceholder: "Toropo",
  postalCodePlaceholder: "Khouto ya poso",
  homeTitle: "Mmaraka wa ditirelo tsa botle",
  homeDescription: "Fumana mme o bee ditirelo tsa botle ho bafani ba netefaditsweng haufi le wena.",
  homeSrOnlyTitle: "Fumana mme o bee ditsebi tsa botle tse netefaditsweng",
  homeSrOnlyTitleCategory: "{{label}} — bee ditsebi tsa botle tse tshepahalang haufi le wena",
  providerClient: {
    loadFailed: "E hlolehile ho jarisa mofani",
    loadingYourBooking: "E jarisa reserveshene ya hao...",
    loadingBooking: "E jarisa reserveshene...",
    onlineBookingUnavailable: "Ho beha ka inthanete ha ho yo",
    onlineBookingDisabled: "{{name}} ha a bule ho beha ka inthanete. Ikwamananye le bona ka ho toba.",
    findAnotherProvider: "Fumana mofani e mong",
  },
  flow: {
    otherServices: "Ditirelo tse ding",
    anyProfessional: "Setsebi sefe kapa sefe",
    fastestAvailability: "Phumaneho e potlakileng",
    services: "Ditirelo",
    allServices: "Ditirelo tsohle",
    noPreference: "Ha ho kgetho",
    failedLoad: "E hlolehile ho jarisa",
    noSlotsTwoWeeks: "Ha ho dinako tse fumanehang dibekeng tse pedi tse tlang",
    chooseDateTime: "Ka kopo kgetha letsatsi le nako ho tswela pele.",
    acceptCancellationPolicy: "Ka kopo amohela leano la ho hlakola ho tswela pele.",
    enterAddress: "Ka kopo kenya aterese ya hao bakeng sa ho beha lapeng",
    failedSecureSlot: "E hlolehile ho tshwara nako. Ka kopo leka hape.",
    anyoneAvailable: "Mang kapa mang ya fumanehang",
    failedSecureSlotTryAnother: "E hlolehile ho tshwara nako. Leka nako e nngwe.",
    failedSecureSlotShort: "E hlolehile ho tshwara nako",
    summary: "Kakaretso",
    serviceCount_one: "tshebeletso e {{count}}",
    serviceCount_other: "ditirelo tse {{count}}",
    discardConfirm: "Lahla reserveshene ena mme o qale botjha? Dikgetho le tse eketsehileng di tla hlakolwa.",
  },
};
extras.nso = { ...extras.st, continue: "Tšwela pele", cityPlaceholder: "Toropo" };
extras.tn = { ...extras.st, continue: "Tswelela", cityPlaceholder: "Toropo" };
extras.ts = { ...extras.st, continue: "Yana emahlweni", cityPlaceholder: "Doroba" };
extras.ve = { ...extras.st, continue: "Bvela phanḓa", cityPlaceholder: "Ḓorobo" };

const LOCALES = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

for (const code of LOCALES) {
  const file = path.join(localesDir, `${code}.json`);
  let src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  src = src.replace(/\r\n/g, "\n");

  if (!engine[code]) throw new Error(`No engine translations for ${code}`);
  const bookEngineAt = src.indexOf('"chooseDateTime": "Choose a date & time"');
  if (bookEngineAt < 0) throw new Error(`Missing English web.book.engine in ${code}`);
  const engineKeyAt = src.lastIndexOf('"engine": {', bookEngineAt);
  src = replaceNamedObject(src, "engine", engine[code], 6, engineKeyAt);

  const bookAt = src.lastIndexOf('"book": {', bookEngineAt);
  const providerClientAt = src.indexOf('"providerClient": {', bookAt);
  if (providerClientAt < 0) throw new Error(`Missing web.book.providerClient in ${code}`);
  src = replaceNamedObject(src, "providerClient", extras[code].providerClient, 6, providerClientAt);

  const flowAt = src.indexOf('"otherServices": "Other Services"');
  if (flowAt < 0) throw new Error(`Missing English web.book.flow in ${code}`);
  src = replaceNamedObject(src, "flow", extras[code].flow, 6, src.lastIndexOf('"flow": {', flowAt));

  src = replaceFirst(src, "continue", "Continue", extras[code].continue);
  src = replaceFirst(src, "loading", "Loading...", extras[code].loading);
  src = replaceFirst(src, "useCurrentLocation", "Use current location", extras[code].useCurrentLocation);
  src = replaceFirst(src, "cityPlaceholder", "City", extras[code].cityPlaceholder);
  src = replaceFirst(src, "postalCodePlaceholder", "Postal / ZIP code", extras[code].postalCodePlaceholder);
  src = replaceFirst(src, "homeTitle", "Beauty Services Marketplace", extras[code].homeTitle);
  src = replaceFirst(
    src,
    "homeDescription",
    "Discover and book beauty services from verified providers near you.",
    extras[code].homeDescription,
  );
  src = insertAfter(
    src,
    `"homeDescription": ${JSON.stringify(extras[code].homeDescription)},`,
    `\n      "homeSrOnlyTitle": ${JSON.stringify(extras[code].homeSrOnlyTitle)},\n      "homeSrOnlyTitleCategory": ${JSON.stringify(extras[code].homeSrOnlyTitleCategory)},`,
  );

  if (eol === "\r\n") src = src.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, src);
  console.log(`patched ${code}`);
}
