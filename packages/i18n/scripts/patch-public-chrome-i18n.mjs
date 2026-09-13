#!/usr/bin/env node
/**
 * Adds public-web chrome keys (home, cards, categories, footer links, prefs)
 * and real Wave A translations so language switch updates header/footer/home.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

const LANGS = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar", "sw", "pt", "es"];

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

const EN_DELTA = {
  web: {
    home: {
      topRated: "Top rated",
      viewAll: "View all",
      hottestPicks: "Hottest picks",
      nearestProviders: "Nearest providers",
      risingStar: "Rising star",
      nearby: "Nearby",
      sponsored: "Sponsored",
      fromPrice: "From",
      newsForYou: "News for you",
      newsInviteDiscount: "Get a 15% service discount by inviting 10 friends!",
      newsGetBackGroove: "Get back your groove with a renewed sense of beauty",
      newsDoorstep: "The convenience of having service at your doorstep",
      inviteFriends: "Invite your friends",
      browseByCity: "Browse by city",
      countryWide: "Country-wide",
      within: "Within",
      withinKm: "{{km}} km",
      loadingTopRated: "Loading top rated providers...",
      loadingHottest: "Loading hottest picks...",
      loadingNearest: "Loading nearest providers...",
      loadingRising: "Loading rising stars...",
      loadingNearby: "Loading nearby providers...",
      loadingCities: "Loading cities...",
      loadingServices: "Loading services...",
      loadingLocations: "Loading locations...",
      loadingCategories: "Loading categories...",
      unableToLoadProviders: "Unable to load providers",
      retry: "Retry",
      noTopRated: "No top rated providers yet",
      noTopRatedHint: "Check back later for top rated providers",
      noHottest: "No trending providers yet",
      noHottestHint: "Check back later for hottest picks",
      noNearest: "No nearby providers",
      noNearestHint: "We couldn't find providers near you. Try searching by city.",
      noRising: "No new providers yet",
      noRisingHint: "Check back later for rising stars",
      noNearby: "No nearby providers",
      noNearbyHint: "Check back later for providers near you",
      noCities: "No cities found",
      noCitiesInCountry: "No providers found in {{country}}",
      failedLoadCities: "Failed to load cities",
      requestTimedOut: "Request timed out. Please try again.",
      sortBy: "Sort by",
      sortRecommended: "Recommended",
      sortNearest: "Nearest",
      sortTopRated: "Top-rated",
      venueType: "Venue type",
      venueEveryone: "Everyone",
      venueFemaleOnly: "Female only",
      venueMaleOnly: "Male only",
      reviewCount_one: "{{count}} review",
      reviewCount_other: "{{count}} reviews",
      distanceKm: "{{km}} km",
      country: {
        ZA: "South Africa",
        KE: "Kenya",
        GH: "Ghana",
        NG: "Nigeria",
        EG: "Egypt",
      },
    },
    cards: {
      topRated: "Top rated",
      hottest: "Hottest",
      nearest: "Nearest",
      risingStar: "Rising star",
      freelancer: "Freelancer",
      houseCalls: "House calls",
      houseCall: "House call",
      atSalon: "At salon",
      sponsored: "Sponsored",
      listingBadges: "Listing badges",
      moreBadges: "{{count}} more badges",
      moreBadgesShort: "+{{count}} more",
      outOf5: "{{rating}} out of 5",
      noReviewsYet: "No reviews yet",
      noReviews: "No reviews",
      reviews: "{{formatted}} reviews",
      savedWishlist: "Saved to wishlist",
      removedWishlist: "Removed from wishlist",
      wishlistFailed: "Failed to update wishlist",
      addWishlistA11y: "Add {{name}} to wishlist",
      removeWishlistA11y: "Remove {{name}} from wishlist",
      providerFallback: "Provider",
    },
    categories: {
      hair: "Hair",
      nails: "Nails",
      braids: "Braids",
      makeup: "Makeup",
      massage: "Massage",
      dreadlocks: "Dreadlocks",
      "brows-lashes": "Brows & lashes",
      "natural-hair": "Natural hair",
      "wigs-weaves": "Wigs & weaves",
      "skin-facials": "Skin & facials",
      "hair-removal": "Hair removal",
      barber: "Barber",
      spa: "Spa",
      barbering: "Barbering",
      skincare: "Skincare",
      lashes: "Lashes",
      body: "Body",
      "beauty-services": "Beauty services",
    },
    layout: {
      footer: {
        ios: "iOS",
        links: {
          about: "About",
          aboutUs: "About us",
          careers: "Careers",
          contact: "Contact",
          blog: "Blog",
          press: "Press",
          help: "Help",
          helpCenter: "Help centre",
          learn: "Learn",
          learningCenter: "Learning centre",
          becomePartner: "Become a partner",
          pricing: "Pricing",
          forPartners: "For partners",
          giftCard: "Gift card",
          giftCardPurchase: "Gift card purchase",
          terms: "Terms of service",
          termsOfUse: "Terms of use",
          privacy: "Privacy policy",
          cookies: "Cookies",
          cookiePolicy: "Cookie policy",
          sitemap: "Sitemap",
          community: "Community guidelines",
          accessibility: "Accessibility",
          media: "Media assets",
          customerSupport: "Customer support",
        },
      },
    },
    preferences: {
      suggested: "Suggested languages",
      chooseLanguage: "Choose a language",
      chooseCurrency: "Choose a currency",
      chooseRegion: "Choose a region",
      searchCurrencies: "Search currencies",
      translationNote: "Some provider names, reviews, and listing details may stay in their original language.",
    },
  },
  customer: {
    mobile: {
      stackTitles: {
        pdf: "PDF",
        shop: "Shop",
        checkout: "Checkout",
        support: "Support",
        ticket: "Ticket",
        newTicket: "New ticket",
      },
    },
  },
};

/** 14 values in LANGS order */
const TR = {
  "web.home.topRated": ["Topgegradeer", "Okulinganiswe phezulu", "Okulinganiswe phezulu", "Tse hlomphuoang haholo", "Tše di swanetšwego kudu", "Tse di tlotlegang thata", "Leswi pimiweke ehenhla", "Zwo linganywaho ntha", "Lokulinganiswe ngetulu", "Les mieux notés", "الأعلى تقييماً", "Vilivyokadiriwa juu", "Mais bem avaliados", "Mejor valorados"],
  "web.home.viewAll": ["Sien alles", "Buka konke", "Jonga konke", "Sheba tsohle", "Bona ka moka", "Bona tsotlhe", "Vona hinkwaswo", "Vhona zwoṱhe", "Buka konkhe", "Tout voir", "عرض الكل", "Tazama zote", "Ver tudo", "Ver todo"],
  "web.home.hottestPicks": ["Gewildste keuses", "Okudumile kakhulu", "Ezithandwa kakhulu", "Tse tummeng haholo", "Tše di tumilego kudu", "Tse di tumileng thata", "Swo tsakisa swinene", "Zwo takadza vhukuma", "Lokudvumile kakhulu", "Coups de cœur", "الأكثر رواجاً", "Chaguo moto", "Escolhas em alta", "Selección del momento"],
  "web.home.nearestProviders": ["Naaste diensverskaffers", "Abanikezeli abaseduze", "Abanikezeli abakufutshane", "Bafani ba haufi", "Baabi ba kgauswi", "Baabi ba gaufi", "Vaphakeri va le kusuhi", "Vhaphamedi vha tsini", "Baniketi labasedvute", "Prestataires les plus proches", "أقرب مقدمي الخدمة", "Watoa huduma wa karibu", "Prestadores mais próximos", "Proveedores más cercanos"],
  "web.home.risingStar": ["Opkomende ster", "Inkanyezi ekhuphukayo", "Inkwenkwezi ekhulayo", "Naleli e nyolohang", "Naledi ye e golago", "Naledi e e golang", "Nyenyana leyi tlhandlukaka", "Naledzi i khou alusa", "Inkanyeti lekhulako", "Étoile montante", "نجم صاعد", "Nyota inayopanda", "Estrela em ascensão", "Estrella emergente"],
  "web.home.nearby": ["Naby", "Eduze", "Kufutshane", "Haufi", "Kgauswi", "Gaufi", "Kusuhi", "Tsini", "Sedvute", "À proximité", "بالقرب منك", "Karibu", "Perto de si", "Cerca"],
  "web.home.sponsored": ["Geborg", "Kuxhaswe", "Kuxhaswe", "E tšehelitsoeng", "E thekgilwego", "E e tshegediwang", "Swo seketeleriwa", "Zwo tikedzwa", "Kwesekelwe", "Sponsorisé", "مموّل", "Imedhaminiwa", "Patrocinado", "Patrocinado"],
  "web.home.fromPrice": ["Van", "Kusukela", "Ukususela", "Ho tloha", "Go tloga", "Go tswa", "Ku sukela", "U bva", "Kusukela", "À partir de", "من", "Kuanzia", "A partir de", "Desde"],
  "web.home.newsForYou": ["Nuus vir jou", "Izindaba zakho", "Iindaba zakho", "Litaba tsa hao", "Ditaba tša gago", "Dikgang tsa gago", "Mahungu ya wena", "Mafhungo a au", "Tindzaba takho", "Actualités pour vous", "أخبار لك", "Habari kwako", "Novidades para si", "Novedades para ti"],
  "web.home.newsInviteDiscount": ["Kry 15% afslag op dienste deur 10 vriende uit te nooi!", "Thola isaphulelo sika-15% ngezinsizakalo ngokumema abangane aba-10!", "Fumana isaphulelo se-15% ngeenkonzo ngokumema abahlobo aba-10!", "Fumana theolelo ea 15% ka ho mema metsoalle e 10!", "Hwetša theolo ya 15% ka go laletša bagwera ba 10!", "Bona phokotso ya 15% ka go laletsa ditsala di le 10!", "Kuma ntsengo wa 15% hi ku rhamba vanghana va 10!", "Wana phungudzo ya 15% nga u ramba vhasendane vha 10!", "Tfola saphulelo sa-15% ngekumema bangani laba-10!", "Obtenez 15 % de réduction en invitant 10 amis !", "احصل على خصم 15٪ بدعوة 10 أصدقاء!", "Pata punguzo la 15% kwa kualika marafiki 10!", "Obtenha 15% de desconto ao convidar 10 amigos!", "¡Consigue un 15% de descuento invitando a 10 amigos!"],
  "web.home.newsGetBackGroove": ["Kry jou ritme terug met 'n hernieude gevoel van skoonheid", "Buyisela umdlandla wakho ngomuzwa omusha wobuhle", "Buyisela umdlandla wakho ngoluvo olutsha lobuhle", "Khutlisa morethetho oa hao ka kutlo e ncha ea botle", "Buša morethetho wa gago ka maikutlo a maswa a bobotse", "Busa morethetho wa gago ka maikutlo a maswa a bontle", "Tlherisela ntsakelo ya wena hi nhlohloro leyintshwa ya vusweti", "Vhuedzedza mutevhe wa u takala nga vhuvha vhuswa ha vhudele", "Buyisela umdlandla wakho ngemiva lemusha yebuhle", "Retrouvez votre élan avec une beauté renouvelée", "استعد إيقاعك بشعور متجدد بالجمال", "Rudisha mdundo wako kwa hisia mpya ya urembo", "Recupere o seu ritmo com uma nova sensação de beleza", "Recupera tu ritmo con una nueva sensación de belleza"],
  "web.home.newsDoorstep": ["Die gerief van diens by jou voordeur", "Ukulula kokuthola insizakalo emnyango wakho", "Ukuba lula kokufumana inkonzo emnyango wakho", "Bohlokoa ba tšebeletso monyako oa hao", "Bohlokwa bja tirelo mo monyako wa gago", "Bosiame jwa tirelo mo monyako wa gago", "Ku olova ka vukorhokeri eminyangweni ya wena", "U leluwa ha tshumelo kha luṇango lwaṋu", "Kulula kwekutfola insita emnyango wakho", "La commodité d’un service à votre porte", "راحة الحصول على الخدمة عند باب منزلك", "Urahisi wa huduma mlangoni mwako", "A comodidade de ter o serviço à sua porta", "La comodidad de tener el servicio en tu puerta"],
  "web.home.inviteFriends": ["Nooi jou vriende", "Mema abangane bakho", "Mema abahlobo bakho", "Mema metsoalle ea hao", "Laletša bagwera ba gago", "Laletsa ditsala tsa gago", "Rhamba vanghana va wena", "Ramba vhasendane vhaṋu", "Mema bangani bakho", "Inviter vos amis", "ادعُ أصدقاءك", "Alika marafiki", "Convidar amigos", "Invitar a tus amigos"],
  "web.home.browseByCity": ["Blaai volgens stad", "Bheka ngedolobha", "Khangela ngesixeko", "Sheba ka toropo", "Phetla ka toropo", "Batla ka toropo", "Langutisa hi doroba", "Khou sedza nga ḓorobo", "Buka ngedolobha", "Parcourir par ville", "تصفح حسب المدينة", "Vinjari kwa jiji", "Explorar por cidade", "Explorar por ciudad"],
  "web.home.countryWide": ["Landwyd", "Ezweni lonke", "Ezweni lonke", "Nahareng kaofela", "Nageng ka moka", "Mo nageng yotlhe", "Tiko hinkwaro", "Shango ḽoṱhe", "Evelonkhe", "Tout le pays", "على مستوى البلاد", "Nchi nzima", "Todo o país", "En todo el país"],
  "web.home.within": ["Binne", "Ngaphakathi", "Ngaphakathi", "Ka hare", "Ka gare", "Mo gare", "Endzeni", "Ngomu", "Ngekhatsi", "Dans un rayon de", "ضمن", "Ndani ya", "Num raio de", "En un radio de"],
  "web.home.withinKm": ["{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} كم", "{{km}} km", "{{km}} km", "{{km}} km"],
  "web.home.loadingTopRated": ["Laai topgegradeerde diensverskaffers...", "Ilayisha abanikezeli abalinganiswe phezulu...", "Ilayisha abanikezeli abalinganiswe phezulu...", "E kenya bafani ba holimo...", "E tsenya baabi ba godimo...", "E tsenya baabi ba kwa godimo...", "Yi nghenisa vaphakeri va le henhla...", "I khou dzhenisa vhaphamedi vha ntha...", "Ilayisha baniketi labalinganiswe ngetulu...", "Chargement des mieux notés...", "جارٍ تحميل الأعلى تقييماً...", "Inapakia watoa huduma bora...", "A carregar os mais bem avaliados...", "Cargando los mejor valorados..."],
  "web.home.loadingHottest": ["Laai gewildste keuses...", "Ilayisha okudumile...", "Ilayisha ezithandwayo...", "E kenya tse tummeng...", "E tsenya tše di tumilego...", "E tsenya tse di tumileng...", "Yi nghenisa swo tsakisa...", "I khou dzhenisa zwo takadzaho...", "Ilayisha lokudvumile...", "Chargement des coups de cœur...", "جارٍ تحميل الأكثر رواجاً...", "Inapakia chaguo moto...", "A carregar escolhas em alta...", "Cargando la selección del momento..."],
  "web.home.loadingNearest": ["Laai naaste diensverskaffers...", "Ilayisha abaseduze...", "Ilayisha abakufutshane...", "E kenya ba haufi...", "E tsenya ba kgauswi...", "E tsenya ba gaufi...", "Yi nghenisa va le kusuhi...", "I khou dzhenisa vha tsini...", "Ilayisha labasedvute...", "Chargement des plus proches...", "جارٍ تحميل الأقرب...", "Inapakia walio karibu...", "A carregar os mais próximos...", "Cargando los más cercanos..."],
  "web.home.loadingRising": ["Laai opkomende sterre...", "Ilayisha izinkanyezi ezikhuphukayo...", "Ilayisha iinkwenkwezi ezikhulayo...", "E kenya linaleli tse nyolohang...", "E tsenya dinaledi tše di golago...", "E tsenya dinaledi tse di golang...", "Yi nghenisa tinyenyana to tlhandluka...", "I khou dzhenisa naledzi dzi khou alusa...", "Ilayisha tinkanyeti letikhulako...", "Chargement des étoiles montantes...", "جارٍ تحميل النجوم الصاعدة...", "Inapakia nyota zinazopanda...", "A carregar estrelas em ascensão...", "Cargando estrellas emergentes..."],
  "web.home.loadingNearby": ["Laai nabygeleë diensverskaffers...", "Ilayisha abaseduze...", "Ilayisha abakufutshane...", "E kenya ba haufi...", "E tsenya ba kgauswi...", "E tsenya ba gaufi...", "Yi nghenisa va le kusuhi...", "I khou dzhenisa vha tsini...", "Ilayisha labasedvute...", "Chargement des prestataires à proximité...", "جارٍ تحميل القريبين...", "Inapakia walio karibu...", "A carregar prestadores próximos...", "Cargando proveedores cercanos..."],
  "web.home.loadingCities": ["Laai stede...", "Ilayisha amadolobha...", "Ilayisha izixeko...", "E kenya litoropo...", "E tsenya ditoropo...", "E tsenya ditoropo...", "Yi nghenisa madoroba...", "I khou dzhenisa ḓorobo...", "Ilayisha emadolobha...", "Chargement des villes...", "جارٍ تحميل المدن...", "Inapakia miji...", "A carregar cidades...", "Cargando ciudades..."],
  "web.home.loadingServices": ["Laai dienste...", "Ilayisha izinsizakalo...", "Ilayisha iinkonzo...", "E kenya litšebeletso...", "E tsenya ditirelo...", "E tsenya ditirelo...", "Yi nghenisa vukorhokeri...", "I khou dzhenisa tshumelo...", "Ilayisha tinsita...", "Chargement des services...", "جارٍ تحميل الخدمات...", "Inapakia huduma...", "A carregar serviços...", "Cargando servicios..."],
  "web.home.loadingLocations": ["Laai liggings...", "Ilayisha izindawo...", "Ilayisha iindawo...", "E kenya libaka...", "E tsenya difelo...", "E tsenya mafelo...", "Yi nghenisa tindhawu...", "I khou dzhenisa fhethu...", "Ilayisha tindzawo...", "Chargement des lieux...", "جارٍ تحميل المواقع...", "Inapakia maeneo...", "A carregar localizações...", "Cargando ubicaciones..."],
  "web.home.loadingCategories": ["Laai kategorieë...", "Ilayisha izigaba...", "Ilayisha iindidi...", "E kenya lihlopha...", "E tsenya dihlopha...", "E tsenya dikarolo...", "Yi nghenisa swiyenge...", "I khou dzhenisa zwigwada...", "Ilayisha tigaba...", "Chargement des catégories...", "جارٍ تحميل الفئات...", "Inapakia kategoria...", "A carregar categorias...", "Cargando categorías..."],
  "web.home.unableToLoadProviders": ["Kon nie diensverskaffers laai nie", "Ayikwazanga ukulayisha abanikezeli", "Ayikwazanga ukulayisha abanikezeli", "Ha e khone ho kenya bafani", "Ga e kgone go tsenya baabi", "Ga e kgone go tsenya baabi", "A yi koti ku nghenisa vaphakeri", "A i koni u dzhenisa vhaphamedi", "Ayikwati kulayisha baniketi", "Impossible de charger les prestataires", "تعذّر تحميل مقدمي الخدمة", "Imeshindwa kupakia watoa huduma", "Não foi possível carregar prestadores", "No se pudieron cargar los proveedores"],
  "web.home.retry": ["Probeer weer", "Zama futhi", "Zama kwakhona", "Leka hape", "Leka gape", "Leka gape", "Ringa nakambe", "Lingedza hafhu", "Zama futsi", "Réessayer", "إعادة المحاولة", "Jaribu tena", "Tentar novamente", "Reintentar"],
  "web.home.noTopRated": ["Nog geen topgegradeerde diensverskaffers nie", "Abakabikho abanikezeli abalinganiswe phezulu", "Abakabikho abanikezeli abalinganiswe phezulu", "Ha ho so be le bafani ba holimo", "Ga go eso be le baabi ba godimo", "Ga go eso nne le baabi ba kwa godimo", "A ku si va na vaphakeri va le henhla", "A hu athu u vha na vhaphamedi vha ntha", "Abakabi khona baniketi labalinganiswe ngetulu", "Pas encore de prestataires mieux notés", "لا يوجد مقدمو خدمة بتقييم عالٍ بعد", "Bado hakuna watoa huduma bora", "Ainda sem prestadores mais bem avaliados", "Aún no hay proveedores mejor valorados"],
  "web.home.noTopRatedHint": ["Kom later weer vir topgegradeerde diensverskaffers", "Buyela emuva ukuze uthole abanikezeli abalinganiswe phezulu", "Buya kamva ukuze ufumane abanikezeli abalinganiswe phezulu", "Khosela hamorao bakeng sa bafani ba holimo", "Boela morago bakeng sa baabi ba godimo", "Boela morago bakeng sa baabi ba kwa godimo", "Vuya endzhaku u kuma vaphakeri va le henhla", "Vhuyani nga murahu u wana vhaphamedi vha ntha", "Buyela emuva utfole baniketi labalinganiswe ngetulu", "Revenez plus tard pour les mieux notés", "عد لاحقاً لأعلى التقييمات", "Rudi baadaye kwa walio bora", "Volte mais tarde para os mais bem avaliados", "Vuelve más tarde para ver los mejor valorados"],
  "web.home.noHottest": ["Nog geen gewilde diensverskaffers nie", "Abakabikho abanikezeli abadumile", "Abakabikho abanikezeli abathandwayo", "Ha ho so be le bafani ba tummeng", "Ga go eso be le baabi ba tumilego", "Ga go eso nne le baabi ba tumileng", "A ku si va na vaphakeri vo tsakisa", "A hu athu u vha na vhaphamedi vho takadzaho", "Abakabi khona baniketi labadvumile", "Pas encore de coups de cœur", "لا يوجد مقدمو خدمة رائجون بعد", "Bado hakuna chaguo moto", "Ainda sem escolhas em alta", "Aún no hay selección del momento"],
  "web.home.noHottestHint": ["Kom later weer vir gewildste keuses", "Buyela emuva ukuze uthole okudumile", "Buya kamva ukuze ufumane ezithandwayo", "Khosela hamorao bakeng sa tse tummeng", "Boela morago bakeng sa tše di tumilego", "Boela morago bakeng sa tse di tumileng", "Vuya endzhaku u kuma swo tsakisa", "Vhuyani nga murahu u wana zwo takadzaho", "Buyela emuva utfole lokudvumile", "Revenez plus tard pour les coups de cœur", "عد لاحقاً للأكثر رواجاً", "Rudi baadaye kwa chaguo moto", "Volte mais tarde para as escolhas em alta", "Vuelve más tarde para la selección del momento"],
  "web.home.noNearest": ["Geen nabygeleë diensverskaffers nie", "Abakho abanikezeli abaseduze", "Abakho abanikezeli abakufutshane", "Ha ho bafani ba haufi", "Ga go na baabi ba kgauswi", "Ga go na baabi ba gaufi", "A ku na vaphakeri va le kusuhi", "A huna vhaphamedi vha tsini", "Abekho baniketi labasedvute", "Aucun prestataire à proximité", "لا يوجد مقدمو خدمة قريبون", "Hakuna watoa huduma karibu", "Sem prestadores próximos", "No hay proveedores cercanos"],
  "web.home.noNearestHint": ["Ons kon nie diensverskaffers naby jou vind nie. Soek volgens stad.", "Asikwazanga ukuthola abanikezeli eduze kwakho. Sesha ngedolobha.", "Asikwazanga ukufumana abanikezeli kufutshane nawe. Khangela ngesixeko.", "Ha rea fumana bafani haufi le uena. Batla ka toropo.", "Ga se ra hwetša baabi kgauswi le wena. Nyaka ka toropo.", "Ga re a fitlhela baabi gaufi le wena. Batla ka toropo.", "A hi kumanga vaphakeri ekusuhi na wena. Lava hi doroba.", "A ro wana vhaphamedi tsini na inwi. Ṱoḓani nga ḓorobo.", "Asikwati kutfola baniketi sedvute nawe. Sesha ngedolobha.", "Nous n’avons pas trouvé de prestataires près de chez vous. Essayez par ville.", "لم نعثر على مقدمي خدمة بالقرب منك. جرّب البحث حسب المدينة.", "Hatukuweza kupata watoa huduma karibu nawe. Tafuta kwa jiji.", "Não encontrámos prestadores perto de si. Tente pesquisar por cidade.", "No encontramos proveedores cerca de ti. Prueba a buscar por ciudad."],
  "web.home.noRising": ["Nog geen nuwe diensverskaffers nie", "Abakabikho abanikezeli abasha", "Abakabikho abanikezeli abatsha", "Ha ho so be le bafani ba bacha", "Ga go eso be le baabi ba bafsa", "Ga go eso nne le baabi ba bašwa", "A ku si va na vaphakeri lavantshwa", "A hu athu u vha na vhaphamedi vhatsva", "Abakabi khona baniketi labasha", "Pas encore de nouveaux prestataires", "لا يوجد مقدمو خدمة جدد بعد", "Bado hakuna watoa huduma wapya", "Ainda sem novos prestadores", "Aún no hay proveedores nuevos"],
  "web.home.noRisingHint": ["Kom later weer vir opkomende sterre", "Buyela emuva ukuze uthole izinkanyezi ezikhuphukayo", "Buya kamva ukuze ufumane iinkwenkwezi ezikhulayo", "Khosela hamorao bakeng sa linaleli tse nyolohang", "Boela morago bakeng sa dinaledi tše di golago", "Boela morago bakeng sa dinaledi tse di golang", "Vuya endzhaku u kuma tinyenyana to tlhandluka", "Vhuyani nga murahu u wana naledzi dzi khou alusa", "Buyela emuva utfole tinkanyeti letikhulako", "Revenez plus tard pour les étoiles montantes", "عد لاحقاً للنجوم الصاعدة", "Rudi baadaye kwa nyota zinazopanda", "Volte mais tarde para as estrelas em ascensão", "Vuelve más tarde para las estrellas emergentes"],
  "web.home.noNearby": ["Geen nabygeleë diensverskaffers nie", "Abakho abanikezeli abaseduze", "Abakho abanikezeli abakufutshane", "Ha ho bafani ba haufi", "Ga go na baabi ba kgauswi", "Ga go na baabi ba gaufi", "A ku na vaphakeri va le kusuhi", "A huna vhaphamedi vha tsini", "Abekho baniketi labasedvute", "Aucun prestataire à proximité", "لا يوجد مقدمو خدمة قريبون", "Hakuna watoa huduma karibu", "Sem prestadores próximos", "No hay proveedores cercanos"],
  "web.home.noNearbyHint": ["Kom later weer vir diensverskaffers naby jou", "Buyela emuva ukuze uthole abanikezeli abaseduze", "Buya kamva ukuze ufumane abanikezeli abakufutshane", "Khosela hamorao bakeng sa bafani ba haufi", "Boela morago bakeng sa baabi ba kgauswi", "Boela morago bakeng sa baabi ba gaufi", "Vuya endzhaku u kuma vaphakeri va le kusuhi", "Vhuyani nga murahu u wana vhaphamedi vha tsini", "Buyela emuva utfole baniketi labasedvute", "Revenez plus tard pour des prestataires près de chez vous", "عد لاحقاً لمقدمي الخدمة القريبين", "Rudi baadaye kwa watoa huduma wa karibu", "Volte mais tarde para prestadores perto de si", "Vuelve más tarde para ver proveedores cerca de ti"],
  "web.home.noCities": ["Geen stede gevind nie", "Awatholakalanga amadolobha", "Azifunyenwanga izixeko", "Ha ho litoropo tse fumanoeng", "Ga go a hwetšwa ditoropo", "Ga go a fitlhelwa ditoropo", "A ku kumeki madoroba", "A zwo waniwi ḓorobo", "Awatfolakali emadolobha", "Aucune ville trouvée", "لم يُعثر على مدن", "Hakuna miji iliyopatikana", "Nenhuma cidade encontrada", "No se encontraron ciudades"],
  "web.home.noCitiesInCountry": ["Geen diensverskaffers in {{country}} gevind nie", "Abakho abanikezeli e-{{country}}", "Abakho abanikezeli e-{{country}}", "Ha ho bafani ba fumanoeng {{country}}", "Ga go na baabi ba hwetšwago {{country}}", "Ga go na baabi ba fitlhelwang {{country}}", "A ku na vaphakeri eka {{country}}", "A huna vhaphamedi kha {{country}}", "Abekho baniketi e-{{country}}", "Aucun prestataire trouvé en {{country}}", "لم يُعثر على مقدمي خدمة في {{country}}", "Hakuna watoa huduma {{country}}", "Nenhum prestador encontrado em {{country}}", "No se encontraron proveedores en {{country}}"],
  "web.home.failedLoadCities": ["Kon nie stede laai nie", "Yehlulekile ukulayisha amadolobha", "Ayiphumelelanga ukulayisha izixeko", "E hlolehile ho kenya litoropo", "E paletšwe ke go tsenya ditoropo", "E paletswe ke go tsenya ditoropo", "Yi tsandzekile ku nghenisa madoroba", "Yo kundelwa u dzhenisa ḓorobo", "Yehlulekile kulayisha emadolobha", "Échec du chargement des villes", "تعذّر تحميل المدن", "Imeshindwa kupakia miji", "Falha ao carregar cidades", "Error al cargar ciudades"],
  "web.home.requestTimedOut": ["Versoek het uitgetel. Probeer asseblief weer.", "Isicelo siphelelwe yisikhathi. Zama futhi.", "Isicelo siphelelwe lixesha. Zama kwakhona.", "Kopo e felile nako. Leka hape.", "Kgopelo e fedile nako. Leka gape.", "Kopo e fedile nako. Leka gape.", "Xikombelo xi hele nkarhi. Ringa nakambe.", "Khumbelo yo fhela tshifhinga. Lingedzani hafhu.", "Sicelo siphelele sikhatsi. Zama futsi.", "La requête a expiré. Veuillez réessayer.", "انتهت مهلة الطلب. حاول مرة أخرى.", "Ombi limeisha muda. Jaribu tena.", "O pedido expirou. Tente novamente.", "La solicitud expiró. Inténtalo de nuevo."],
  "web.home.sortBy": ["Sorteer volgens", "Hlela nge", "Hlela nge", "Hlopha ka", "Hlopha ka", "Rulaganya ka", "Hlela hi", "Rulani nga", "Hlela nge", "Trier par", "ترتيب حسب", "Panga kwa", "Ordenar por", "Ordenar por"],
  "web.home.sortRecommended": ["Aanbeveel", "Okunconywayo", "Okucetyiweyo", "E khothaletsoang", "E elelitšwego", "E e atlegisitsweng", "Leswi bumabumeriwaka", "Zwo eletshedzwa", "Lokunconyiwako", "Recommandé", "موصى به", "Iliyopendekezwa", "Recomendado", "Recomendado"],
  "web.home.sortNearest": ["Naaste", "Okuseduze", "Okukufutshane", "Haufi", "Kgauswi", "Gaufi", "Kusuhi", "Tsini", "Lokusedvute", "Le plus proche", "الأقرب", "Karibu zaidi", "Mais próximo", "Más cercano"],
  "web.home.sortTopRated": ["Topgegradeer", "Okulinganiswe phezulu", "Okulinganiswe phezulu", "Tse holimo", "Tše di swanetšwego", "Tse di tlotlegang", "Leswi pimiweke ehenhla", "Zwo linganywaho ntha", "Lokulinganiswe ngetulu", "Mieux notés", "الأعلى تقييماً", "Vilivyokadiriwa juu", "Mais bem avaliados", "Mejor valorados"],
  "web.home.venueType": ["Pleksoort", "Uhlobo lwendawo", "Uhlobo lwendawo", "Mofuta oa sebaka", "Mohuta wa lefelo", "Mohuta wa lefelo", "Muxaka wa ndhawu", "Lushaka lwa fhethu", "Luhlobo lwendzawo", "Type de lieu", "نوع المكان", "Aina ya eneo", "Tipo de local", "Tipo de local"],
  "web.home.venueEveryone": ["Almal", "Wonke umuntu", "Wonke umntu", "Batho bohle", "Batho ka moka", "Mongwe le mongwe", "Vanhu hinkwavo", "Vhathu vhoṱhe", "Wonkhe umuntfu", "Tout le monde", "الجميع", "Kila mtu", "Toda a gente", "Todos"],
  "web.home.venueFemaleOnly": ["Slegs vroue", "Abesifazane kuphela", "Abasetyhini kuphela", "Basali feela", "Basadi fela", "Basadi fela", "Vavasati ntsena", "Vhafumakadzi fhedzi", "Bafati kuphela", "Femmes uniquement", "نساء فقط", "Wanawake tu", "Apenas mulheres", "Solo mujeres"],
  "web.home.venueMaleOnly": ["Slegs mans", "Abesilisa kuphela", "Amadoda kuphela", "Banna feela", "Banna fela", "Banna fela", "Vanuna ntsena", "Vhanna fhedzi", "Emadvodza kuphela", "Hommes uniquement", "رجال فقط", "Wanaume tu", "Apenas homens", "Solo hombres"],
  "web.home.reviewCount_one": ["{{count}} resensie", "{{count}} isibuyekezo", "{{count}} uphononongo", "{{count}} tlhahlobo", "{{count}} pontšho", "{{count}} tshekatsheko", "{{count}} xitsundzuxo", "{{count}} tsedzuluso", "{{count}} lubuyekezo", "{{count}} avis", "تقييم واحد ({{count}})", "Mapitio {{count}}", "{{count}} avaliação", "{{count}} reseña"],
  "web.home.reviewCount_other": ["{{count}} resensies", "{{count}} izibuyekezo", "{{count}} iimbono", "{{count}} litlhahlobo", "{{count}} dipontšho", "{{count}} ditshekatsheko", "{{count}} switsundzuxo", "{{count}} tsedzuluso", "{{count}} tibuyekezo", "{{count}} avis", "{{count}} تقييمات", "Mapitio {{count}}", "{{count}} avaliações", "{{count}} reseñas"],
  "web.home.distanceKm": ["{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} km", "{{km}} كم", "{{km}} km", "{{km}} km", "{{km}} km"],
  "web.home.country.ZA": ["Suid-Afrika", "iNingizimu Afrika", "uMzantsi Afrika", "Afrika Boroa", "Afrika Borwa", "Aforika Borwa", "Afrika Dzonga", "Afurika Tshipembe", "eNingizimu Afrika", "Afrique du Sud", "جنوب أفريقيا", "Afrika Kusini", "África do Sul", "Sudáfrica"],
  "web.home.country.KE": ["Kenia", "eKenya", "eKenya", "Kenya", "Kenya", "Kenya", "Kenya", "Kenya", "eKenya", "Kenya", "كينيا", "Kenya", "Quénia", "Kenia"],
  "web.home.country.GH": ["Ghana", "eGhana", "eGhana", "Ghana", "Ghana", "Ghana", "Ghana", "Ghana", "eGhana", "Ghana", "غانا", "Ghana", "Gana", "Ghana"],
  "web.home.country.NG": ["Nigerië", "eNigeria", "eNigeria", "Nigeria", "Nigeria", "Nigeria", "Nigeria", "Nigeria", "eNigeria", "Nigéria", "نيجيريا", "Nigeria", "Nigéria", "Nigeria"],
  "web.home.country.EG": ["Egipte", "iGibhithe", "iYiputa", "Egepeta", "Egepeta", "Egepeta", "Egipita", "Egipita", "iGibhithe", "Égypte", "مصر", "Misri", "Egito", "Egipto"],
  "web.cards.topRated": ["Topgegradeer", "Okulinganiswe phezulu", "Okulinganiswe phezulu", "Tse holimo", "Tše di swanetšwego", "Tse di tlotlegang", "Leswi pimiweke ehenhla", "Zwo linganywaho ntha", "Lokulinganiswe ngetulu", "Mieux noté", "الأعلى تقييماً", "Iliyokadiriwa juu", "Mais bem avaliado", "Mejor valorado"],
  "web.cards.hottest": ["Gewildste", "Okudumile", "Okuthandwayo", "E tummeng", "E tumilego", "E e tumileng", "Swo tsakisa", "Zwo takadza", "Lokudvumile", "Populaire", "الأكثر رواجاً", "Moto zaidi", "Em alta", "Más popular"],
  "web.cards.nearest": ["Naaste", "Okuseduze", "Okukufutshane", "Haufi", "Kgauswi", "Gaufi", "Kusuhi", "Tsini", "Lokusedvute", "Le plus proche", "الأقرب", "Karibu zaidi", "Mais próximo", "Más cercano"],
  "web.cards.risingStar": ["Opkomende ster", "Inkanyezi ekhuphukayo", "Inkwenkwezi ekhulayo", "Naleli e nyolohang", "Naledi ye e golago", "Naledi e e golang", "Nyenyana leyi tlhandlukaka", "Naledzi i khou alusa", "Inkanyeti lekhulako", "Étoile montante", "نجم صاعد", "Nyota inayopanda", "Estrela em ascensão", "Estrella emergente"],
  "web.cards.freelancer": ["Vryskut", "Uziqashile", "Uziqashile", "Mosebetsi oa boiketsetso", "Mošomi wa boikemetšo", "Mošomi wa boikemetso", "Mutirhi wo tiendlela", "Mushumi wa u ḓiitela", "Uzitfolile", "Indépendant", "مستقل", "Mfanyakazi huru", "Independente", "Autónomo"],
  "web.cards.houseCalls": ["Huiskroepe", "Ukuvakasha ekhaya", "Ukuvakasha ekhaya", "Ho etela lapeng", "Go etela gae", "Go etela gae", "Ku endzela ekaya", "U dalela hayani", "Kuvakashela ekhaya", "À domicile", "زيارات منزلية", "Huduma nyumbani", "Domicílio", "A domicilio"],
  "web.cards.houseCall": ["Huiskroep", "Ukuvakasha ekhaya", "Ukuvakasha ekhaya", "Ho etela lapeng", "Go etela gae", "Go etela gae", "Ku endzela ekaya", "U dalela hayani", "Kuvakashela ekhaya", "À domicile", "زيارة منزلية", "Huduma nyumbani", "Domicílio", "A domicilio"],
  "web.cards.atSalon": ["By die salon", "Esaloni", "Esaloni", "Saloneng", "Saloneng", "Mo salon", "Eka saloni", "Kha saloni", "Esaloni", "Au salon", "في الصالون", "Saluni", "No salão", "En el salón"],
  "web.cards.sponsored": ["Geborg", "Kuxhaswe", "Kuxhaswe", "E tšehelitsoeng", "E thekgilwego", "E e tshegediwang", "Swo seketeleriwa", "Zwo tikedzwa", "Kwesekelwe", "Sponsorisé", "مموّل", "Imedhaminiwa", "Patrocinado", "Patrocinado"],
  "web.cards.listingBadges": ["Lyskentekens", "Amabheji ohlu", "Iibheji zoluhlu", "Libeche tsa lethathamo", "Dibeche tša lenaneo", "Dibeche tsa lenaane", "Swibeche swa nxaxamelo", "Zwiḇejii zwa mutevhe", "Emabheji eluhlu", "Badges de l’annonce", "شارات الإعلان", "Beji za orodha", "Emblemas do anúncio", "Insignias del anuncio"],
  "web.cards.moreBadges": ["{{count}} kentekens meer", "Amabheji angu-{{count}} engeziwe", "Iibheji ezingama-{{count}} ezongezelelweyo", "Libeche tse {{count}} tse ling", "Dibeche tše {{count}} tše dingwe", "Dibeche di le {{count}} tse dingwe", "Swibeche swa {{count}} swo engetela", "Zwiḇejii zwa {{count}} zwo engedzea", "Emabheji langu-{{count}} langetiwile", "{{count}} badges de plus", "{{count}} شارات إضافية", "Beji {{count}} zaidi", "Mais {{count}} emblemas", "{{count}} insignias más"],
  "web.cards.moreBadgesShort": ["+{{count}} meer", "+{{count}} engeziwe", "+{{count}} ezongezelelweyo", "+{{count}} tse ling", "+{{count}} tše dingwe", "+{{count}} tse dingwe", "+{{count}} swo engetela", "+{{count}} zwo engedzea", "+{{count}} langetiwile", "+{{count}} de plus", "+{{count}} المزيد", "+{{count}} zaidi", "+{{count}} mais", "+{{count}} más"],
  "web.cards.outOf5": ["{{rating}} uit 5", "{{rating}} koku-5", "{{rating}} kwe-5", "{{rating}} ho tse 5", "{{rating}} go tše 5", "{{rating}} mo go 5", "{{rating}} eka 5", "{{rating}} kha 5", "{{rating}} ku-5", "{{rating}} sur 5", "{{rating}} من 5", "{{rating}} kati ya 5", "{{rating}} em 5", "{{rating}} de 5"],
  "web.cards.noReviewsYet": ["Nog geen resensies nie", "Azikho izibuyekezo okwamanje", "Azikho iimbono okwangoku", "Ha ho litlhahlobo hajoale", "Ga go na dipontšho gabjale", "Ga go na ditshekatsheko jaanong", "A ku na switsundzuxo sweswi", "A huna tsedzuluso zwino", "Atekho tibuyekezo okwamanje", "Pas encore d’avis", "لا توجد تقييمات بعد", "Bado hakuna maoni", "Ainda sem avaliações", "Aún no hay reseñas"],
  "web.cards.noReviews": ["Geen resensies nie", "Azikho izibuyekezo", "Azikho iimbono", "Ha ho litlhahlobo", "Ga go na dipontšho", "Ga go na ditshekatsheko", "A ku na switsundzuxo", "A huna tsedzuluso", "Atekho tibuyekezo", "Aucun avis", "لا توجد تقييمات", "Hakuna maoni", "Sem avaliações", "Sin reseñas"],
  "web.cards.reviews": ["{{formatted}} resensies", "{{formatted}} izibuyekezo", "{{formatted}} iimbono", "{{formatted}} litlhahlobo", "{{formatted}} dipontšho", "{{formatted}} ditshekatsheko", "{{formatted}} switsundzuxo", "{{formatted}} tsedzuluso", "{{formatted}} tibuyekezo", "{{formatted}} avis", "{{formatted}} تقييمات", "Maoni {{formatted}}", "{{formatted}} avaliações", "{{formatted}} reseñas"],
  "web.cards.savedWishlist": ["By wenslys gevoeg", "Kugcinwe ohlwini lwezifiso", "Kugcinwe kuluhlu lweminqweno", "E bolokiloe lenaneng la litakatso", "E bolokilwe lenaneong la ditakatšo", "E bolokilwe mo lenaaneng la ditsholofelo", "Swi hlayisiwile eka nxaxamelo wo navela", "Zwo vhewa kha mutevhe wa zwitakalelwa", "Kugcinwe luhlwini lwetifiso", "Ajouté à la liste de souhaits", "تمت الإضافة إلى قائمة الأمنيات", "Imehifadhiwa kwenye orodha ya matakwa", "Guardado na lista de desejos", "Guardado en la lista de deseos"],
  "web.cards.removedWishlist": ["Van wenslys verwyder", "Kususiwe ohlwini lwezifiso", "Kususwe kuluhlu lweminqweno", "E tlositsoe lenaneng la litakatso", "E tlošitšwe lenaneong la ditakatšo", "E tlositswe mo lenaaneng la ditsholofelo", "Swi susiwile eka nxaxamelo wo navela", "Zwo bviswa kha mutevhe wa zwitakalelwa", "Kususwe luhlwini lwetifiso", "Retiré de la liste de souhaits", "تمت الإزالة من قائمة الأمنيات", "Imeondolewa kwenye orodha ya matakwa", "Removido da lista de desejos", "Eliminado de la lista de deseos"],
  "web.cards.wishlistFailed": ["Kon nie wenslys bywerk nie", "Yehlulekile ukuvuselela uhlu lwezifiso", "Ayiphumelelanga ukuhlaziya uluhlu lweminqweno", "E hlolehile ho ntlafatsa lenane la litakatso", "E paletšwe ke go mpshafatša lenaneo la ditakatšo", "E paletswe ke go ntšhwafatsa lenaane la ditsholofelo", "Yi tsandzekile ku pfuxeta nxaxamelo wo navela", "Yo kundelwa u khwinisa mutevhe wa zwitakalelwa", "Yehlulekile kuvuselela luhlu lwetifiso", "Impossible de mettre à jour la liste de souhaits", "تعذّر تحديث قائمة الأمنيات", "Imeshindwa kusasisha orodha ya matakwa", "Falha ao atualizar a lista de desejos", "No se pudo actualizar la lista de deseos"],
  "web.cards.addWishlistA11y": ["Voeg {{name}} by wenslys", "Engeza {{name}} ohlwini lwezifiso", "Yongeza {{name}} kuluhlu lweminqweno", "Kenya {{name}} lenaneng la litakatso", "Tsenya {{name}} lenaneong la ditakatšo", "Tsenya {{name}} mo lenaaneng la ditsholofelo", "Engetela {{name}} eka nxaxamelo wo navela", "Engedza {{name}} kha mutevhe wa zwitakalelwa", "Ngeta {{name}} luhlwini lwetifiso", "Ajouter {{name}} à la liste de souhaits", "إضافة {{name}} إلى قائمة الأمنيات", "Ongeza {{name}} kwenye orodha ya matakwa", "Adicionar {{name}} à lista de desejos", "Añadir {{name}} a la lista de deseos"],
  "web.cards.removeWishlistA11y": ["Verwyder {{name}} van wenslys", "Susa {{name}} ohlwini lwezifiso", "Susa {{name}} kuluhlu lweminqweno", "Tlosa {{name}} lenaneng la litakatso", "Tloša {{name}} lenaneong la ditakatšo", "Tlosa {{name}} mo lenaaneng la ditsholofelo", "Susa {{name}} eka nxaxamelo wo navela", "Bvisa {{name}} kha mutevhe wa zwitakalelwa", "Susa {{name}} luhlwini lwetifiso", "Retirer {{name}} de la liste de souhaits", "إزالة {{name}} من قائمة الأمنيات", "Ondoa {{name}} kwenye orodha ya matakwa", "Remover {{name}} da lista de desejos", "Quitar {{name}} de la lista de deseos"],
  "web.cards.providerFallback": ["Diensverskaffer", "Umnikezeli", "Umnikezeli", "Mofani", "Moabi", "Moabi", "Muphakeri", "Muphamedi", "Mniketi", "Prestataire", "مقدم الخدمة", "Mtoa huduma", "Prestador", "Proveedor"],
  "web.categories.hair": ["Haar", "Izinwele", "Iinwele", "Moriri", "Moriri", "Moriri", "Misisi", "Mavhudzi", "Tinwele", "Cheveux", "الشعر", "Nywele", "Cabelo", "Cabello"],
  "web.categories.nails": ["Naels", "Izinzipho", "Iinzipho", "Manala", "Manala", "Dinala", "Tinsolo", "Nala", "Tinzipho", "Ongles", "الأظافر", "Kucha", "Unhas", "Uñas"],
  "web.categories.braids": ["Vlegsels", "Imiluko", "Imiluko", "Lithapo", "Dithapo", "Ditlhapo", "Tinyokwana", "Nyokwana", "Imiluko", "Tresses", "الضفائر", "Masuka", "Tranças", "Trenzas"],
  "web.categories.makeup": ["Grimeer", "Ukuzilungisa", "I-makeup", "Makeup", "Makeup", "Makeup", "Makeup", "Makeup", "I-makeup", "Maquillage", "المكياج", "Vipodozi", "Maquilhagem", "Maquillaje"],
  "web.categories.massage": ["Massering", "Ukugcoba", "Ukugcoba", "Ho silila", "Go silila", "Go silila", "Ku hlantswa miri", "U silila", "Kugcoba", "Massage", "التدليك", "Massage", "Massagem", "Masaje"],
  "web.categories.dreadlocks": ["Dreadlocks", "Amadreds", "Iidreads", "Dreadlocks", "Dreadlocks", "Dreadlocks", "Dreadlocks", "Dreadlocks", "Emadreads", "Dreadlocks", "الضفائر الأفريقية", "Dreadlocks", "Dreadlocks", "Rastas"],
  "web.categories.brows-lashes": ["Wenkbroue en wimpers", "Izintshi nezinkophe", "Iintshi neenkophe", "Lintši le lithiba-mahlo", "Ditshiu le ditlhai", "Ditshiu le ditlhai", "Tintshwi na swihlanti", "Nnda na milenzhe", "Tintfo netinkophe", "Sourcils et cils", "الحواجب والرموش", "Nyusi na kope", "Sobrancelhas e pestanas", "Cejas y pestañas"],
  "web.categories.natural-hair": ["Natuurlike hare", "Uzinwele zemvelo", "Iinwele zendalo", "Moriri oa tlhaho", "Moriri wa tlhago", "Moriri wa tlholego", "Misisi ya ntumbuluko", "Mavhudzi a mupo", "Tinwele temvelo", "Cheveux naturels", "الشعر الطبيعي", "Nywele asilia", "Cabelo natural", "Cabello natural"],
  "web.categories.wigs-weaves": ["Pruike en weefsels", "Amawig namaweave", "Iiwigi neeweave", "Liwig le liweave", "Diwig le diweave", "Diwig le diweave", "Swiwig na swiweave", "Zwiwig na zwiweave", "Emawig nemaweave", "Perruques et tissages", "الباروكات والوصلات", "Wigi na weave", "Perucas e alongamentos", "Pelucas y extensiones"],
  "web.categories.skin-facials": ["Vel en gesigsbehandelings", "Isikhumba nokwelashwa kobuso", "Ulusu nonyango lobuso", "Letlalo le tšoaro ea sefahleho", "Letlalo le kalafo ya sefahlego", "Letlalo le kalafo ya sefatlhego", "Nhlana na ku tshunguriwa ka xikandza", "Lukanda na u alafha ha tshifhaṱu", "Sikhumba nekunakekela buso", "Soin de la peau et soins du visage", "البشرة والعناية بالوجه", "Ngozi na tiba ya uso", "Pele e tratamentos faciais", "Piel y faciales"],
  "web.categories.hair-removal": ["Haarverwydering", "Ukususa izinwele", "Ukususa iinwele", "Ho tlosa moriri", "Go ntšha moriri", "Go ntsha moriri", "Ku susa misisi", "U bvisa mavhudzi", "Kususwa kwetinwele", "Épilation", "إزالة الشعر", "Kuondoa nywele", "Depilação", "Depilación"],
  "web.categories.barber": ["Barbier", "Umbalisi", "Umchebi", "Setšehi", "Moroki", "Moroki", "Mubarber", "Mubarber", "Umbalisi", "Barbier", "الحلاق", "Kinyozi", "Barbeiro", "Barbero"],
  "web.categories.spa": ["Spa", "I-spa", "I-spa", "Spa", "Spa", "Spa", "Spa", "Spa", "I-spa", "Spa", "السبا", "Spa", "Spa", "Spa"],
  "web.categories.barbering": ["Barbierdienste", "Ukugunda", "Ukucheba", "Ho kuta", "Go kuta", "Go kuta", "Ku tsema misisi", "U kuta", "Kugunda", "Barbier", "الحلاقة", "Unyonyaji", "Barbearia", "Barbería"],
  "web.categories.skincare": ["Velsorg", "Ukunakekela isikhumba", "Ukhathalelo lwesikhumba", "Tlhokomelo ea letlalo", "Tlhokomelo ya letlalo", "Tlhokomelo ya letlalo", "Ku hlayisa nhlana", "U tsireledza lukanda", "Kunakekela sikhumba", "Soin de la peau", "العناية بالبشرة", "Utunzaji wa ngozi", "Cuidados de pele", "Cuidado de la piel"],
  "web.categories.lashes": ["Wimpers", "Izinkophe", "Iinkophe", "Lithiba-mahlo", "Ditlhai", "Ditlhai", "Swihlanti", "Milenzhe", "Tinkophe", "Cils", "الرموش", "Kope", "Pestanas", "Pestañas"],
  "web.categories.body": ["Liggaam", "Umzimba", "Umzimba", "'Mele", "Mmele", "Mmele", "Miri", "Muvhili", "Umzimba", "Corps", "الجسم", "Mwili", "Corpo", "Cuerpo"],
  "web.categories.beauty-services": ["Skoonheidsdienste", "Izinsizakalo zobuhle", "Iinkonzo zobuhle", "Litšebeletso tsa botle", "Ditirelo tša bobotse", "Ditirelo tsa bontle", "Vukorhokeri bya vusweti", "Tshumelo dza vhudele", "Tinsita tebuhle", "Services de beauté", "خدمات التجميل", "Huduma za urembo", "Serviços de beleza", "Servicios de belleza"],
  "web.layout.footer.ios": ["iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS", "iOS"],
  "web.layout.searchProvidersPlaceholder": ["Soek diensverskaffers...", "Sesha abanikezeli...", "Khangela abanikezeli...", "Batla bafani...", "Nyaka baabi...", "Batla baabi...", "Lava vaphakeri...", "Ṱoḓani vhaphamedi...", "Sesha baniketi...", "Rechercher des prestataires...", "ابحث عن مقدمي الخدمة...", "Tafuta watoa huduma...", "Pesquisar prestadores...", "Buscar proveedores..."],
  "web.layout.searchCategoriesPlaceholder": ["Soek kategorieë", "Sesha izigaba", "Khangela iindidi", "Batla lihlopha", "Nyaka dihlopha", "Batla dikarolo", "Lava swiyenge", "Ṱoḓani zwigwada", "Sesha tigaba", "Rechercher des catégories", "ابحث في الفئات", "Tafuta kategoria", "Pesquisar categorias", "Buscar categorías"],
  "web.layout.searchAddressPlaceholder": ["Soek 'n adres...", "Sesha ikheli...", "Khangela idilesi...", "Batla aterese...", "Nyaka aterese...", "Batla aterese...", "Lava adirese...", "Ṱoḓani ḓiresi...", "Sesha likheli...", "Rechercher une adresse...", "ابحث عن عنوان...", "Tafuta anwani...", "Pesquisar um endereço...", "Buscar una dirección..."],
  "web.layout.fromPlaceholder": ["Van", "Kusukela", "Ukususela", "Ho tloha", "Go tloga", "Go tswa", "Ku sukela", "U bva", "Kusukela", "De", "من", "Kutoka", "De", "Desde"],
  "web.layout.toPlaceholder": ["Tot", "Kuya", "Ukuya", "Ho ea", "Go ya", "Go ya", "Ku fika", "U swika", "Kuya", "À", "إلى", "Hadi", "Até", "Hasta"],
  "web.layout.home": ["Tuis", "Ikhaya", "Ikhaya", "Lehae", "Gae", "Gae", "Kaya", "Haya", "Ekhaya", "Accueil", "الرئيسية", "Nyumbani", "Início", "Inicio"],
  "web.layout.explore": ["Verken", "Hlola", "Khangela", "Hlahloba", "Hlahloba", "Tlhatlhoba", "Langutisa", "Sedzani", "Hlola", "Explorer", "استكشف", "Gundua", "Explorar", "Explorar"],
  "web.layout.newBadge": ["Nuut", "Okusha", "Okutsha", "E ncha", "E mpsha", "E ntšha", "Swintshwa", "Zwiswa", "Lokusha", "Nouveau", "جديد", "Mpya", "Novo", "Nuevo"],
  "web.layout.becomePartner": ["Word 'n vennoot", "Yiba uzakwethu", "Yiba liqabane", "E-ba molekane", "E-ba molekane", "Nna molekane", "Va mupfuni", "Vhani muvhambadzi", "Yiba umlingani", "Devenir partenaire", "كن شريكاً", "Kuwa mshirika", "Tornar-se parceiro", "Hazte socio"],
  "web.layout.logInOrSignUp": ["Meld aan of registreer", "Ngena noma bhalisa", "Ngena okanye bhalisa", "Kena kapa ingolisa", "Tsena goba ngwadiša", "Tsena kgotsa ikwadise", "Ngena kumbe tsarisa", "Dzhenani kana ṅwalisa", "Ngena noma bhalisa", "Se connecter ou s’inscrire", "تسجيل الدخول أو إنشاء حساب", "Ingia au jisajili", "Iniciar sessão ou registar-se", "Inicia sesión o regístrate"],
  "web.layout.accessAccountHint": ["Kry toegang tot jou rekening om adresse te stoor en besprekings te bestuur", "Fina i-akhawunti yakho ukuze ulondoloze amakheli futhi uphathe ukubhuka", "Fumana iakhawunti yakho ukuze ugcine iidilesi kwaye ulawule ukubhukisha", "Fumana akhaonto ea hao ho boloka liaterese le ho laola libuka", "Fihlella akhauute ya gago go boloka diaterese le go laola dipukiso", "Fithlela akhauunte ya gago go boloka diaterese le go laola dipukiso", "Fikelela eka akhawunti ya wena ku hlayisa tiadirese no lawula ku buka", "Swikani akhaunte yaṋu u vhea ḓiresi na u langa u buka", "Fumana li-akhawunti yakho kugcina emakheli nekuphatsa kubhuka", "Accédez à votre compte pour enregistrer des adresses et gérer vos réservations", "ادخل إلى حسابك لحفظ العناوين وإدارة الحجوزات", "Fikia akaunti yako kuhifadhi anwani na kudhibiti nafasi", "Aceda à sua conta para guardar moradas e gerir marcações", "Accede a tu cuenta para guardar direcciones y gestionar reservas"],
  "web.layout.footer.forBusiness": ["Vir besigheid", "Ngebhizinisi", "Ngeshishini", "Bakeng sa khoebo", "Bakeng sa kgwebo", "Bakeng sa kgwebo", "Hi bindzu", "Nga mabindu", "Ngebhizinisi", "Pour les entreprises", "للأعمال", "Kwa biashara", "Para empresas", "Para empresas"],
  "web.layout.footer.legal": ["Regsaspekte", "Ezomthetho", "Ezasemthethweni", "Molao", "Molao", "Molao", "Nawu", "Mulayo", "Nemtsetfosisekelo", "Mentions légales", "قانوني", "Kisheria", "Jurídico", "Legal"],
  "web.layout.footer.findUsOnSocial": ["Vind ons op sosiale media:", "Sithole ezinkundleni zokuxhumana:", "Sifumane kwiindawo zokunxibelelana:", "Re fumane mechaeng ea sechaba:", "Re hwetše mekgatlong ya leago:", "Re fitlhele mo mekgatlheng ya loago:", "Hi kuma eka switshaho swa vanhu:", "Ri wane kha zwiṱanganyelo zwa vhathu:", "Sitfole etinkundleni tekuchumana:", "Retrouvez-nous sur les réseaux :", "تجدنا على وسائل التواصل:", "Tupate kwenye mitandao ya kijamii:", "Encontre-nos nas redes:", "Encuéntranos en redes:"],
  "web.layout.footer.copyright": ["© 2024 Beautonomi. Alle regte voorbehou.", "© 2024 Beautonomi. Wonke amalungelo agodliwe.", "© 2024 Beautonomi. Onke amalungelo agciniwe.", "© 2024 Beautonomi. Litokelo tsohle li sirelelitsoe.", "© 2024 Beautonomi. Ditokelo ka moka di šireleditšwe.", "© 2024 Beautonomi. Ditshwanelo tsotlhe di sireleditswe.", "© 2024 Beautonomi. Timfanelo hinkwato ti sirheleriwile.", "© 2024 Beautonomi. Pfanelo dzoṱhe dzo tsireledzwa.", "© 2024 Beautonomi. Onkhe emalungelo agodliwe.", "© 2024 Beautonomi. Tous droits réservés.", "© 2024 Beautonomi. جميع الحقوق محفوظة.", "© 2024 Beautonomi. Haki zote zimehifadhiwa.", "© 2024 Beautonomi. Todos os direitos reservados.", "© 2024 Beautonomi. Todos los derechos reservados."],
  "web.layout.footer.sitemap": ["Werfkaart", "Imephu yesayithi", "Imephu yesayithi", "Mmepe oa sebaka", "Mmepe wa wepesaete", "Mmepe wa wepesaete", "Mmepe wa sayiti", "Mmepe wa saiti", "Imephu yesayithi", "Plan du site", "خريطة الموقع", "Ramani ya tovuti", "Mapa do site", "Mapa del sitio"],
  "web.layout.footer.learningCenter": ["Leersentrum", "Isikhungo sokufunda", "Iziko lokufunda", "Setsi sa thuto", "Setšhaba sa thuto", "Setheo sa thuto", "Ndhawu yo dyondza", "Fhethu ha u guda", "Sikhungo sekufundza", "Centre d’apprentissage", "مركز التعلّم", "Kituo cha kujifunza", "Centro de aprendizagem", "Centro de aprendizaje"],
  "web.layout.footer.android": ["Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android", "Android"],
  "web.layout.footer.aboutBeautonomi": ["Meer oor Beautonomi", "Mayelana ne-Beautonomi", "Malunga ne-Beautonomi", "Mabapi le Beautonomi", "Mabapi le Beautonomi", "Kaga Beautonomi", "Hi Beautonomi", "Nga ha Beautonomi", "NgeBeautonomi", "À propos de Beautonomi", "حول Beautonomi", "Kuhusu Beautonomi", "Sobre a Beautonomi", "Acerca de Beautonomi"],
  "web.layout.header.detectingLocation": ["Bepaal ligging...", "Ithola indawo...", "Ifumana indawo...", "E fumana sebaka...", "E hwetša lefelo...", "E batla lefelo...", "Yi kuma ndhawu...", "I khou wana fhethu...", "Itfola indzawo...", "Détection de l’emplacement...", "جارٍ تحديد الموقع...", "Inatafuta eneo...", "A detetar localização...", "Detectando ubicación..."],
  "web.layout.header.currentLocation": ["Huidige ligging", "Indawo yamanje", "Indawo yangoku", "Sebaka sa hona joale", "Lefelo la gabjale", "Lefelo la gajaana", "Ndhawu ya sweswi", "Fhethu ha zwino", "Indzawo yanyalo", "Emplacement actuel", "الموقع الحالي", "Eneo la sasa", "Localização atual", "Ubicación actual"],
  "web.layout.header.toastGeolocationUnsupported": ["Jou blaaier ondersteun nie geoligging nie", "Isiphequluli sakho asisekeli ukutholwa kwendawo", "Isikhangeli sakho asixhasi indawo", "Sephepuli sa hao ha se tšehetse sebaka", "Sephequluli sa gago ga se thekge lefelo", "Sephequluli sa gago ga se tshegetse lefelo", "Xiphequluli xa wena a xi seketeli ndhawu", "Tshiṱaluli tshau a tshi tikedzi fhethu", "Siphequluli sakho asisekeli indzawo", "Votre navigateur ne prend pas en charge la géolocalisation", "متصفحك لا يدعم تحديد الموقع", "Kivinjari chako hakiungi mkono eneo", "O seu navegador não suporta geolocalização", "Tu navegador no admite geolocalización"],
  "web.layout.header.toastLocationUpdated": ["Ligging is bygewerk", "Indawo ibuyekeziwe", "Indawo ihlaziyiwe", "Sebaka se ntlafalitsoe", "Lefelo le mpshafaditšwe", "Lefelo le ntšhwafaditswe", "Ndhawu yi pfuxetiwile", "Fhethu ho khwiniswa", "Indzawo ibuyeketiwe", "Emplacement mis à jour", "تم تحديث الموقع", "Eneo limesasishwa", "Localização atualizada", "Ubicación actualizada"],
  "web.layout.header.toastLocationPermissionDenied": ["Kon nie jou ligging kry nie. Aktiveer asseblief liggingtoestemming.", "Ayikwazanga ukuthola indawo yakho. Vumela imvume yendawo.", "Ayikwazanga ukufumana indawo yakho. Vumela iimvume zendawo.", "Ha e khone ho fumana sebaka sa hao. Lumella tumello ea sebaka.", "Ga e kgone go hwetša lefelo la gago. Dumelela tumelelo ya lefelo.", "Ga e kgone go fitlhela lefelo la gago. Dumelela tetla ya lefelo.", "A yi koti ku kuma ndhawu ya wena. Pfumelela mpfumelelo wa ndhawu.", "A i koni u wana fhethu haṋu. Tendani thendelo ya fhethu.", "Ayikwati kutfola indzawo yakho. Vumela imvume yendzawo.", "Impossible d’obtenir votre position. Activez l’autorisation de localisation.", "تعذّر الحصول على موقعك. يُرجى تفعيل إذن الموقع.", "Imeshindwa kupata eneo lako. Washa ruhusa ya eneo.", "Não foi possível obter a sua localização. Ative as permissões de localização.", "No se pudo obtener tu ubicación. Activa los permisos de ubicación."],
  "web.layout.header.providerBannerTitle": ["Jy is aangemeld as 'n diensverskaffer", "Ungene njengomnikezeli", "Ungene njengomnikezeli", "U kene e le mofani", "O tsene e le moabi", "O tsene e le moabi", "U ngene tanihi muphakeri", "No dzhena sa muphamedi", "Ungene njengemniketi", "Vous êtes connecté en tant que prestataire", "أنت مسجّل الدخول كمقدم خدمة", "Umeingia kama mtoa huduma", "Sessão iniciada como prestador", "Has iniciado sesión como proveedor"],
  "web.layout.header.providerBannerBody": ["Jy kyk na die kliëntmarkplek. Bestuur besprekings, veldtogte en jou besigheid vanaf die diensverskafferportaal.", "Ubuka imakethe yamakhasimende. Phatha ukubhuka, imikhankaso nebhizinisi lakho kuphothali yomnikezeli.", "Ujonge imarike yabathengi. Lawula ukubhukisha, amaphulo neshishini lakho kwipothali yomnikezeli.", "U shebile 'maraka oa bareki. Laola libuka, matšolo le khoebo ea hao ho tsoa ho portal ea mofani.", "O lebelela mmaraka wa bareki. Laola dipukiso, matšolo le kgwebo ya gago go tšwa portal ya moabi.", "O leba mmaraka wa bareki. Laola dipukiso, matšolo le kgwebo ya gago go tswa portal ya moabi.", "U langutela makete wa vakhandziyi. Lawula ku buka, minkavelo ni bindzu ra wena eka portal ya muphakeri.", "Ni khou sedza makete wa vharengi. Langani u buka, milayo na mabindu aṋu kha portal ya muphamedi.", "Ubuka imakethe yemakhasimende. Phatsa kubhuka, imikhankaso nebhizinisi yakho kuphothali yemniketi.", "Vous consultez le marché client. Gérez réservations, campagnes et activité depuis le portail prestataire.", "أنت تعرض سوق العملاء. أدِر الحجوزات والحملات وعملك من بوابة مقدم الخدمة.", "Unaangalia soko la wateja. Dhibiti nafasi, kampeni na biashara yako kutoka kwa lango la mtoa huduma.", "Está a ver o mercado de clientes. Gira marcações, campanhas e o negócio no portal do prestador.", "Estás viendo el mercado de clientes. Gestiona reservas, campañas y tu negocio desde el portal del proveedor."],
  "web.layout.header.managePaidAds": ["Bestuur betaalde advertensies", "Phatha izikhangiso ezikhokhelwayo", "Lawula iintengiso ezihlawulwayo", "Laola lipapatso tse lefuoang", "Laola dipapatšo tše di lefelwago", "Laola dipapatso tse di duelwang", "Lawula swikhangelo leswi hakeriwaka", "Langani khangiso dzo badelwaho", "Phatsa tikhangiso letikhokhelwako", "Gérer les publicités payantes", "إدارة الإعلانات المدفوعة", "Dhibiti matangazo yanayolipiwa", "Gerir anúncios pagos", "Gestionar anuncios de pago"],
  "web.layout.header.returnToDashboard": ["Terug na dashboard", "Buyela kudeshibhodi", "Buyela kwideshibhodi", "Khutlela ho dashboard", "Boela dashboard", "Boela dashboard", "Tlhelela eka dashboard", "Vhuyelani kha dashboard", "Buyela kudeshibhodi", "Retour au tableau de bord", "العودة إلى لوحة التحكم", "Rudi kwenye dashibodi", "Voltar ao painel", "Volver al panel"],
  "web.layout.header.checkingAvailability": ["Kontroleer beskikbaarheid...", "Ihlola ukutholakala...", "Ihlola ukufumaneka...", "E hlahloba ho fumaneha...", "E hlahloba go hwetšagala...", "E tlhatlhoba go nna teng...", "Yi kambela ku kumeka...", "I khou sedzulusa u wanala...", "Ihlola kutfolakala...", "Vérification de la disponibilité...", "جارٍ التحقق من التوفر...", "Inakagua upatikanaji...", "A verificar disponibilidade...", "Comprobando disponibilidad..."],
  "web.layout.header.servicesAvailable": ["Dienste beskikbaar", "Izinsizakalo ziyatholakala", "Iinkonzo ziyafumaneka", "Litšebeletso lia fumaneha", "Ditirelo di a hwetšagala", "Ditirelo di a nna teng", "Vukorhokeri bya kumeka", "Tshumelo dzi a wanala", "Tinsita tiyatfolakala", "Services disponibles", "الخدمات متاحة", "Huduma zinapatikana", "Serviços disponíveis", "Servicios disponibles"],
  "web.layout.header.limitedAvailability": ["Beperkte beskikbaarheid", "Ukutholakala okulinganiselwe", "Ukufumaneka okulinganiselweyo", "Ho fumaneha ho fokolang", "Go hwetšagala go nnyane", "Go nna teng go lekanyeditsweng", "Ku kumeka lokutsongo", "U wanala ho linganyiwaho", "Kutfolakala lokulinganiselwe", "Disponibilité limitée", "توفر محدود", "Upatikanaji mdogo", "Disponibilidade limitada", "Disponibilidad limitada"],
  "web.layout.header.gettingLocation": ["Kry ligging...", "Ithola indawo...", "Ifumana indawo...", "E fumana sebaka...", "E hwetša lefelo...", "E batla lefelo...", "Yi kuma ndhawu...", "I khou wana fhethu...", "Itfola indzawo...", "Récupération de l’emplacement...", "جارٍ جلب الموقع...", "Inapata eneo...", "A obter localização...", "Obteniendo ubicación..."],
  "web.layout.header.quickAccess": ["Vinnige toegang", "Ukufinyelela okusheshayo", "Ufikelelo olukhawulezayo", "Phihlello e potlakileng", "Phihlelelo ya potlako", "Phihlelelo e e potlaka", "Ku fikelela hi ku hatlisa", "U swikelela nga u tavhanya", "Kufinyelela lokusheshako", "Accès rapide", "وصول سريع", "Ufikiaji wa haraka", "Acesso rápido", "Acceso rápido"],
  "web.layout.header.work": ["Werk", "Umsebenzi", "Umsebenzi", "Mosebetsi", "Mošomo", "Tiro", "Ntirho", "Mushumo", "Umsebenzi", "Travail", "العمل", "Kazini", "Trabalho", "Trabajo"],
  "web.layout.header.recentLocations": ["Onlangse liggings", "Izindawo zakamuva", "Iindawo zakutsha nje", "Libaka tsa morao-rao", "Mafelo a morago bjale", "Mafelo a morago", "Tindhawu ta sweswinyana", "Fhethu ha zwino-zwino", "Tindzawo takamuva", "Lieux récents", "المواقع الأخيرة", "Maeneo ya hivi karibuni", "Localizações recentes", "Ubicaciones recientes"],
  "web.layout.header.savedAddresses": ["Gestoorde adresse", "Amakheli alondoloziwe", "Iidilesi ezigciniweyo", "Liaterese tse bolokiloeng", "Diaterese tše di bolokilwego", "Diaterese tse di bolokilweng", "Tiadirese leti hlayisiweke", "Ḓiresi dzo vhewa", "Emakheli lagciniwe", "Adresses enregistrées", "العناوين المحفوظة", "Anwani zilizohifadhiwa", "Moradas guardadas", "Direcciones guardadas"],
  "web.layout.header.helpCentre": ["Hulpsentrum", "Isikhungo sosizo", "Iziko loncedo", "Setsi sa thuso", "Setšhaba sa thušo", "Setheo sa thuso", "Ndhawu yo pfuniwa", "Fhethu ha thuso", "Sikhungo selusito", "Centre d’aide", "مركز المساعدة", "Kituo cha usaidizi", "Centro de ajuda", "Centro de ayuda"],
  "web.layout.header.learningCenter": ["Leersentrum", "Isikhungo sokufunda", "Iziko lokufunda", "Setsi sa thuto", "Setšhaba sa thuto", "Setheo sa thuto", "Ndhawu yo dyondza", "Fhethu ha u guda", "Sikhungo sekufundza", "Centre d’apprentissage", "مركز التعلّم", "Kituo cha kujifunza", "Centro de aprendizagem", "Centro de aprendizaje"],
  "web.layout.header.dashboard": ["Dashboard", "Ideshibhodi", "Ideshibhodi", "Dashboard", "Dashboard", "Dashboard", "Dashboard", "Dashboard", "Ideshibhodi", "Tableau de bord", "لوحة التحكم", "Dashibodi", "Painel", "Panel"],
  "web.layout.header.profileAndAccount": ["Profiel en rekening", "Iphrofayela ne-akhawunti", "Iprofayile neakhawunti", "Profaele le akhaonto", "Profaele le akhauute", "Profaele le akhauunte", "Phurofayili na akhawunti", "Phurofaily na akhaunte", "Iphrofayela neli-akhawunti", "Profil et compte", "الملف والحساب", "Wasifu na akaunti", "Perfil e conta", "Perfil y cuenta"],
  "web.layout.header.noSuggestions": ["Geen voorstelle gevind nie", "Awekho amacebo atholiwe", "Azikho iingcebiso ezifunyenweyo", "Ha ho litlhahiso tse fumanoeng", "Ga go na ditšhišinyo tše di hwetšwago", "Ga go na ditshitshinyo tse di fitlhelwang", "A ku na swibumabumelo leswi kumiweke", "A huna zwelelo zwo waniwaho", "Awekho emacebo latfolakele", "Aucune suggestion trouvée", "لم يُعثر على اقتراحات", "Hakuna mapendekezo yaliyopatikana", "Nenhuma sugestão encontrada", "No se encontraron sugerencias"],
  "web.layout.navbar.becomePartner": ["Word 'n vennoot", "Yiba uzakwethu", "Yiba liqabane", "E-ba molekane", "E-ba molekane", "Nna molekane", "Va mupfuni", "Vhani muvhambadzi", "Yiba umlingani", "Devenir partenaire", "كن شريكاً", "Kuwa mshirika", "Tornar-se parceiro", "Hazte socio"],
  "web.layout.navbar.logIn": ["Meld aan", "Ngena", "Ngena", "Kena", "Tsena", "Tsena", "Ngena", "Dzhenani", "Ngena", "Se connecter", "تسجيل الدخول", "Ingia", "Iniciar sessão", "Iniciar sesión"],
  "web.layout.navbar.signUp": ["Registreer", "Bhalisa", "Bhalisa", "Ingolisa", "Ngwadiša", "Ikwadise", "Tsarisa", "Ṅwalisani", "Bhalisa", "S’inscrire", "إنشاء حساب", "Jisajili", "Registar-se", "Regístrate"],
  "web.layout.navbar.menu": ["Kieslys", "Imenyu", "Imenyu", "Lenane", "Menu", "Menu", "Menyu", "Menu", "Imenyu", "Menu", "القائمة", "Menyu", "Menu", "Menú"],
  "web.layout.navbar.shopProducts": ["Koop produkte", "Thenga imikhiqizo", "Thenga iimveliso", "Reka lihlahisoa", "Reka ditšweletšwa", "Reka ditshwantsho", "Xava swihlovo", "Rengani zwibveledzwa", "Tsenga timikhicizo", "Acheter des produits", "تسوق المنتجات", "Nunua bidhaa", "Comprar produtos", "Comprar productos"],
  "web.layout.navbar.myCart": ["My mandjie", "Inqola yami", "Inqwelo yam", "Kariki ea ka", "Koloi yaka", "Koloi yame", "Ngola ya mina", "Ngola yanga", "Inqola yami", "Mon panier", "سلتي", "Kikapu changu", "O meu carrinho", "Mi carrito"],
  "web.layout.navbar.cart": ["Mandjie", "Inqola", "Inqwelo", "Kariki", "Koloi", "Koloi", "Ngola", "Ngola", "Inqola", "Panier", "السلة", "Kikapu", "Carrinho", "Carrito"],
  "web.layout.navbar.bookings": ["Besprekings", "Ukubhuka", "Ukubhukisha", "Libuka", "Dipukiso", "Dipukiso", "Ku buka", "U buka", "Kubhuka", "Réservations", "الحجوزات", "Nafasi", "Marcações", "Reservas"],
  "web.layout.navbar.search": ["Soek", "Sesha", "Khangela", "Batla", "Nyaka", "Batla", "Lava", "Ṱoḓani", "Sesha", "Rechercher", "بحث", "Tafuta", "Pesquisar", "Buscar"],
  "web.layout.landingNavbar.becomePartner": ["Word 'n vennoot", "Yiba uzakwethu", "Yiba liqabane", "E-ba molekane", "E-ba molekane", "Nna molekane", "Va mupfuni", "Vhani muvhambadzi", "Yiba umlingani", "Devenir partenaire", "كن شريكاً", "Kuwa mshirika", "Tornar-se parceiro", "Hazte socio"],
  "web.layout.landingNavbar.signIn": ["Meld aan", "Ngena", "Ngena", "Kena", "Tsena", "Tsena", "Ngena", "Dzhenani", "Ngena", "Se connecter", "تسجيل الدخول", "Ingia", "Iniciar sessão", "Iniciar sesión"],
  "web.layout.landingNavbar.signOut": ["Meld af", "Phuma", "Phuma", "Tsoa", "Tšwa", "Tswa", "Huma", "Bva", "Phuma", "Se déconnecter", "تسجيل الخروج", "Toka", "Terminar sessão", "Cerrar sesión"],
  "web.layout.landingNavbar.helpCenter": ["Hulpsentrum", "Isikhungo sosizo", "Iziko loncedo", "Setsi sa thuso", "Setšhaba sa thušo", "Setheo sa thuso", "Ndhawu yo pfuniwa", "Fhethu ha thuso", "Sikhungo selusito", "Centre d’aide", "مركز المساعدة", "Kituo cha usaidizi", "Centro de ajuda", "Centro de ayuda"],
  "web.layout.landingNavbar.menu": ["Kieslys", "Imenyu", "Imenyu", "Lenane", "Menu", "Menu", "Menyu", "Menu", "Imenyu", "Menu", "القائمة", "Menyu", "Menu", "Menú"],
  "web.layout.mobileSearch.searchServices": ["Soek dienste", "Sesha izinsizakalo", "Khangela iinkonzo", "Batla litšebeletso", "Nyaka ditirelo", "Batla ditirelo", "Lava vukorhokeri", "Ṱoḓani tshumelo", "Sesha tinsita", "Rechercher des services", "ابحث عن الخدمات", "Tafuta huduma", "Pesquisar serviços", "Buscar servicios"],
  "web.layout.mobileSearch.where": ["Waar", "Kuphi", "Phi", "Kae", "Kae", "Kae", "Kwihi", "Ngafhi", "Kuphi", "Où", "أين", "Wapi", "Onde", "Dónde"],
  "web.layout.mobileSearch.when": ["Wanneer", "Nini", "Nini", "Neng", "Neng", "Neng", "Rini", "Lini", "Nini", "Quand", "متى", "Lini", "Quando", "Cuándo"],
  "web.layout.mobileSearch.anyTime": ["Enige tyd", "Noma nini", "Naliphi na ixesha", "Nako efe kapa efe", "Nako efe goba efe", "Nako nngwe le nngwe", "Nkarhi wihi na wihi", "Tshifhinga tshiṅwe na tshiṅwe", "Noma nini", "N’importe quand", "أي وقت", "Wakati wowote", "Qualquer hora", "Cualquier momento"],
  "web.layout.mobileSearch.search": ["Soek", "Sesha", "Khangela", "Batla", "Nyaka", "Batla", "Lava", "Ṱoḓani", "Sesha", "Rechercher", "بحث", "Tafuta", "Pesquisar", "Buscar"],
  "web.layout.mobileSearch.anywhere": ["Enige plek", "Noma yikuphi", "Naphi na", "Kae kapa kae", "Kae goba kae", "Kae kapa kae", "Ndhawu yihi na yihi", "Fhethu huṅwe na huṅwe", "Noma kuphi", "N’importe où", "أي مكان", "Mahali popote", "Qualquer lugar", "Cualquier lugar"],
  "web.layout.mobileSearch.topCategories": ["Topkategorieë", "Izigaba eziphezulu", "Iindidi eziphezulu", "Lihlopha tse holimo", "Dihlopha tše di holimo", "Dikarolo tse di kwa godimo", "Swiyenge swa le henhla", "Zwigwada zwa ntha", "Tigaba letiphezulu", "Catégories populaires", "أبرز الفئات", "Kategoria kuu", "Categorias principais", "Categorías principales"],
  "web.layout.mobileSearch.categories.hairStyling": ["Haar en styl", "Izinwele nokuhlela", "Iinwele nesitayile", "Moriri le setaele", "Moriri le setaele", "Moriri le setaele", "Misisi na xitayela", "Mavhudzi na sitayele", "Tinwele nesitayela", "Cheveux et coiffure", "الشعر والتسريح", "Nywele na mtindo", "Cabelo e styling", "Cabello y peinado"],
  "web.layout.mobileSearch.categories.nails": ["Naels", "Izinzipho", "Iinzipho", "Manala", "Manala", "Dinala", "Tinsolo", "Nala", "Tinzipho", "Ongles", "الأظافر", "Kucha", "Unhas", "Uñas"],
  "web.layout.mobileSearch.categories.eyebrowsEyelashes": ["Wenkbroue en wimpers", "Izintshi nezinkophe", "Iintshi neenkophe", "Lintši le lithiba-mahlo", "Ditshiu le ditlhai", "Ditshiu le ditlhai", "Tintshwi na swihlanti", "Nnda na milenzhe", "Tintfo netinkophe", "Sourcils et cils", "الحواجب والرموش", "Nyusi na kope", "Sobrancelhas e pestanas", "Cejas y pestañas"],
  "web.layout.mobileSearch.categories.massage": ["Massering", "Ukugcoba", "Ukugcoba", "Ho silila", "Go silila", "Go silila", "Ku hlantswa miri", "U silila", "Kugcoba", "Massage", "التدليك", "Massage", "Massagem", "Masaje"],
  "web.layout.mobileSearch.categories.barbering": ["Barbierdienste", "Ukugunda", "Ukucheba", "Ho kuta", "Go kuta", "Go kuta", "Ku tsema misisi", "U kuta", "Kugunda", "Barbier", "الحلاقة", "Unyonyaji", "Barbearia", "Barbería"],
  "web.preferences.suggested": ["Voorgestelde tale", "Izilimi ezinconywayo", "Iilwimi ezicetyiweyo", "Lipuo tse khothaletsoang", "Maleme ao a elelitšwego", "Dipuo tse di atlegisitsweng", "Tindzimi leti bumabumeriwaka", "Nyambo dzo eletshedzwa", "Tilwimi letinconyiwako", "Langues suggérées", "اللغات المقترحة", "Lugha zinazopendekezwa", "Idiomas sugeridos", "Idiomas sugeridos"],
  "web.preferences.chooseLanguage": ["Kies 'n taal", "Khetha ulimi", "Khetha ulwimi", "Khetha puo", "Kgetha leleme", "Tlhopha puo", "Hlawula ririmi", "Khethani luambo", "Khetsa lulwimi", "Choisir une langue", "اختر لغة", "Chagua lugha", "Escolher um idioma", "Elige un idioma"],
  "web.preferences.chooseCurrency": ["Kies 'n geldeenheid", "Khetha imali", "Khetha imali", "Khetha chelete", "Kgetha tšhelete", "Tlhopha madi", "Hlawula mali", "Khethani tshelede", "Khetsa imali", "Choisir une devise", "اختر عملة", "Chagua sarafu", "Escolher uma moeda", "Elige una moneda"],
  "web.preferences.chooseRegion": ["Kies 'n streek", "Khetha isifunda", "Khetha ingingqi", "Khetha sebaka", "Kgetha selete", "Tlhopha kgaolo", "Hlawula xifundza", "Khethani tshiṱiriki", "Khetsa sifundza", "Choisir une région", "اختر منطقة", "Chagua eneo", "Escolher uma região", "Elige una región"],
  "web.preferences.searchCurrencies": ["Soek geldeenhede", "Sesha izimali", "Khangela iimali", "Batla lichelete", "Nyaka ditšhelete", "Batla madi", "Lava timali", "Ṱoḓani tshelede", "Sesha timali", "Rechercher des devises", "ابحث عن العملات", "Tafuta sarafu", "Pesquisar moedas", "Buscar monedas"],
  "web.preferences.translationNote": ["Sommige diensverskaffernname, resensies en lysbesonderhede kan in hul oorspronklike taal bly.", "Amanye amagama abanikezeli, izibuyekezo nemininingwane yohlu angahlala ngolimi lwawo lwasekuqaleni.", "Amanye amagama abanikezeli, iimbono neenkcukacha zoluhlu zinokuhlala ngolwimi lwazo lwasekuqaleni.", "Mabitso a bang a bafani, litlhahlobo le lintlha tsa lethathamo li ka sala ka puo ea tsona ea pele.", "Maina a bangwe a baabi, dipontšho le dintlha tša lenaneo di ka sala ka leleme la tšona la mathomo.", "Maina a bangwe a baabi, ditshekatsheko le dintlha tsa lenaane di ka sala ka puo ya tsona ya ntlha.", "Mavito man’wana ya vaphakeri, switsundzuxo ni vuxokoxoko bya nxaxamelo swi nga sala hi ririmi ra kona ro sungula.", "Madzina maṅwe a vhaphamedi, tsedzuluso na zwidodombedzwa zwa mutevhe zwi nga sala nga luambo lwa u thoma.", "Lamanye emagama ebaniketi, tibuyekezo nemininingwane yeluhlu angahlala ngelulwimi lwawo lwekucala.", "Certains noms de prestataires, avis et détails d’annonce peuvent rester dans leur langue d’origine.", "قد تبقى بعض أسماء مقدمي الخدمة والتقييمات وتفاصيل الإعلانات بلغتها الأصلية.", "Baadhi ya majina ya watoa huduma, maoni na maelezo ya orodha yanaweza kubaki katika lugha yao asilia.", "Alguns nomes de prestadores, avaliações e detalhes do anúncio podem permanecer no idioma original.", "Algunos nombres de proveedores, reseñas y detalles del anuncio pueden permanecer en su idioma original."],
  "web.preferences.title": ["Taal en geldeenheid", "Ulimi nemali", "Ulwimi nemali", "Puo le chelete", "Lelome le tšhelete", "Puo le madi", "Ririmi na mali", "Luambo na tshelede", "Lulwimi nemali", "Langue et devise", "اللغة والعملة", "Lugha na sarafu", "Idioma e moeda", "Idioma y moneda"],
  "web.preferences.languageTab": ["Taal", "Ulimi", "Ulwimi", "Puo", "Lelome", "Puo", "Ririmi", "Luambo", "Lulwimi", "Langue", "اللغة", "Lugha", "Idioma", "Idioma"],
  "web.preferences.currencyTab": ["Vertoongeldeenheid", "Imali yokubuka", "Imali yokubonisa", "Chelete ea pontšo", "Tšhelete ya go bontšha", "Madi a pontsho", "Mali yo kombisa", "Tshelede ya u sumbedza", "Imali yekubuka", "Devise d’affichage", "عملة العرض", "Sarafu ya kuonyesha", "Moeda de visualização", "Moneda de visualización"],
  "web.preferences.regionTab": ["Streek", "Isifunda", "Ingingqi", "Sebaka", "Selete", "Kgaolo", "Xifundza", "Tshiṱiriki", "Sifundza", "Région", "المنطقة", "Eneo", "Região", "Región"],
  "web.preferences.searchLanguages": ["Soek tale", "Sesha izilimi", "Khangela iilwimi", "Batla lipuo", "Nyaka maleme", "Batla dipuo", "Lava tindzimi", "Ṱoḓani nyambo", "Sesha tilwimi", "Rechercher des langues", "ابحث عن اللغات", "Tafuta lugha", "Pesquisar idiomas", "Buscar idiomas"],
  "web.preferences.currencyScope": ["Pryse word in {{display}} gewys. Jy betaal in {{charge}} by afhandeling.", "Amanani aboniswa ngo-{{display}}. Ukhokha ngo-{{charge}} ekuphothuleni.", "Amaxabiso aboniswa nge-{{display}}. Uhlawula nge-{{charge}} ekupheleni.", "Litheko li bontšoa ka {{display}}. U lefa ka {{charge}} ha u qeta.", "Ditheko di bontšhwa ka {{display}}. O lefa ka {{charge}} ge o fetša.", "Ditheko di bontshiwa ka {{display}}. O duela ka {{charge}} fa o fetsa.", "Mintengo yi kombisiwa hi {{display}}. U hakela hi {{charge}} loko u hetisa.", "Mitengo i khou sumbedzwa nga {{display}}. Ni badela nga {{charge}} musi ni fhedza.", "Ematinyo aboniswa nge-{{display}}. Ukhokha nge-{{charge}} ekuphothuleni.", "Les prix s’affichent en {{display}}. Vous payez en {{charge}} au paiement.", "تُعرض الأسعار بـ {{display}}. وتدفع بـ {{charge}} عند الدفع.", "Bei zinaonyeshwa kwa {{display}}. Unalipa kwa {{charge}} unapolipa.", "Os preços são mostrados em {{display}}. Paga em {{charge}} no checkout.", "Los precios se muestran en {{display}}. Pagas en {{charge}} al finalizar."],
  "web.layout.footer.links.about": ["Oor", "Mayelana", "Malunga", "Mabapi", "Mabapi", "Kaga", "Hi", "Nga ha", "Nge", "À propos", "حول", "Kuhusu", "Sobre", "Acerca de"],
  "web.layout.footer.links.aboutUs": ["Oor ons", "Mayelana nathi", "Malunga nathi", "Mabapi le rona", "Mabapi le rena", "Kaga rona", "Hi hina", "Nga ha rine", "Ngetsi", "À propos de nous", "من نحن", "Kutuhusu", "Sobre nós", "Sobre nosotros"],
  "web.layout.footer.links.careers": ["Loopbane", "Imisebenzi", "Imisebenzi", "Mesebetsi", "Mešomo", "Ditiro", "Mintirho", "Mishumo", "Imisebenti", "Carrières", "الوظائف", "Kazi", "Carreiras", "Empleo"],
  "web.layout.footer.links.contact": ["Kontak", "Xhumana", "Qhagamshelana", "Itesetse", "Ikgokaganye", "Ikgolaganye", "Tihlanganisi", "Ikwame", "Chumana", "Contact", "اتصل بنا", "Wasiliana", "Contacto", "Contacto"],
  "web.layout.footer.links.blog": ["Blog", "Ibhulogi", "Ibhulogi", "Blog", "Blog", "Blog", "Blogu", "Blogu", "Ibhulogi", "Blog", "المدونة", "Blogu", "Blogue", "Blog"],
  "web.layout.footer.links.press": ["Pers", "Abezindaba", "Iindaba", "Boralitaba", "Boralitaba", "Boralitaba", "Vapapalatisi", "Vhapapalatisi", "Betindzaba", "Presse", "الصحافة", "Vyombo vya habari", "Imprensa", "Prensa"],
  "web.layout.footer.links.help": ["Hulp", "Usizo", "Uncedo", "Thuso", "Thušo", "Thuso", "Mpfuno", "Thuso", "Lusito", "Aide", "مساعدة", "Msaada", "Ajuda", "Ayuda"],
  "web.layout.footer.links.helpCenter": ["Hulpsentrum", "Isikhungo sosizo", "Iziko loncedo", "Setsi sa thuso", "Setšhaba sa thušo", "Setheo sa thuso", "Ndhawu yo pfuniwa", "Fhethu ha thuso", "Sikhungo selusito", "Centre d’aide", "مركز المساعدة", "Kituo cha usaidizi", "Centro de ajuda", "Centro de ayuda"],
  "web.layout.footer.links.learn": ["Leer", "Funda", "Funda", "Ithute", "Ithute", "Ithute", "Dyondza", "Guda", "Fundza", "Apprendre", "تعلّم", "Jifunze", "Aprender", "Aprender"],
  "web.layout.footer.links.learningCenter": ["Leersentrum", "Isikhungo sokufunda", "Iziko lokufunda", "Setsi sa thuto", "Setšhaba sa thuto", "Setheo sa thuto", "Ndhawu yo dyondza", "Fhethu ha u guda", "Sikhungo sekufundza", "Centre d’apprentissage", "مركز التعلّم", "Kituo cha kujifunza", "Centro de aprendizagem", "Centro de aprendizaje"],
  "web.layout.footer.links.becomePartner": ["Word 'n vennoot", "Yiba uzakwethu", "Yiba liqabane", "E-ba molekane", "E-ba molekane", "Nna molekane", "Va mupfuni", "Vhani muvhambadzi", "Yiba umlingani", "Devenir partenaire", "كن شريكاً", "Kuwa mshirika", "Tornar-se parceiro", "Hazte socio"],
  "web.layout.footer.links.pricing": ["Pryse", "Amanani", "Amaxabiso", "Litheko", "Ditheko", "Ditheko", "Mintengo", "Mitengo", "Ematinyo", "Tarifs", "الأسعار", "Bei", "Preçário", "Precios"],
  "web.layout.footer.links.forPartners": ["Vir vennote", "Kwabazakwethu", "Kwamaqabane", "Bakeng sa balekane", "Bakeng sa balelane", "Bakeng sa balelane", "Hi vaphuni", "Nga vhavhambadzi", "Kubalingani", "Pour les partenaires", "للشركاء", "Kwa washirika", "Para parceiros", "Para socios"],
  "web.layout.footer.links.giftCard": ["Geskenkkaart", "Ikhadi lesipho", "Ikhadi lesipho", "Karete ya mpho", "Karata ya mpho", "Karata ya mpho", "Khadi ra nyiko", "Khadi ḽa nyiko", "Ikhadi lesipho", "Carte cadeau", "بطاقة هدية", "Kadi ya zawadi", "Cartão de oferta", "Tarjeta de regalo"],
  "web.layout.footer.links.giftCardPurchase": ["Geskenkkaart-aankoop", "Ukuthenga ikhadi lesipho", "Ukuthenga ikhadi lesipho", "Ho reka karete ya mpho", "Go reka karata ya mpho", "Go reka karata ya mpho", "Ku xava khadi ra nyiko", "U renga khadi ḽa nyiko", "Kutsenga ikhadi lesipho", "Achat de carte cadeau", "شراء بطاقة هدية", "Ununuzi wa kadi ya zawadi", "Compra de cartão de oferta", "Compra de tarjeta de regalo"],
  "web.layout.footer.links.terms": ["Diensbepalings", "Imigomo yensizakalo", "Imiqathango yenkonzo", "Liwumelwano tsa tšebeletso", "Mabaka a tirelo", "Mabaka a tirelo", "Milawu ya vukorhokeri", "Milayo ya tshumelo", "Imigomo yensita", "Conditions d’utilisation", "شروط الخدمة", "Masharti ya huduma", "Termos de serviço", "Términos del servicio"],
  "web.layout.footer.links.termsOfUse": ["Gebruiksvoorwaardes", "Imigomo yokusebenzisa", "Imiqathango yokusebenzisa", "Liwumelwano tsa tšebeliso", "Mabaka a tšhomišo", "Mabaka a tiriso", "Milawu ya matirhiselo", "Milayo ya u shumisa", "Imigomo yekusebentisa", "Conditions d’utilisation", "شروط الاستخدام", "Masharti ya matumizi", "Termos de utilização", "Términos de uso"],
  "web.layout.footer.links.privacy": ["Privaatheidsbeleid", "Inqubomgomo yobumfihlo", "Umgaqo-nkqubo wabucala", "Leano la lekunutu", "Pholisi ya sephiri", "Pholisi ya sephiri", "Pholisi ya xihundla", "Pholisi ya tshidzumbe", "Inchubomgomo yetimfihlo", "Politique de confidentialité", "سياسة الخصوصية", "Sera ya faragha", "Política de privacidade", "Política de privacidad"],
  "web.layout.footer.links.cookies": ["Koekies", "Amakhukhi", "Iikhukhi", "Li-cookie", "Di-cookie", "Di-cookie", "Swi-cookie", "Zwi-cookie", "Emakhukhi", "Cookies", "ملفات تعريف الارتباط", "Vidakuzi", "Cookies", "Cookies"],
  "web.layout.footer.links.cookiePolicy": ["Koekiebeleid", "Inqubomgomo yamakhukhi", "Umgaqo-nkqubo weekhukhi", "Leano la li-cookie", "Pholisi ya di-cookie", "Pholisi ya di-cookie", "Pholisi ya swi-cookie", "Pholisi ya zwi-cookie", "Inchubomgomo yemakhukhi", "Politique relative aux cookies", "سياسة ملفات تعريف الارتباط", "Sera ya vidakuzi", "Política de cookies", "Política de cookies"],
  "web.layout.footer.links.sitemap": ["Werfkaart", "Imephu yesayithi", "Imephu yesayithi", "Mmepe oa sebaka", "Mmepe wa wepesaete", "Mmepe wa wepesaete", "Mmepe wa sayiti", "Mmepe wa saiti", "Imephu yesayithi", "Plan du site", "خريطة الموقع", "Ramani ya tovuti", "Mapa do site", "Mapa del sitio"],
  "web.layout.footer.links.community": ["Gemeenskapsriglyne", "Imihlahlandlela yomphakathi", "Izikhokelo zoluntu", "Litataiso tsa sechaba", "Ditaelo tša setšhaba", "Ditaelo tsa setšhaba", "Swiletelo swa vaaki", "Milayo ya tshitshavha", "Imihlahlandlela yemphakatsi", "Règles de la communauté", "إرشادات المجتمع", "Miongozo ya jamii", "Diretrizes da comunidade", "Normas de la comunidad"],
  "web.layout.footer.links.accessibility": ["Toeganklikheid", "Ukufinyeleleka", "Ufikeleleko", "Phihlello", "Phihlelelo", "Phihlelelo", "Ku fikeleleka", "U swikelela", "Kufinyeleleka", "Accessibilité", "إمكانية الوصول", "Ufikikaji", "Acessibilidade", "Accesibilidad"],
  "web.layout.footer.links.media": ["Media-bates", "Izinsiza zokuxhumana", "Izixhobo zeendaba", "Lisebelisoa tsa media", "Didirišwa tša media", "Didiriswa tsa media", "Switirhisiwa swa media", "Zwithisi zwa midia", "Tinsita temedia", "Ressources médias", "الأصول الإعلامية", "Rasilimali za midia", "Recursos de média", "Recursos de medios"],
  "web.layout.footer.links.customerSupport": ["Kliëntediens", "Usizo lwamakhasimende", "Uncedo lwabathengi", "Tšehetso ea bareki", "Thekgo ya bareki", "Tshegetso ya bareki", "Mpfuno wa vakhandziyi", "Thuso ya vharengi", "Lusito lwemakhasimende", "Support client", "دعم العملاء", "Msaada kwa wateja", "Apoio ao cliente", "Atención al cliente"],
  "customer.mobile.stackTitles.pdf": ["PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF", "PDF"],
  "customer.mobile.stackTitles.shop": ["Winkel", "Isitolo", "Ivenkile", "Lebenkele", "Lebenkele", "Lebenkele", "Vhengele", "Vhenegele", "Sitolo", "Boutique", "المتجر", "Duka", "Loja", "Tienda"],
  "customer.mobile.stackTitles.checkout": ["Afhandeling", "Ukuphothula", "Ukuphela", "Ho qeta", "Go fetša", "Go fetsa", "Ku hetisa", "U fhedza", "Kuphothula", "Paiement", "الدفع", "Malipo", "Checkout", "Pago"],
  "customer.mobile.stackTitles.support": ["Ondersteuning", "Usizo", "Uncedo", "Tšehetso", "Thekgo", "Tshegetso", "Mpfuno", "Thuso", "Lusito", "Assistance", "الدعم", "Msaada", "Apoio", "Soporte"],
  "customer.mobile.stackTitles.ticket": ["Kaartjie", "Ithikithi", "Ithikithi", "Thekete", "Thekete", "Thekete", "Thekete", "Thekete", "Ithikithi", "Ticket", "تذكرة", "Tiketi", "Ticket", "Ticket"],
  "customer.mobile.stackTitles.newTicket": ["Nuwe kaartjie", "Ithikithi elisha", "Ithikithi elitsha", "Thekete e ncha", "Thekete e mpsha", "Thekete e ntšha", "Thekete leyintshwa", "Thekete ntswa", "Ithikithi lelisha", "Nouveau ticket", "تذكرة جديدة", "Tiketi mpya", "Novo ticket", "Ticket nuevo"],
};

function assertRows() {
  for (const [key, vals] of Object.entries(TR)) {
    if (!Array.isArray(vals) || vals.length !== LANGS.length) {
      throw new Error(`${key} has ${vals?.length ?? 0} langs, expected ${LANGS.length}`);
    }
  }
}

function writeLocale(code, data) {
  const localePath = path.join(localesDir, `${code}.json`);
  fs.writeFileSync(localePath, JSON.stringify(data, null, 2) + "\n");
}

assertRows();

const enPath = path.join(localesDir, "en.json");
const en = deepMerge(JSON.parse(fs.readFileSync(enPath, "utf8")), EN_DELTA);
writeLocale("en", en);
console.log("updated en.json");

for (const locale of LANGS) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const merged = deepMerge(data, EN_DELTA);
  for (const [key, vals] of Object.entries(TR)) {
    deepSet(merged, key, vals[LANGS.indexOf(locale)]);
  }
  writeLocale(locale, merged);
  console.log("updated", locale);
}

console.log("done", Object.keys(TR).length, "translated keys");
