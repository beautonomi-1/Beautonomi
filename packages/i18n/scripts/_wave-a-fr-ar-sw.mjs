/**
 * Wave A phrase-first translator: English → fr, ar, sw.
 * Exact strings first, then sentence patterns, then longest-match phrases.
 */
export const LANGS = ["fr", "ar", "sw"];

const BRANDS = [
  "Beautonomi",
  "Paystack",
  "Yoco",
  "Apple ID",
  "Face ID",
  "App Store Connect",
  "App Store",
  "Google Play",
  "Paystack Terminal",
  "SKU",
  "EFT",
  "PDF",
  "SMS",
  "OTP",
  "URL",
  "CPC",
  "CTR",
  "VAT",
  "EULA",
  "ID",
  "QR",
  "iOS",
  "Android",
  "WhatsApp",
  "Stripe",
  "Mapbox",
  "Twilio",
  "PayCloud",
  "Didit",
  "Google",
  "Apple",
  "Instagram",
  "Facebook",
  "Play Store",
];

export function isIdentity(s) {
  if (typeof s !== "string") return false;
  if (s === "") return true;
  if (s === "Beautonomi") return true;
  if (/^[\s\-—.·…,/:+*#&%<>[\]()0-9]+$/.test(s)) return true;
  if (/^\d{1,2}:\d{2}$/.test(s)) return true;
  if (/^[A-Z]{2} \+\d+$/.test(s)) return true;
  if (/^\+\d+\.\.\.$/.test(s)) return true;
  if (/^\.ics$/.test(s)) return true;
  if (/^\/(mo|year|month|5)$/.test(s)) return true;
  if (
    /^(AM|PM|OK|QR|SMS|sms|EFT|SKU|CTR|GRP|MRR|UIF|VIP|UTC|PKG|EULA|TEST|HH:MM|Yoco|Didit|Apple|Google|Iris|Doe|John|X|W|R|WA|es|PDF|OTP|URL|ID|iOS|Android|WhatsApp|Stripe|Mapbox|Twilio|PayCloud|Instagram|Facebook|whatsapp|WHATSAPP)$/.test(
      s,
    )
  ) {
    return true;
  }
  if (
    /^(s|2–3|4–10|N\/A|Apt 4B|e\.g\. 10|SUMMER20|https:\/\/…|https:\/\/\.\.\.|Face ID|my-salon|your-salon|pk_live_\.\.\.|sk_live_\.\.\.|whsec_\.\.\.|uuid, uuid, …|www\.example\.com|client@example\.com|contact@example\.com|john\.doe@example\.com|supplier@example\.com|book\.beautonomi\.com\/|123 Main Street|e\.g\. Nolo Sehlolo|R\{\{price\}\}|BEAUTONOMI Logo|ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)$/.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}

export function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function protectTokens(str) {
  const tokens = [];
  let out = str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const i = tokens.length;
    tokens.push(`{{${name}}}`);
    return `\u0000${i}\u0000`;
  });
  for (const brand of BRANDS) {
    const re = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replace(re, () => {
      const i = tokens.length;
      tokens.push(brand);
      return `\u0000${i}\u0000`;
    });
  }
  return { out, tokens };
}

function restoreTokens(str, tokens) {
  return str.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)] ?? "");
}

/** @type {Map<string, {fr:string,ar:string,sw:string}>} */
export const EXACT = new Map();

function ex(en, fr, ar, sw) {
  EXACT.set(en, { fr, ar, sw });
}

function packMany(rows) {
  for (const [en, fr, ar, sw] of rows) ex(en, fr, ar, sw);
}

// --- Common chrome ---
packMany([
  ["Sign out", "Déconnexion", "تسجيل الخروج", "Toka"],
  ["Dismiss", "Ignorer", "تجاهل", "Ondoa"],
  ["Send", "Envoyer", "إرسال", "Tuma"],
  ["Cancel", "Annuler", "إلغاء", "Ghairi"],
  ["Retry", "Réessayer", "إعادة المحاولة", "Jaribu tena"],
  ["Error", "Erreur", "خطأ", "Hitilafu"],
  ["Validation", "Validation", "التحقق", "Uthibitishaji"],
  ["Success", "Succès", "نجاح", "Imefaulu"],
  ["Security", "Sécurité", "الأمان", "Usalama"],
  ["Account", "Compte", "الحساب", "Akaunti"],
  ["account", "compte", "الحساب", "akaunti"],
  ["Password", "Mot de passe", "كلمة المرور", "Nenosiri"],
  ["Email address", "Adresse e-mail", "عنوان البريد الإلكتروني", "Anwani ya barua pepe"],
  ["Phone number", "Numéro de téléphone", "رقم الهاتف", "Nambari ya simu"],
  ["New email address", "Nouvelle adresse e-mail", "عنوان بريد إلكتروني جديد", "Anwani mpya ya barua pepe"],
  ["New phone number", "Nouveau numéro de téléphone", "رقم هاتف جديد", "Nambari mpya ya simu"],
  ["Login & security", "Connexion et sécurité", "تسجيل الدخول والأمان", "Kuingia na usalama"],
  ["Email, phone, password & sessions", "E-mail, téléphone, mot de passe et sessions", "البريد والهاتف وكلمة المرور والجلسات", "Barua pepe, simu, nenosiri na vipindi"],
  ["Failed to load profile", "Impossible de charger le profil", "تعذر تحميل الملف الشخصي", "Imeshindwa kupakia wasifu"],
  ["Please enter a valid phone number.", "Veuillez saisir un numéro de téléphone valide.", "يرجى إدخال رقم هاتف صالح.", "Tafadhali weka nambari sahihi ya simu."],
  ["Code sent", "Code envoyé", "تم إرسال الرمز", "Msimbo umetumwa"],
  ["Failed to send verification code.", "Impossible d’envoyer le code de vérification.", "تعذر إرسال رمز التحقق.", "Imeshindwa kutuma msimbo wa uthibitisho."],
  ["Failed to save phone number.", "Impossible d’enregistrer le numéro de téléphone.", "تعذر حفظ رقم الهاتف.", "Imeshindwa kuhifadhi nambari ya simu."],
  ["Phone updated", "Téléphone mis à jour", "تم تحديث الهاتف", "Simu imesasishwa"],
  ["Your phone number has been updated successfully.", "Votre numéro de téléphone a été mis à jour.", "تم تحديث رقم هاتفك بنجاح.", "Nambari yako ya simu imesasishwa."],
  ["Verification failed", "Échec de la vérification", "فشل التحقق", "Uthibitisho umeshindwa"],
  ["The code was incorrect or has expired.", "Le code est incorrect ou a expiré.", "الرمز غير صحيح أو منتهي الصلاحية.", "Msimbo si sahihi au umeisha muda."],
  ["Could not enable biometric authentication.", "Impossible d’activer l’authentification biométrique.", "تعذر تفعيل المصادقة البيومترية.", "Imeshindwa kuwasha uthibitishaji wa kibiometrika."],
  ["Could not disable biometric authentication.", "Impossible de désactiver l’authentification biométrique.", "تعذر إيقاف المصادقة البيومترية.", "Imeshindwa kuzima uthibitishaji wa kibiometrika."],
  ["Could not sign out from all devices.", "Impossible de se déconnecter de tous les appareils.", "تعذر تسجيل الخروج من جميع الأجهزة.", "Imeshindwa kutoka kwenye vifaa vyote."],
  ["Sign out from all devices?", "Se déconnecter de tous les appareils ?", "تسجيل الخروج من جميع الأجهزة؟", "Utoke kwenye vifaa vyote?"],
  [
    "This ends every active session across all your phones, tablets and browsers. You'll need to log in again everywhere. Use this if you suspect unauthorised access.",
    "Cela met fin à toutes les sessions actives sur vos téléphones, tablettes et navigateurs. Vous devrez vous reconnecter partout. Utilisez cette option en cas d’accès non autorisé.",
    "يؤدي هذا إلى إنهاء كل جلسة نشطة على هواتفك وأجهزتك اللوحية ومتصفحاتك. ستحتاج إلى تسجيل الدخول مرة أخرى في كل مكان. استخدم هذا إذا اشتبهت في وصول غير مصرح به.",
    "Hii inafunga vipindi vyote vilivyo hai kwenye simu, kompyuta kibao na vivinjari vyako. Utahitaji kuingia tena kila mahali. Tumia hii ukishuku ufikiaji usioidhinishwa.",
  ],
  ["Sign out everywhere", "Se déconnecter partout", "تسجيل الخروج من كل مكان", "Toka kila mahali"],
  ["{{label}} lock", "Verrouillage {{label}}", "قفل {{label}}", "Kufuli ya {{label}}"],
  ["Require {{label}} to open the app", "Exiger {{label}} pour ouvrir l’app", "اطلب {{label}} لفتح التطبيق", "Hitaji {{label}} ili kufungua programu"],
  ["Toggle {{label}} lock", "Activer ou désactiver le verrouillage {{label}}", "تبديل قفل {{label}}", "Washa au zima kufuli ya {{label}}"],
  ["Current:", "Actuel :", "الحالي:", "Sasa:"],
  ["We'll email a {{digits}}-digit code to verify your new address.", "Nous enverrons par e-mail un code à {{digits}} chiffres pour vérifier la nouvelle adresse.", "سنرسل رمزًا مكونًا من {{digits}} أرقام عبر البريد للتحقق من عنوانك الجديد.", "Tutakutumia msimbo wa tarakimu {{digits}} kwa barua pepe ili kuthibitisha anwani yako mpya."],
  ["Send verification code", "Envoyer le code de vérification", "إرسال رمز التحقق", "Tuma msimbo wa uthibitisho"],
  ["Code sent to {{destination}}", "Code envoyé à {{destination}}", "تم إرسال الرمز إلى {{destination}}", "Msimbo umetumwa kwa {{destination}}"],
  ["Email change verification code", "Code de changement d’e-mail", "رمز تغيير البريد الإلكتروني", "Msimbo wa kubadilisha barua pepe"],
  ["Verify & save", "Vérifier et enregistrer", "تحقق واحفظ", "Thibitisha na uhifadhi"],
  ["Country code {{code}}", "Indicatif {{code}}", "رمز الدولة {{code}}", "Msimbo wa nchi {{code}}"],
  ["We'll SMS a {{digits}}-digit code to verify your number (valid {{minutes}} min).", "Nous enverrons par SMS un code à {{digits}} chiffres pour vérifier votre numéro (valable {{minutes}} min).", "سنرسل برسالة SMS رمزًا من {{digits}} أرقام للتحقق من رقمك (صالح لمدة {{minutes}} د).", "Tutakutumia SMS msimbo wa tarakimu {{digits}} ili kuthibitisha nambari yako (halali dakika {{minutes}})."],
  ["Send phone verification code", "Envoyer le code du téléphone", "إرسال رمز التحقق للهاتف", "Tuma msimbo wa kuthibitisha simu"],
  ["Enter the {{digits}}-digit code from your SMS", "Saisissez le code à {{digits}} chiffres reçu par SMS", "أدخل الرمز المكون من {{digits}} أرقام من رسالة SMS", "Weka msimbo wa tarakimu {{digits}} kutoka SMS"],
  ["Phone change verification code", "Code de changement de téléphone", "رمز تغيير الهاتف", "Msimbo wa kubadilisha simu"],
  ["Cancel phone change", "Annuler le changement de téléphone", "إلغاء تغيير الهاتف", "Ghairi kubadilisha simu"],
  ["Verify and save phone", "Vérifier et enregistrer le téléphone", "تحقق واحفظ الهاتف", "Thibitisha na uhifadhi simu"],
  ["Set password", "Définir un mot de passe", "تعيين كلمة المرور", "Weka nenosiri"],
  ["Change password", "Modifier le mot de passe", "تغيير كلمة المرور", "Badilisha nenosiri"],
  ["Add password sign-in to your account", "Ajouter une connexion par mot de passe à votre compte", "أضف تسجيل الدخول بكلمة المرور إلى حسابك", "Ongeza kuingia kwa nenosiri kwenye akaunti yako"],
  ["Update your account password", "Mettre à jour le mot de passe du compte", "حدّث كلمة مرور حسابك", "Sasisha nenosiri la akaunti yako"],
  ["Active sessions", "Sessions actives", "الجلسات النشطة", "Vipindi vilivyo hai"],
  ["Sign out from this app and every other phone, tablet or browser where your account is signed in.", "Déconnectez-vous de cette app et de tous les autres téléphones, tablettes ou navigateurs où votre compte est connecté.", "سجّل الخروج من هذا التطبيق ومن كل هاتف أو جهاز لوحي أو متصفح آخر حيث حسابك مسجّل الدخول.", "Toka kwenye programu hii na kila simu, kompyuta kibao au kivinjari kingine ambako akaunti yako imeingia."],
  ["Sign out from all devices", "Se déconnecter de tous les appareils", "تسجيل الخروج من جميع الأجهزة", "Toka kwenye vifaa vyote"],
  ["Deactivate account", "Désactiver le compte", "تعطيل الحساب", "Zima akaunti"],
  ["Temporarily disable your account", "Désactiver temporairement votre compte", "عطّل حسابك مؤقتًا", "Zima akaunti yako kwa muda"],
  ["Email updated", "E-mail mis à jour", "تم تحديث البريد الإلكتروني", "Barua pepe imesasishwa"],
  ["Your email address has been verified and saved.", "Votre adresse e-mail a été vérifiée et enregistrée.", "تم التحقق من عنوان بريدك وحفظه.", "Anwani yako ya barua pepe imethibitishwa na kuhifadhiwa."],
  ["Enter a valid email address.", "Saisissez une adresse e-mail valide.", "أدخل عنوان بريد إلكتروني صالح.", "Weka anwani sahihi ya barua pepe."],
  ["Enter the {{digits}}-digit code from your email.", "Saisissez le code à {{digits}} chiffres reçu par e-mail.", "أدخل الرمز المكون من {{digits}} أرقام من بريدك.", "Weka msimbo wa tarakimu {{digits}} kutoka barua pepe."],
  ["Could not send verification code.", "Impossible d’envoyer le code de vérification.", "تعذر إرسال رمز التحقق.", "Imeshindwa kutuma msimbo wa uthibitisho."],
  ["Invalid or expired code.", "Code invalide ou expiré.", "رمز غير صالح أو منتهي.", "Msimbo si sahihi au umeisha muda."],
  ["Fingerprint", "Empreinte digitale", "بصمة الإصبع", "Alama ya kidole"],
  ["Iris", "Iris", "قزحية", "Iris"],
  ["Biometrics", "Biométrie", "القياسات الحيوية", "Bayometriki"],
  ["Yes", "Oui", "نعم", "Ndiyo"],
  ["No", "Non", "لا", "Hapana"],
  ["OK", "OK", "حسنًا", "Sawa"],
  ["Ok", "OK", "حسنًا", "Sawa"],
  ["Save", "Enregistrer", "حفظ", "Hifadhi"],
  ["Delete", "Supprimer", "حذف", "Futa"],
  ["Edit", "Modifier", "تعديل", "Hariri"],
  ["Search", "Rechercher", "بحث", "Tafuta"],
  ["Back", "Retour", "رجوع", "Rudi"],
  ["Next", "Suivant", "التالي", "Ifuatayo"],
  ["Done", "Terminé", "تم", "Imekamilika"],
  ["Continue", "Continuer", "متابعة", "Endelea"],
  ["Close", "Fermer", "إغلاق", "Funga"],
  ["Confirm", "Confirmer", "تأكيد", "Thibitisha"],
  ["Submit", "Envoyer", "إرسال", "Wasilisha"],
  ["Apply", "Appliquer", "تطبيق", "Tumia"],
  ["Clear", "Effacer", "مسح", "Futa"],
  ["Filter", "Filtrer", "تصفية", "Chuja"],
  ["Sort", "Trier", "ترتيب", "Panga"],
  ["Settings", "Réglages", "الإعدادات", "Mipangilio"],
  ["More", "Plus", "المزيد", "Zaidi"],
  ["more", "plus", "المزيد", "zaidi"],
  ["Required", "Obligatoire", "مطلوب", "Inahitajika"],
  ["Optional", "Facultatif", "اختياري", "Si lazima"],
  ["Copy", "Copier", "نسخ", "Nakili"],
  ["Refresh", "Actualiser", "تحديث", "Onyesha upya"],
  ["Loading…", "Chargement…", "جاري التحميل…", "Inapakia…"],
  ["Loading...", "Chargement…", "جاري التحميل…", "Inapakia…"],
  ["View all", "Tout voir", "عرض الكل", "Angalia zote"],
  ["Show more", "Afficher plus", "عرض المزيد", "Onyesha zaidi"],
  ["Show less", "Afficher moins", "عرض أقل", "Onyesha kidogo"],
  ["Select all", "Tout sélectionner", "تحديد الكل", "Chagua zote"],
  ["No results found", "Aucun résultat", "لا توجد نتائج", "Hakuna matokeo"],
  ["Add", "Ajouter", "إضافة", "Ongeza"],
  ["Remove", "Retirer", "إزالة", "Ondoa"],
  ["Share", "Partager", "مشاركة", "Shiriki"],
  ["All", "Tous", "الكل", "Zote"],
  ["Other", "Autre", "أخرى", "Nyingine"],
  ["other", "autre", "أخرى", "nyingine"],
  ["None", "Aucun", "لا شيء", "Hakuna"],
  ["Active", "Actif", "نشط", "Inatumika"],
  ["Inactive", "Inactif", "غير نشط", "Haifanyi kazi"],
  ["Pending", "En attente", "قيد الانتظار", "Inasubiri"],
  ["Cancelled", "Annulé", "ملغى", "Imeghairiwa"],
  ["Completed", "Terminé", "مكتمل", "Imekamilika"],
  ["Confirmed", "Confirmé", "مؤكد", "Imethibitishwa"],
  ["Expired", "Expiré", "منتهي", "Muda umeisha"],
  ["Refunded", "Remboursé", "مسترد", "Imerejeshwa"],
  ["Processing", "Traitement", "قيد المعالجة", "Inachakata"],
  ["Processing…", "Traitement…", "جارٍ المعالجة…", "Inachakata…"],
  ["Saving…", "Enregistrement…", "جارٍ الحفظ…", "Inahifadhi…"],
  ["Deleting…", "Suppression…", "جارٍ الحذف…", "Inafuta…"],
  ["Sending...", "Envoi…", "جارٍ الإرسال…", "Inatuma..."],
  ["Today", "Aujourd’hui", "اليوم", "Leo"],
  ["Home", "Accueil", "الرئيسية", "Nyumbani"],
  ["Help", "Aide", "مساعدة", "Msaada"],
  ["Name", "Nom", "الاسم", "Jina"],
  ["Address", "Adresse", "العنوان", "Anwani"],
  ["City", "Ville", "المدينة", "Jiji"],
  ["Country", "Pays", "الدولة", "Nchi"],
  ["Date", "Date", "التاريخ", "Tarehe"],
  ["Time", "Heure", "الوقت", "Muda"],
  ["Notes", "Notes", "ملاحظات", "Maelezo"],
  ["Note", "Note", "ملاحظة", "Dokezo"],
  ["Status", "Statut", "الحالة", "Hali"],
  ["Price", "Prix", "السعر", "Bei"],
  ["Duration", "Durée", "المدة", "Muda"],
  ["Location", "Lieu", "الموقع", "Mahali"],
  ["Services", "Services", "الخدمات", "Huduma"],
  ["Service", "Service", "الخدمة", "Huduma"],
  ["Staff", "Équipe", "الفريق", "Wafanyakazi"],
  ["Team", "Équipe", "الفريق", "Timu"],
  ["Owner", "Propriétaire", "المالك", "Mmiliki"],
  ["Manager", "Gestionnaire", "المدير", "Meneja"],
  ["Customer", "Client", "العميل", "Mteja"],
  ["Client", "Client", "العميل", "Mteja"],
  ["Provider", "Prestataire", "مزود الخدمة", "Mtoa huduma"],
  ["Booking", "Réservation", "حجز", "Uhifadhi"],
  ["booking", "réservation", "حجز", "uhifadhi"],
  ["Bookings", "Réservations", "الحجوزات", "Uhifadhi"],
  ["Appointment", "Rendez-vous", "موعد", "Miadi"],
  ["Wallet", "Portefeuille", "المحفظة", "Pochi"],
  ["Membership", "Abonnement", "العضوية", "Uanachama"],
  ["Subscription", "Abonnement", "الاشتراك", "Usajili"],
  ["Notifications", "Notifications", "الإشعارات", "Arifa"],
  ["Profile", "Profil", "الملف الشخصي", "Wasifu"],
  ["Calendar", "Calendrier", "التقويم", "Kalenda"],
  ["Schedule", "Planning", "الجدول", "Ratiba"],
  ["Support", "Assistance", "الدعم", "Msaada"],
  ["Reviews", "Avis", "التقييمات", "Tathmini"],
  ["Orders", "Commandes", "الطلبات", "Maagizo"],
  ["order", "commande", "طلب", "agizo"],
  ["Messages", "Messages", "الرسائل", "Ujumbe"],
  ["Language", "Langue", "اللغة", "Lugha"],
  ["Invoice", "Facture", "فاتورة", "Ankara"],
  ["Discount", "Réduction", "خصم", "Punguzo"],
  ["Tip", "Pourboire", "إكرامية", "Bahashishi"],
  ["Fee", "Frais", "رسوم", "Ada"],
  ["Travel fee", "Frais de déplacement", "رسوم التنقل", "Ada ya usafiri"],
  ["Service fee", "Frais de service", "رسوم الخدمة", "Ada ya huduma"],
  ["Group booking", "Réservation de groupe", "حجز جماعي", "Uhifadhi wa kikundi"],
  ["Team member", "Membre de l’équipe", "عضو الفريق", "Mwanachama wa timu"],
  ["Staff member", "Membre de l’équipe", "عضو الفريق", "Mfanyakazi"],
  ["Gift card", "Carte cadeau", "بطاقة هدايا", "Kadi ya zawadi"],
  ["gift card", "carte cadeau", "بطاقة هدايا", "kadi ya zawadi"],
  ["Products", "Produits", "المنتجات", "Bidhaa"],
  ["Product", "Produit", "المنتج", "Bidhaa"],
  ["Cart", "Panier", "السلة", "Kikapu"],
  ["Payment", "Paiement", "الدفع", "Malipo"],
  ["Cash", "Espèces", "نقدًا", "Pesa taslimu"],
  ["Card", "Carte", "بطاقة", "Kadi"],
  ["card", "carte", "بطاقة", "kadi"],
  ["Subtotal", "Sous-total", "المجموع الفرعي", "Jumla ndogo"],
  ["Tax", "Taxe", "الضريبة", "Kodi"],
  ["Taxes", "Taxes", "الضرائب", "Kodi"],
  ["Total", "Total", "الإجمالي", "Jumla"],
  ["Total paid", "Total payé", "إجمالي المدفوع", "Jumla iliyolipwa"],
  ["Refund", "Remboursement", "استرداد", "Rejesha"],
  ["Description", "Description", "الوصف", "Maelezo"],
  ["Category", "Catégorie", "الفئة", "Kategoria"],
  ["Brand", "Marque", "العلامة", "Chapa"],
  ["Supplier", "Fournisseur", "المورد", "Msambazaji"],
  ["Quantity", "Quantité", "الكمية", "Kiasi"],
  ["Stock", "Stock", "المخزون", "Hifadhi"],
  ["Pricing", "Tarifs", "التسعير", "Bei"],
  ["Options", "Options", "الخيارات", "Chaguo"],
  ["Option", "Option", "خيار", "Chaguo"],
  ["Unknown", "Inconnu", "غير معروف", "Haijulikani"],
  ["Go back", "Retour", "رجوع", "Rudi nyuma"],
  ["Try again", "Réessayer", "حاول مرة أخرى", "Jaribu tena"],
  ["Please try again.", "Veuillez réessayer.", "يرجى المحاولة مرة أخرى.", "Tafadhali jaribu tena."],
  ["Please try again", "Veuillez réessayer", "يرجى المحاولة مرة أخرى", "Tafadhali jaribu tena"],
  ["Something went wrong.", "Une erreur s’est produite.", "حدث خطأ ما.", "Kuna tatizo limetokea."],
  ["Are you sure?", "Êtes-vous sûr ?", "هل أنت متأكد؟", "Una uhakika?"],
  ["Save changes", "Enregistrer les modifications", "حفظ التغييرات", "Hifadhi mabadiliko"],
  ["View more", "Voir plus", "عرض المزيد", "Angalia zaidi"],
  ["Learn more", "En savoir plus", "معرفة المزيد", "Jifunze zaidi"],
  ["Contact support", "Contacter l’assistance", "التواصل مع الدعم", "Wasiliana na msaada"],
  ["Log in", "Se connecter", "تسجيل الدخول", "Ingia"],
  ["Log In", "Connexion", "تسجيل الدخول", "Ingia"],
  ["Log out", "Se déconnecter", "تسجيل الخروج", "Toka"],
  ["Sign up", "S’inscrire", "إنشاء حساب", "Jisajili"],
  ["Sign Up", "Inscription", "إنشاء حساب", "Jisajili"],
  ["Welcome", "Bienvenue", "مرحبًا", "Karibu"],
  ["Full name", "Nom complet", "الاسم الكامل", "Jina kamili"],
  ["Confirm password", "Confirmer le mot de passe", "تأكيد كلمة المرور", "Thibitisha nenosiri"],
  ["Reset password", "Réinitialiser le mot de passe", "إعادة تعيين كلمة المرور", "Weka nenosiri upya"],
  ["Enter verification code", "Saisir le code de vérification", "أدخل رمز التحقق", "Weka msimbo wa uthibitisho"],
  ["Already have an account?", "Vous avez déjà un compte ?", "هل لديك حساب بالفعل؟", "Tayari una akaunti?"],
  ["Don't have an account?", "Vous n’avez pas de compte ?", "ليس لديك حساب؟", "Huna akaunti?"],
  ["Continue with Google", "Continuer avec Google", "المتابعة باستخدام Google", "Endelea na Google"],
  ["Continue with Apple", "Continuer avec Apple", "المتابعة باستخدام Apple", "Endelea na Apple"],
  ["or continue with", "ou continuer avec", "أو المتابعة باستخدام", "au endelea na"],
  ["By continuing, you agree to our Terms of Service and Privacy Policy", "En continuant, vous acceptez nos Conditions d’utilisation et notre Politique de confidentialité", "بالمتابعة، فإنك توافق على شروط الخدمة وسياسة الخصوصية", "Kwa kuendelea, unakubali Masharti ya Huduma na Sera ya Faragha"],
  ["How did you hear about us?", "Comment avez-vous entendu parler de nous ?", "كيف سمعت عنا؟", "Ulitusikiaje?"],
  ["Preferred language", "Langue préférée", "اللغة المفضلة", "Lugha unayopendelea"],
  ["Friend or family", "Ami ou famille", "صديق أو عائلة", "Rafiki au familia"],
  ["Blog or article", "Blog ou article", "مدونة أو مقال", "Blogu au makala"],
  ["Referred by a provider", "Recommandé par un prestataire", "تمت الإحالة من مزود خدمة", "Ulipendekezwa na mtoa huduma"],
  ["Prefer not to say", "Préfère ne pas dire", "أفضل عدم الإفصاح", "Sipendelei kusema"],
  ["Send me tips, offers, and product updates. You can unsubscribe anytime.", "Envoyez-moi des conseils, offres et actualités. Vous pouvez vous désabonner à tout moment.", "أرسل لي نصائح وعروضًا وتحديثات. يمكنك إلغاء الاشتراك في أي وقت.", "Nitumie vidokezo, ofa na sasisho. Unaweza kujiondoa wakati wowote."],
  ["Remember me for 30 days", "Se souvenir de moi pendant 30 jours", "تذكرني لمدة 30 يومًا", "Nikumbuke kwa siku 30"],
  ["Passkey (coming soon)", "Clé d’accès (bientôt)", "مفتاح مرور (قريبًا)", "Passkey (inakuja hivi karibuni)"],
  ["This email is already registered.", "Cet e-mail est déjà enregistré.", "هذا البريد مسجّل بالفعل.", "Barua pepe hii tayari imesajiliwa."],
  ["Send code to this email", "Envoyer un code à cet e-mail", "إرسال رمز إلى هذا البريد", "Tuma msimbo kwa barua pepe hii"],
  ["Sign in with Google", "Se connecter avec Google", "تسجيل الدخول عبر Google", "Ingia kwa Google"],
  ["Add a password", "Ajouter un mot de passe", "إضافة كلمة مرور", "Ongeza nenosiri"],
  ["You signed in without a password. Add one so you can sign in with email next time.", "Vous vous êtes connecté sans mot de passe. Ajoutez-en un pour vous connecter par e-mail la prochaine fois.", "لقد سجّلت الدخول بدون كلمة مرور. أضف واحدة لتسجيل الدخول بالبريد في المرة القادمة.", "Uliingia bila nenosiri. Ongeza moja ili uingie kwa barua pepe wakati ujao."],
  ["Set a password", "Définir un mot de passe", "تعيين كلمة مرور", "Weka nenosiri"],
  ["Not now", "Pas maintenant", "ليس الآن", "Sio sasa"],
  ["Strength", "Robustesse", "القوة", "Nguvu"],
  ["Weak", "Faible", "ضعيفة", "Dhaifu"],
  ["Fair", "Correcte", "متوسطة", "Wastani"],
  ["Good", "Bonne", "جيدة", "Nzuri"],
  ["Strong", "Forte", "قوية", "Imara"],
  ["Send code", "Envoyer le code", "إرسال الرمز", "Tuma msimbo"],
  ["Create your account", "Créez votre compte", "أنشئ حسابك", "Unda akaunti yako"],
  ["Create account", "Créer un compte", "إنشاء حساب", "Unda akaunti"],
  ["Preparing your profile…", "Préparation de votre profil…", "جارٍ إعداد ملفك الشخصي…", "Inaandaa wasifu wako…"],
  ["Verifying partner access…", "Vérification de l’accès partenaire…", "جارٍ التحقق من وصول الشريك…", "Inathibitisha ufikiaji wa mshirika…"],
  ["Email", "E-mail", "البريد الإلكتروني", "Barua pepe"],
  ["Phone", "Téléphone", "الهاتف", "Simu"],
]);

// --- SEO ---
packMany([
  ["Find beauty freelancers & salons near you", "Trouvez des freelances et salons beauté près de chez vous", "اعثر على مستقلين وصالونات تجميل بالقرب منك", "Pata wataalamu huru na saluni karibu nawe"],
  [
    "Choose a country to explore cities with verified salons and mobile beauty professionals. Book hair, nails, makeup, spa services, and more on Beautonomi.",
    "Choisissez un pays pour explorer les villes avec salons et pros mobiles vérifiés. Réservez coiffure, ongles, maquillage, spa et plus sur Beautonomi.",
    "اختر دولة لاستكشاف مدن بها صالونات ومحترفو تجميل متنقلون موثقون. احجز الشعر والأظافر والمكياج والسبا والمزيد على Beautonomi.",
    "Chagua nchi ili kuchunguza miji yenye saluni na wataalamu wa urembo wa simu waliodhibitishwa. Weka nywele, kucha, makeup, spa na zaidi kwenye Beautonomi.",
  ],
  ["Post not found | Beautonomi", "Publication introuvable | Beautonomi", "المنشور غير موجود | Beautonomi", "Chapisho halipatikani | Beautonomi"],
  ["This explore post is unavailable on Beautonomi.", "Cette publication Explore n’est pas disponible sur Beautonomi.", "هذا المنشور غير متاح على Beautonomi.", "Chapisho hili la Explore halipatikani kwenye Beautonomi."],
  ["{{name}} | Beautonomi", "{{name}} | Beautonomi", "{{name}} | Beautonomi", "{{name}} | Beautonomi"],
  ["Provider Not Found | Beautonomi", "Prestataire introuvable | Beautonomi", "المزود غير موجود | Beautonomi", "Mtoa huduma hajapatikana | Beautonomi"],
  ["The provider you're looking for doesn't exist on Beautonomi.", "Le prestataire que vous cherchez n’existe pas sur Beautonomi.", "المزود الذي تبحث عنه غير موجود على Beautonomi.", "Mtoa huduma unayemtafuta hayupo kwenye Beautonomi."],
  ["Category Not Found", "Catégorie introuvable", "الفئة غير موجودة", "Kategoria haijapatikana"],
  ["Beauty Providers in {{city}} | Beautonomi", "Prestataires beauté à {{city}} | Beautonomi", "مزودو التجميل في {{city}} | Beautonomi", "Watoa huduma wa urembo {{city}} | Beautonomi"],
  ["Discover top-rated beauty and salon providers in {{city}}. Book services from verified professionals on Beautonomi.", "Découvrez les meilleurs prestataires beauté et salons à {{city}}. Réservez des pros vérifiés sur Beautonomi.", "اكتشف أفضل مزودي التجميل والصالونات في {{city}}. احجز خدمات من محترفين موثقين على Beautonomi.", "Gundua watoa huduma bora wa urembo na saluni {{city}}. Weka nafasi kutoka kwa wataalamu waliodhibitishwa kwenye Beautonomi."],
  ["Beauty freelancers & salons in {{country}} | Beautonomi", "Freelances et salons beauté en {{country}} | Beautonomi", "مستقلون وصالونات تجميل في {{country}} | Beautonomi", "Wataalamu huru na saluni {{country}} | Beautonomi"],
  ["Explore beauty freelancers and salons across {{country}}. Book hair, nails, spa, and more on Beautonomi.", "Explorez freelances et salons beauté à travers {{country}}. Réservez coiffure, ongles, spa et plus sur Beautonomi.", "استكشف مستقلين وصالونات التجميل في أنحاء {{country}}. احجز الشعر والأظافر والسبا والمزيد على Beautonomi.", "Chunguza wataalamu huru na saluni kote {{country}}. Weka nywele, kucha, spa na zaidi kwenye Beautonomi."],
  ["Book beauty freelancers & salons in {{city}} | Beautonomi", "Réservez freelances et salons à {{city}} | Beautonomi", "احجز مستقلين وصالونات في {{city}} | Beautonomi", "Weka wataalamu huru na saluni {{city}} | Beautonomi"],
  ["Discover salons and mobile beauty freelancers in {{city}}, {{country}}. Book verified professionals on Beautonomi.", "Découvrez salons et freelances mobiles à {{city}}, {{country}}. Réservez des pros vérifiés sur Beautonomi.", "اكتشف صالونات ومستقلين متنقلين في {{city}}، {{country}}. احجز محترفين موثقين على Beautonomi.", "Gundua saluni na wataalamu huru wa simu {{city}}, {{country}}. Weka wataalamu waliodhibitishwa kwenye Beautonomi."],
  ["{{category}} freelancers & salons in {{city}} | Beautonomi", "Freelances et salons {{category}} à {{city}} | Beautonomi", "مستقلون وصالونات {{category}} في {{city}} | Beautonomi", "Wataalamu huru na saluni za {{category}} {{city}} | Beautonomi"],
  ["Find top-rated {{category}} freelancers and salons in {{city}}. Compare reviews, book verified beauty professionals on Beautonomi.", "Trouvez les meilleurs freelances et salons {{category}} à {{city}}. Comparez les avis et réservez des pros vérifiés sur Beautonomi.", "اعثر على أفضل مستقلين وصالونات {{category}} في {{city}}. قارن التقييمات واحجز محترفين موثقين على Beautonomi.", "Pata wataalamu huru na saluni bora za {{category}} {{city}}. Linganisha tathmini, weka wataalamu waliodhibitishwa kwenye Beautonomi."],
  ["{{category}} across {{country}} — verified beauty professionals | Beautonomi", "{{category}} à travers {{country}} — professionnels beauté vérifiés | Beautonomi", "{{category}} في أنحاء {{country}} — محترفو تجميل موثقون | Beautonomi", "{{category}} kote {{country}} — wataalamu wa urembo waliodhibitishwa | Beautonomi"],
  ["Browse {{category}} services from verified freelancers and salons across {{country}} on Beautonomi.", "Parcourez les services {{category}} de freelances et salons vérifiés à travers {{country}} sur Beautonomi.", "تصفح خدمات {{category}} من مستقلين وصالونات موثقة في أنحاء {{country}} على Beautonomi.", "Vinjari huduma za {{category}} kutoka kwa wataalamu huru na saluni waliodhibitishwa kote {{country}} kwenye Beautonomi."],
  ["Article Not Found · Learning Center", "Article introuvable · Centre d’apprentissage", "المقال غير موجود · مركز التعلم", "Makala haijapatikana · Kituo cha kujifunza"],
  ["The article you're looking for doesn't exist.", "L’article que vous cherchez n’existe pas.", "المقال الذي تبحث عنه غير موجود.", "Makala unayoitafuta haipo."],
  ["· Learning Center", "· Centre d’apprentissage", "· مركز التعلم", "· Kituo cha kujifunza"],
  ["Read {{title}} on the Beautonomi Learning Center.", "Lisez {{title}} sur le Centre d’apprentissage Beautonomi.", "اقرأ {{title}} في مركز التعلم لدى Beautonomi.", "Soma {{title}} kwenye Kituo cha kujifunza cha Beautonomi."],
  ["About", "À propos", "حول", "Kuhusu"],
  ["Learn about Beautonomi, our mission, and how we support beauty professionals and clients.", "Découvrez Beautonomi, notre mission et comment nous soutenons les pros et les clients.", "تعرّف على Beautonomi ومهمتنا وكيف ندعم محترفي التجميل والعملاء.", "Jifunze kuhusu Beautonomi, dhamira yetu, na jinsi tunavyosaidia wataalamu wa urembo na wateja."],
  ["Search Beauty Services, Salons & Mobile Pros", "Rechercher services beauté, salons et pros mobiles", "ابحث عن خدمات التجميل والصالونات والمحترفين المتنقلين", "Tafuta huduma za urembo, saluni na wataalamu wa simu"],
  ["Search verified beauty professionals near you. Compare salons, spas, barbers, nail techs, makeup artists, and mobile beauty services on Beautonomi.", "Recherchez des pros beauté vérifiés près de chez vous. Comparez salons, spas, barbiers, ongles, maquillage et services mobiles sur Beautonomi.", "ابحث عن محترفي تجميل موثقين بالقرب منك. قارن الصالونات والسبا والحلاقين وفنيي الأظافر وخبراء المكياج والخدمات المتنقلة على Beautonomi.", "Tafuta wataalamu wa urembo waliodhibitishwa karibu nawe. Linganisha saluni, spa, kinyozi, kucha, makeup na huduma za simu kwenye Beautonomi."],
  ["Log in to your Beautonomi account.", "Connectez-vous à votre compte Beautonomi.", "سجّل الدخول إلى حساب Beautonomi الخاص بك.", "Ingia kwenye akaunti yako ya Beautonomi."],
  ["Create your Beautonomi account as a customer or provider.", "Créez votre compte Beautonomi en tant que client ou prestataire.", "أنشئ حساب Beautonomi كعميل أو مزود خدمة.", "Unda akaunti yako ya Beautonomi kama mteja au mtoa huduma."],
  ["Pricing", "Tarifs", "الأسعار", "Bei"],
  ["View Beautonomi pricing plans for beauty professionals and businesses.", "Consultez les offres Beautonomi pour les professionnels et les entreprises.", "اطّلع على خطط أسعار Beautonomi للمحترفين والشركات.", "Angalia mipango ya bei ya Beautonomi kwa wataalamu na biashara."],
  ["Privacy Policy", "Politique de confidentialité", "سياسة الخصوصية", "Sera ya faragha"],
  ["Read Beautonomi's Privacy Policy and how we handle your data.", "Lisez la politique de confidentialité Beautonomi et comment nous traitons vos données.", "اقرأ سياسة خصوصية Beautonomi وكيف نتعامل مع بياناتك.", "Soma Sera ya faragha ya Beautonomi na jinsi tunavyoshughulikia data yako."],
  ["Terms and Conditions", "Conditions générales", "الشروط والأحكام", "Sheria na masharti"],
  ["Read Beautonomi's terms and conditions for using the platform.", "Lisez les conditions d’utilisation de la plateforme Beautonomi.", "اقرأ شروط وأحكام استخدام منصة Beautonomi.", "Soma sheria na masharti ya kutumia jukwaa la Beautonomi."],
  ["Help Centre", "Centre d’aide", "مركز المساعدة", "Kituo cha msaada"],
  ["Find answers, browse common help articles, and contact Beautonomi support.", "Trouvez des réponses, parcourez les articles d’aide et contactez l’assistance Beautonomi.", "اعثر على إجابات، وتصفح مقالات المساعدة، وتواصل مع دعم Beautonomi.", "Pata majibu, vinjari makala za msaada, na wasiliana na msaada wa Beautonomi."],
  ["Gift Cards", "Cartes cadeaux", "بطاقات الهدايا", "Kadi za zawadi"],
  [
    "Send a Beautonomi gift card in minutes. Beautiful designs, a personal message, and credit that never expires — redeemable on any beauty and wellness service.",
    "Envoyez une carte cadeau Beautonomi en quelques minutes. Designs soignés, message personnel et crédit sans expiration — valable pour tout service beauté et bien-être.",
    "أرسل بطاقة هدايا Beautonomi في دقائق. تصاميم جميلة ورسالة شخصية ورصيد لا ينتهي — يمكن استخدامه لأي خدمة تجميل وعافية.",
    "Tuma kadi ya zawadi ya Beautonomi kwa dakika. Miundo maridadi, ujumbe wa kibinafsi, na salio lisiloisha — inatumika kwa huduma yoyote ya urembo na ustawi.",
  ],
  ["Resources", "Ressources", "الموارد", "Rasilimali"],
  ["Explore Beautonomi resources, tools, and guides for customers and beauty partners.", "Explorez les ressources, outils et guides Beautonomi pour clients et partenaires.", "استكشف موارد وأدوات وأدلة Beautonomi للعملاء وشركاء التجميل.", "Chunguza rasilimali, zana na miongozo ya Beautonomi kwa wateja na washirika."],
  ["Why Beautonomi", "Pourquoi Beautonomi", "لماذا Beautonomi", "Kwa nini Beautonomi"],
  ["Learn why customers and beauty professionals choose Beautonomi.", "Découvrez pourquoi clients et professionnels choisissent Beautonomi.", "تعرّف على سبب اختيار العملاء ومحترفي التجميل لـ Beautonomi.", "Jifunze kwa nini wateja na wataalamu wa urembo huchagua Beautonomi."],
  ["Become a partner", "Devenir partenaire", "كن شريكًا", "Kuwa mshirika"],
  ["Grow your beauty business with Beautonomi — booking, payments, and tools built for mobile pros.", "Développez votre activité beauté avec Beautonomi — réservation, paiements et outils pour les pros mobiles.", "نمِّ عملك التجميلي مع Beautonomi — حجز ومدفوعات وأدوات مصممة للمحترفين المتنقلين.", "Kuza biashara yako ya urembo na Beautonomi — uhifadhi, malipo na zana kwa wataalamu wa simu."],
  ["Explore", "Explorer", "استكشف", "Gundua"],
  ["Discover posts and inspiration from the Beautonomi community.", "Découvrez publications et inspirations de la communauté Beautonomi.", "اكتشف منشورات وإلهام مجتمع Beautonomi.", "Gundua machapisho na msukumo kutoka jamii ya Beautonomi."],
  ["Learning Center", "Centre d’apprentissage", "مركز التعلم", "Kituo cha kujifunza"],
  ["Guides and answers for customers and beauty professionals on Beautonomi.", "Guides et réponses pour clients et professionnels beauté sur Beautonomi.", "أدلة وإجابات للعملاء ومحترفي التجميل على Beautonomi.", "Miongozo na majibu kwa wateja na wataalamu wa urembo kwenye Beautonomi."],
  ["Search articles in the Beautonomi Learning Center.", "Rechercher des articles dans le Centre d’apprentissage Beautonomi.", "ابحث عن مقالات في مركز التعلم لدى Beautonomi.", "Tafuta makala katika Kituo cha kujifunza cha Beautonomi."],
  ["Partner sign up", "Inscription partenaire", "تسجيل الشريك", "Usajili wa mshirika"],
  ["Create your Beautonomi provider account.", "Créez votre compte prestataire Beautonomi.", "أنشئ حساب مزود الخدمة على Beautonomi.", "Unda akaunti yako ya mtoa huduma ya Beautonomi."],
  ["Beautonomi Partner EULA", "CLUF partenaire Beautonomi", "اتفاقية ترخيص شريك Beautonomi", "EULA ya mshirika wa Beautonomi"],
  ["End User License Agreement for the Beautonomi Partner mobile app.", "Contrat de licence utilisateur final de l’app partenaire Beautonomi.", "اتفاقية ترخيص المستخدم النهائي لتطبيق شريك Beautonomi.", "Makubaliano ya leseni ya mtumiaji wa mwisho ya programu ya mshirika wa Beautonomi."],
  ["Beautonomi Customer EULA", "CLUF client Beautonomi", "اتفاقية ترخيص عميل Beautonomi", "EULA ya mteja wa Beautonomi"],
  ["End User License Agreement for the Beautonomi customer mobile app.", "Contrat de licence utilisateur final de l’app client Beautonomi.", "اتفاقية ترخيص المستخدم النهائي لتطبيق عميل Beautonomi.", "Makubaliano ya leseni ya mtumiaji wa mwisho ya programu ya mteja wa Beautonomi."],
  ["Data & Account Deletion | Beautonomi", "Suppression des données et du compte | Beautonomi", "حذف البيانات والحساب | Beautonomi", "Kufuta data na akaunti | Beautonomi"],
  [
    "Learn how to request deletion of your Beautonomi account and personal data. Understand what is deleted, what is retained, and applicable retention periods.",
    "Découvrez comment demander la suppression de votre compte et de vos données Beautonomi. Comprenez ce qui est supprimé, conservé, et les durées de conservation.",
    "تعرّف على كيفية طلب حذف حسابك وبياناتك الشخصية في Beautonomi. افهم ما يُحذف وما يُحتفظ به وفترات الاحتفاظ المعمول بها.",
    "Jifunze jinsi ya kuomba kufutwa kwa akaunti na data yako ya Beautonomi. Elewa kinachofutwa, kinachohifadhiwa, na muda wa kuhifadhi.",
  ],
  ["Beautonomi Friendly", "Beautonomi Friendly", "Beautonomi Friendly", "Beautonomi Friendly"],
  ["Discover how Beautonomi makes beauty services more accessible and customer-friendly.", "Découvrez comment Beautonomi rend les services beauté plus accessibles et plus simples.", "اكتشف كيف تجعل Beautonomi خدمات التجميل أكثر سهولة وملاءمة للعملاء.", "Gundua jinsi Beautonomi inavyofanya huduma za urembo kufikiwa na kuwa rafiki kwa mteja."],
  ["Cookie Policy", "Politique de cookies", "سياسة ملفات الارتباط", "Sera ya vidakuzi"],
  ["Cookie and tracking preferences for Beautonomi.", "Préférences de cookies et de suivi pour Beautonomi.", "تفضيلات ملفات الارتباط والتتبع لـ Beautonomi.", "Mapendeleo ya vidakuzi na ufuatiliaji kwa Beautonomi."],
  ["Age Suitability", "Tranches d’âge", "الملاءمة العمرية", "Ufaafu wa umri"],
  ["Age suitability, content types, and safety controls for Beautonomi.", "Tranches d’âge, types de contenus et contrôles de sécurité sur Beautonomi.", "الملاءمة العمرية وأنواع المحتوى وضوابط السلامة في Beautonomi.", "Ufaafu wa umri, aina za maudhui na vidhibiti vya usalama vya Beautonomi."],
  ["Booking Portal", "Portail de réservation", "بوابة الحجز", "Lango la uhifadhi"],
  ["View and manage your beauty service bookings. Reschedule or cancel appointments using your secure booking link.", "Consultez et gérez vos réservations. Reprogrammez ou annulez via votre lien sécurisé.", "اعرض حجوزات خدمات التجميل وأدرها. أعد الجدولة أو ألغِ المواعيد عبر رابط الحجز الآمن.", "Angalia na simamia uhifadhi wako. Panga upya au ghairi miadi kwa kiungo salama."],
  ["Front Desk | Beautonomi Provider", "Accueil | Prestataire Beautonomi", "الاستقبال | مزود Beautonomi", "Dawati la mbele | Mtoa huduma wa Beautonomi"],
  ["Manage today's appointments, check-ins, and payments", "Gérez les rendez-vous, check-in et paiements du jour", "أدِر مواعيد اليوم وتسجيل الوصول والمدفوعات", "Simamia miadi ya leo, kuingia na malipo"],
]);

// --- High-frequency / customer chrome ---
packMany([
  ["Upcoming", "À venir", "القادمة", "Zijazo"],
  ["Past", "Passées", "السابقة", "Zilizopita"],
  ["Appt · newest", "Rdv · plus récent", "الموعد · الأحدث", "Miadi · mpya zaidi"],
  ["Appt · soonest", "Rdv · le plus tôt", "الموعد · الأقرب", "Miadi · karibu zaidi"],
  ["Booked · newest", "Réservé · plus récent", "محجوز · الأحدث", "Imewekwa · mpya zaidi"],
  ["Booked · oldest", "Réservé · plus ancien", "محجوز · الأقدم", "Imewekwa · kongwe"],
  ["Board not found", "Tableau introuvable", "اللوحة غير موجودة", "Bodi haijapatikana"],
  ["Saved", "Enregistré", "محفوظ", "Imehifadhiwa"],
  ["{{count}} saved post", "{{count}} publication enregistrée", "منشور محفوظ {{count}}", "Chapisho {{count}} lililohifadhiwa"],
  ["{{count}} saved posts", "{{count}} publications enregistrées", "{{count}} منشورات محفوظة", "Machapisho {{count}} yaliyohifadhiwa"],
  ["No posts in this board yet. Save posts from Explore and add them from your Saved tab.", "Aucune publication dans ce tableau. Enregistrez des publications depuis Explorer et ajoutez-les depuis l’onglet Enregistrés.", "لا توجد منشورات في هذه اللوحة بعد. احفظ منشورات من استكشف وأضفها من تبويب المحفوظات.", "Hakuna machapisho kwenye bodi hii bado. Hifadhi kutoka Explore na uyaongeze kutoka kichupo cha Imehifadhiwa."],
  ["Scroll to bottom", "Aller en bas", "التمرير إلى الأسفل", "Sogeza chini"],
  ["Attachment", "Pièce jointe", "مرفق", "Kiambatisho"],
  ["Request changes", "Demander des modifications", "طلب تعديلات", "Omba mabadiliko"],
  ["Tell the provider what you'd like adjusted.", "Indiquez au prestataire ce que vous souhaitez ajuster.", "أخبر المزود بما تريد تعديله.", "Mwambie mtoa huduma unachotaka kurekebishwa."],
  ["Please describe the changes you want.", "Décrivez les modifications souhaitées.", "يرجى وصف التغييرات المطلوبة.", "Tafadhali eleza mabadiliko unayotaka."],
  ["Failed to request changes", "Impossible de demander des modifications", "تعذر طلب التعديلات", "Imeshindwa kuomba mabadiliko"],
  ["Add to wallet", "Ajouter au portefeuille", "إضافة إلى المحفظة", "Ongeza kwenye pochi"],
  ["Top Up Option", "Option de recharge", "خيار الشحن", "Chaguo la kuongeza salio"],
  ["Saved Card", "Carte enregistrée", "بطاقة محفوظة", "Kadi iliyohifadhiwa"],
  ["New Card", "Nouvelle carte", "بطاقة جديدة", "Kadi mpya"],
  ["Gift Card", "Carte cadeau", "بطاقة هدايا", "Kadi ya zawadi"],
  ["Enter gift card code", "Saisir le code de la carte cadeau", "أدخل رمز بطاقة الهدايا", "Weka msimbo wa kadi ya zawadi"],
  ["Redeem Gift Card", "Utiliser la carte cadeau", "استرداد بطاقة الهدايا", "Komboa kadi ya zawadi"],
  ["Manage saved cards", "Gérer les cartes enregistrées", "إدارة البطاقات المحفوظة", "Simamia kadi zilizohifadhiwa"],
  ["Loading map…", "Chargement de la carte…", "جاري تحميل الخريطة…", "Inapakia ramani…"],
  ["Map not configured", "Carte non configurée", "الخريطة غير مهيأة", "Ramani haijasanidiwa"],
  ["Add a public Mapbox token in admin (Mapbox settings). You can still set your address using search or current location.", "Ajoutez un jeton Mapbox public dans l’admin (réglages Mapbox). Vous pouvez toujours définir l’adresse via la recherche ou la position actuelle.", "أضف رمز Mapbox عامًا في لوحة الإدارة (إعدادات Mapbox). ما زال يمكنك تعيين العنوان عبر البحث أو الموقع الحالي.", "Ongeza tokeni ya umma ya Mapbox katika admin (mipangilio ya Mapbox). Bado unaweza kuweka anwani kwa kutafuta au eneo la sasa."],
  ["Close map", "Fermer la carte", "إغلاق الخريطة", "Funga ramani"],
  ["Locating...", "Localisation…", "جارٍ تحديد الموقع...", "Inatafuta eneo..."],
  ["Tap map or drag pin", "Touchez la carte ou faites glisser l’épingle", "انقر على الخريطة أو اسحب الدبوس", "Gusa ramani au buruta pini"],
  ["Use this location", "Utiliser ce lieu", "استخدام هذا الموقع", "Tumia eneo hili"],
  ["Search results", "Résultats de recherche", "نتائج البحث", "Matokeo ya utafutaji"],
  ["Drop pin on map", "Placer une épingle sur la carte", "إسقاط دبوس على الخريطة", "Weka pini kwenye ramani"],
  ["Tap or drag the pin, then confirm", "Touchez ou faites glisser l’épingle, puis confirmez", "انقر أو اسحب الدبوس ثم أكّد", "Gusa au buruta pini, kisha thibitisha"],
  ["Saved addresses", "Adresses enregistrées", "العناوين المحفوظة", "Anwani zilizohifadhiwa"],
  ["Default", "Par défaut", "افتراضي", "Chaguo-msingi"],
  ["No matches yet. Keep typing, press search on the keyboard, or use the map pin.", "Aucun résultat. Continuez à saisir, lancez la recherche ou utilisez l’épingle.", "لا توجد نتائج بعد. تابع الكتابة أو اضغط بحث أو استخدم دبوس الخريطة.", "Hakuna mechi bado. Endelea kuandika, bonyeza tafuta, au tumia pini ya ramani."],
  ["Getting location…", "Récupération de la position…", "جارٍ الحصول على الموقع…", "Inapata eneo…"],
  ["Use current location", "Utiliser la position actuelle", "استخدام الموقع الحالي", "Tumia eneo la sasa"],
  ["Search above, use your location, or drop a pin. Saved addresses appear here for quick reuse.", "Recherchez, utilisez votre position ou placez une épingle. Les adresses enregistrées apparaissent ici.", "ابحث أعلاه أو استخدم موقعك أو أسقط دبوسًا. تظهر العناوين المحفوظة هنا لإعادة الاستخدام.", "Tafuta hapo juu, tumia eneo lako, au weka pini. Anwani zilizohifadhiwa zinaonekana hapa."],
  ["Unknown location", "Lieu inconnu", "موقع غير معروف", "Mahali pasipojulikana"],
  ["No categories match your search.", "Aucune catégorie ne correspond à votre recherche.", "لا توجد فئات مطابقة لبحثك.", "Hakuna kategoria zinazolingana na utafutaji wako."],
  ["Account check needed", "Vérification du compte requise", "يلزم التحقق من الحساب", "Ukaguzi wa akaunti unahitajika"],
  ["We couldn't verify your account status. Check your connection and try again.", "Impossible de vérifier le statut du compte. Vérifiez la connexion et réessayez.", "تعذر التحقق من حالة حسابك. تحقق من الاتصال وحاول مرة أخرى.", "Hatukuweza kuthibitisha hali ya akaunti yako. Angalia muunganisho na ujaribu tena."],
  ["Retry account status check", "Réessayer la vérification du compte", "إعادة التحقق من حالة الحساب", "Jaribu tena ukaguzi wa akaunti"],
  ["Unlock", "Déverrouiller", "فتح القفل", "Fungua"],
  ["Unlock app", "Déverrouiller l’app", "فتح التطبيق", "Fungua programu"],
  ["Beautonomi is locked", "Beautonomi est verrouillé", "Beautonomi مقفل", "Beautonomi imefungwa"],
  ["Use Face ID, fingerprint, or your device passcode to unlock.", "Utilisez Face ID, l’empreinte ou le code de l’appareil pour déverrouiller.", "استخدم Face ID أو البصمة أو رمز الجهاز لفتح القفل.", "Tumia Face ID, alama ya kidole, au nenosiri la kifaa kufungua."],
  ["We couldn't use biometrics on this device. Sign out and back in to continue.", "Impossible d’utiliser la biométrie sur cet appareil. Déconnectez-vous puis reconnectez-vous.", "تعذر استخدام القياسات الحيوية على هذا الجهاز. سجّل الخروج ثم أعد الدخول للمتابعة.", "Hatukuweza kutumia bayometriki kwenye kifaa hiki. Toka kisha uingie tena ili kuendelea."],
  ["Unlock Beautonomi", "Déverrouiller Beautonomi", "فتح Beautonomi", "Fungua Beautonomi"],
  ["Current location", "Position actuelle", "الموقع الحالي", "Eneo la sasa"],
  ["Add address", "Ajouter une adresse", "إضافة عنوان", "Ongeza anwani"],
  ["Add Address", "Ajouter une adresse", "إضافة عنوان", "Ongeza anwani"],
  ["Add new address", "Ajouter une nouvelle adresse", "إضافة عنوان جديد", "Ongeza anwani mpya"],
  ["Edit address", "Modifier l’adresse", "تعديل العنوان", "Hariri anwani"],
  ["Change address", "Changer d’adresse", "تغيير العنوان", "Badilisha anwani"],
  ["Add to cart", "Ajouter au panier", "أضف إلى السلة", "Ongeza kwenye kikapu"],
  ["Go to cart", "Aller au panier", "الذهاب إلى السلة", "Nenda kwenye kikapu"],
  ["Checkout", "Paiement", "إتمام الشراء", "Maliza ununuzi"],
  ["Payment method", "Moyen de paiement", "طريقة الدفع", "Njia ya malipo"],
  ["Cancel order", "Annuler la commande", "إلغاء الطلب", "Ghairi agizo"],
  ["Change", "Modifier", "تغيير", "Badilisha"],
  ["Details", "Détails", "التفاصيل", "Maelezo"],
  ["Delivery", "Livraison", "التوصيل", "Uwasilishaji"],
  ["Delivery Address", "Adresse de livraison", "عنوان التسليم", "Anwani ya uwasilishaji"],
  ["Collection", "Retrait", "الاستلام", "Ukusanyaji"],
  ["Collection Point", "Point de retrait", "نقطة الاستلام", "Sehemu ya kukusanya"],
  ["Delivered", "Livré", "تم التسليم", "Imewasilishwa"],
  ["Delivery available", "Livraison disponible", "التوصيل متاح", "Uwasilishaji unapatikana"],
  ["Delivery only", "Livraison uniquement", "توصيل فقط", "Uwasilishaji tu"],
  ["In-store pickup only", "Retrait en magasin uniquement", "الاستلام من المتجر فقط", "Kuchukua dukani tu"],
  ["Free · In-store", "Gratuit · En magasin", "مجاني · في المتجر", "Bure · Dukani"],
  ["Sold out", "Épuisé", "نفدت الكمية", "Imeisha"],
  ["Enter code", "Saisir le code", "أدخل الرمز", "Weka msimbo"],
  ["Gift card code", "Code de la carte cadeau", "رمز بطاقة الهدايا", "Msimbo wa kadi ya zawadi"],
  ["Find a provider", "Trouver un prestataire", "العثور على مزود", "Tafuta mtoa huduma"],
  ["Nearest Providers", "Prestataires les plus proches", "أقرب المزودين", "Watoa huduma wa karibu"],
  ["Hottest Picks", "Sélection du moment", "الأكثر رواجًا", "Chaguo maarufu"],
  ["New support ticket", "Nouveau ticket d’assistance", "تذكرة دعم جديدة", "Tiketi mpya ya msaada"],
  ["New ticket", "Nouveau ticket", "تذكرة جديدة", "Tiketi mpya"],
  ["No items for this seller", "Aucun article pour ce vendeur", "لا توجد عناصر لهذا البائع", "Hakuna bidhaa kwa muuzaji huyu"],
  ["No submissions yet", "Aucune soumission pour le moment", "لا توجد إرسالات بعد", "Hakuna mawasilisho bado"],
  ["Only {{count}} left", "Plus que {{count}}", "تبقى {{count}} فقط", "Zimebaki {{count}} tu"],
  ["{{count}} reviews", "{{count}} avis", "{{count}} تقييمات", "Tathmini {{count}}"],
  ["{{count}} services", "{{count}} services", "{{count}} خدمات", "Huduma {{count}}"],
  ["{{minutes}} min", "{{minutes}} min", "{{minutes}} د", "Dakika {{minutes}}"],
  ["{{count}} min", "{{count}} min", "{{count}} د", "Dakika {{count}}"],
  ["{{percent}}% off services", "{{percent}} % de réduction sur les services", "خصم {{percent}}٪ على الخدمات", "Punguzo la {{percent}}% kwenye huduma"],
  ["Expires {{expiry}}", "Expire le {{expiry}}", "تنتهي في {{expiry}}", "Inaisha {{expiry}}"],
  ["Current: {{value}}", "Actuel : {{value}}", "الحالي: {{value}}", "Sasa: {{value}}"],
  ["Code sent. Valid for about {{minutes}} min.", "Code envoyé. Valable environ {{minutes}} min.", "تم إرسال الرمز. صالح لمدة {{minutes}} د تقريبًا.", "Msimbo umetumwa. Halali kwa dakika {{minutes}} hivi."],
  ["Date of birth", "Date de naissance", "تاريخ الميلاد", "Tarehe ya kuzaliwa"],
  ["End User License Agreement", "Contrat de licence utilisateur final", "اتفاقية ترخيص المستخدم النهائي", "Makubaliano ya leseni ya mtumiaji wa mwisho"],
  ["Booking reminders", "Rappels de réservation", "تذكيرات الحجز", "Vikumbusho vya uhifadhi"],
  ["Cash or card when you receive your order", "Espèces ou carte à la réception", "نقدًا أو بطاقة عند استلام الطلب", "Pesa taslimu au kadi unapopokea agizo"],
  ["How would you like to receive your order?", "Comment souhaitez-vous recevoir votre commande ?", "كيف تريد استلام طلبك؟", "Ungependa kupokea agizo lako vipi?"],
  ["I have read and agree to the", "J’ai lu et j’accepte", "لقد قرأت وأوافق على", "Nimesoma na ninakubali"],
  ["Add products from this provider to your cart first.", "Ajoutez d’abord des produits de ce prestataire au panier.", "أضف منتجات هذا المزود إلى سلتك أولًا.", "Kwanza ongeza bidhaa za mtoa huduma huyu kwenye kikapu."],
  ["Missing seller information. Open checkout from your cart.", "Informations vendeur manquantes. Ouvrez le paiement depuis le panier.", "معلومات البائع ناقصة. افتح الدفع من سلتك.", "Taarifa ya muuzaji haipo. Fungua malipo kutoka kikapu."],
  [" · Verified", " · Vérifié", " · موثّق", " · Imethibitishwa"],
  ["Verified", "Vérifié", "موثّق", "Imethibitishwa"],
  ["Available", "Disponible", "متاح", "Inapatikana"],
  ["closed", "fermé", "مغلق", "imefungwa"],
  ["Closed", "Fermé", "مغلق", "Imefungwa"],
  ["open", "ouvert", "مفتوح", "wazi"],
  ["Open", "Ouvrir", "فتح", "Fungua"],
  ["in progress", "en cours", "قيد التنفيذ", "inaendelea"],
  ["high", "élevé", "مرتفع", "juu"],
  ["High", "Élevé", "مرتفع", "Juu"],
  ["low", "faible", "منخفض", "chini"],
  ["Low", "Faible", "منخفض", "Chini"],
  ["medium", "moyen", "متوسط", "wastani"],
  ["Medium", "Moyen", "متوسط", "Wastani"],
  ["Loading verification options…", "Chargement des options de vérification…", "جاري تحميل خيارات التحقق…", "Inapakia chaguo za uthibitisho…"],
  ["Book now", "Réserver", "احجز الآن", "Weka sasa"],
  ["Book appointment", "Prendre rendez-vous", "حجز موعد", "Weka miadi"],
  ["Select a service", "Choisir un service", "اختر خدمة", "Chagua huduma"],
  ["Book", "Réserver", "حجز", "Weka"],
  ["Booked", "Réservé", "محجوز", "Imewekwa"],
  ["Call", "Appeler", "اتصال", "Piga simu"],
  ["Chat", "Discussion", "محادثة", "Soga"],
  ["Chats", "Discussions", "المحادثات", "Soga"],
  ["Skip", "Passer", "تخطي", "Ruka"],
  ["View", "Voir", "عرض", "Angalia"],
  ["Like", "J’aime", "إعجاب", "Penda"],
  ["Link", "Lien", "رابط", "Kiungo"],
  ["Free", "Gratuit", "مجاني", "Bure"],
  ["Paid", "Payé", "مدفوع", "Imelipwa"],
  ["paid", "payé", "مدفوع", "imelipwa"],
  ["Ready", "Prêt", "جاهز", "Tayari"],
  ["Reply", "Répondre", "رد", "Jibu"],
  ["Reset", "Réinitialiser", "إعادة تعيين", "Weka upya"],
  ["Pause", "Pause", "إيقاف مؤقت", "Sitisha"],
  ["Paused", "En pause", "متوقف مؤقتًا", "Imesimamishwa"],
  ["Resume", "Reprendre", "استئناف", "Endelea"],
  ["Reject", "Refuser", "رفض", "Kataa"],
  ["Redeem", "Utiliser", "استرداد", "Komboa"],
  ["Resend", "Renvoyer", "إعادة الإرسال", "Tuma tena"],
  ["Verify", "Vérifier", "تحقق", "Thibitisha"],
  ["Create", "Créer", "إنشاء", "Unda"],
  ["Finish", "Terminer", "إنهاء", "Maliza"],
  ["Expand", "Développer", "توسيع", "Panua"],
  ["Later", "Plus tard", "لاحقًا", "Baadaye"],
  ["Leave", "Quitter", "مغادرة", "Ondoka"],
  ["Block", "Bloquer", "حظر", "Zuia"],
  ["Board", "Tableau", "لوحة", "Bodi"],
  ["Boards", "Tableaux", "لوحات", "Bodi"],
  ["Posts", "Publications", "المنشورات", "Machapisho"],
  ["Post", "Publication", "منشور", "Chapisho"],
  ["Photos", "Photos", "الصور", "Picha"],
  ["Camera", "Appareil photo", "الكاميرا", "Kamera"],
  ["Unread", "Non lu", "غير مقروء", "Haijasomwa"],
  ["urgent", "urgent", "عاجل", "haraka"],
  ["Urgent", "Urgent", "عاجل", "Haraka"],
  ["Weekly", "Hebdomadaire", "أسبوعي", "Kila wiki"],
  ["Newest", "Plus récent", "الأحدث", "Mpya zaidi"],
  ["Lowest", "Le plus bas", "الأدنى", "Ya chini kabisa"],
  ["Highest", "Le plus élevé", "الأعلى", "Ya juu kabisa"],
  ["Select", "Sélectionner", "اختيار", "Chagua"],
  ["Top up", "Recharger", "شحن", "Ongeza salio"],
  ["Travel", "Déplacement", "تنقل", "Usafiri"],
  ["Where?", "Où ?", "أين؟", "Wapi?"],
  ["Shop", "Boutique", "المتجر", "Duka"],
  ["Item", "Article", "عنصر", "Kipengee"],
  ["Items", "Articles", "العناصر", "Vipengee"],
  ["Keep", "Conserver", "الاحتفاظ", "Weka"],
  ["Sent", "Envoyé", "تم الإرسال", "Imetumwa"],
  ["Spam", "Indésirable", "بريد مزعج", "Barua taka"],
  ["User", "Utilisateur", "مستخدم", "Mtumiaji"],
  ["Work", "Travail", "العمل", "Kazi"],
  ["Year", "Année", "السنة", "Mwaka"],
  ["Month", "Mois", "الشهر", "Mwezi"],
  ["Day", "Jour", "يوم", "Siku"],
  ["Today", "Aujourd’hui", "اليوم", "Leo"],
  ["Monday", "Lundi", "الاثنين", "Jumatatu"],
  ["Friday", "Vendredi", "الجمعة", "Ijumaa"],
  ["Sunday", "Dimanche", "الأحد", "Jumapili"],
  ["Body", "Corps", "الجسم", "Mwili"],
  ["Hair", "Cheveux", "الشعر", "Nywele"],
  ["Nails", "Ongles", "الأظافر", "Kucha"],
  ["Spa", "Spa", "سبا", "Spa"],
  ["Makeup", "Maquillage", "مكياج", "Makeup"],
  ["Barber", "Barbier", "حلاق", "Kinyozi"],
  ["Facial", "Soin du visage", "عناية بالوجه", "Facial"],
  ["Lashes", "Cils", "الرموش", "Kopeco"],
  ["Waxing", "Épilation", "إزالة الشعر", "Kuondoa nywele"],
  ["Braids", "Tresses", "ضفائر", "Suka"],
  ["Brows", "Sourcils", "الحواجب", "Nyusi"],
  ["Salon", "Salon", "صالون", "Saluni"],
  ["Failed", "Échec", "فشل", "Imeshindwa"],
  ["failed", "échec", "فشل", "imeshindwa"],
  ["Copied", "Copié", "تم النسخ", "Imenakiliwa"],
  ["Coupon", "Coupon", "قسيمة", "Kuponi"],
  ["Earned", "Gagné", "مكتسب", "Imepatikana"],
  ["Rating", "Note", "التقييم", "Ukadiriaji"],
  ["Review", "Avis", "تقييم", "Tathmini"],
  ["Result", "Résultat", "النتيجة", "Matokeo"],
  ["Rotate", "Pivoter", "تدوير", "Zungusha"],
  ["System", "Système", "النظام", "Mfumo"],
  ["Access", "Accès", "الوصول", "Ufikiaji"],
  ["Add-on", "Option", "إضافة", "Kiongezeo"],
  ["Add-ons", "Options", "إضافات", "Viongezeo"],
  ["Offer", "Offre", "عرض", "Ofa"],
  ["Terms", "Conditions", "الشروط", "Masharti"],
  ["Label", "Libellé", "التسمية", "Lebo"],
  ["Light", "Clair", "فاتح", "Mwanga"],
  ["Dark", "Sombre", "داكن", "Giza"],
  ["Normal", "Normal", "عادي", "Kawaida"],
  ["Luxury", "Luxe", "فاخر", "Anasa"],
  ["Market", "Marché", "السوق", "Soko"],
  ["Mature", "Mature", "ناضج", "Ukomavu"],
  ["minute", "minute", "دقيقة", "dakika"],
  ["Taken", "Pris", "محجوز", "Imechukuliwa"],
  ["Vegan", "Végane", "نباتي", "Mboga"],
  ["Pets", "Animaux", "حيوانات أليفة", "Wanyama"],
  ["Max", "Max", "الحد الأقصى", "Upeo"],
  ["Min", "Min", "الحد الأدنى", "Chini"],
  ["and", "et", "و", "na"],
  ["or", "ou", "أو", "au"],
  ["you", "vous", "أنت", "wewe"],
  ["You", "Vous", "أنت", "Wewe"],
  ["For:", "Pour :", "لـ:", "Kwa:"],
  ["less", "moins", "أقل", "chache"],
  ["Me", "Moi", "أنا", "Mimi"],
  ["<1h", "<1 h", "<1 س", "<1 saa"],
  ["Dry", "Sec", "جاف", "Kavu"],
  ["Oily", "Gras", "دهني", "Mafuta"],
  ["Thin", "Fin", "رفيع", "Nyembamba"],
  ["Thick", "Épais", "كثيف", "Nene"],
  ["Wavy", "Ondulé", "مموج", "Mawimbi"],
  ["Curly", "Bouclé", "مجعد", "Kinked"],
  ["Coily", "Très bouclé", "حلزوني", "Vilima"],
  ["Dyes", "Colorations", "صبغات", "Rangi"],
  ["Latex", "Latex", "لاتكس", "Lateksi"],
  ["Nickel", "Nickel", "نيكل", "Nikeli"],
  ["Floor", "Étage", "الطابق", "Ghorofa"],
  ["Soon", "Bientôt", "قريبًا", "Hivi karibuni"],
  [" soon", " bientôt", " قريبًا", " hivi karibuni"],
  [", and", " et", " و", " na"],
]);

/** Longest-first phrase glossary. */
const PHRASES = [
  ["phone number", "numéro de téléphone", "رقم الهاتف", "nambari ya simu"],
  ["email address", "adresse e-mail", "عنوان البريد الإلكتروني", "anwani ya barua pepe"],
  ["verification code", "code de vérification", "رمز التحقق", "msimbo wa uthibitisho"],
  ["gift card", "carte cadeau", "بطاقة هدايا", "kadi ya zawadi"],
  ["payment method", "moyen de paiement", "طريقة الدفع", "njia ya malipo"],
  ["credit card", "carte bancaire", "بطاقة ائتمان", "kadi ya mkopo"],
  ["sign out", "se déconnecter", "تسجيل الخروج", "toka"],
  ["sign in", "se connecter", "تسجيل الدخول", "ingia"],
  ["log in", "se connecter", "تسجيل الدخول", "ingia"],
  ["log out", "se déconnecter", "تسجيل الخروج", "toka"],
  ["sign up", "s’inscrire", "إنشاء حساب", "jisajili"],
  ["create account", "créer un compte", "إنشاء حساب", "unda akaunti"],
  ["forgot password", "mot de passe oublié", "نسيت كلمة المرور", "umesahau nenosiri"],
  ["reset password", "réinitialiser le mot de passe", "إعادة تعيين كلمة المرور", "weka nenosiri upya"],
  ["change password", "modifier le mot de passe", "تغيير كلمة المرور", "badilisha nenosiri"],
  ["full name", "nom complet", "الاسم الكامل", "jina kamili"],
  ["date of birth", "date de naissance", "تاريخ الميلاد", "tarehe ya kuzaliwa"],
  ["current location", "position actuelle", "الموقع الحالي", "eneo la sasa"],
  ["saved addresses", "adresses enregistrées", "العناوين المحفوظة", "anwani zilizohifadhiwa"],
  ["use current location", "utiliser la position actuelle", "استخدام الموقع الحالي", "tumia eneo la sasa"],
  ["drop pin on map", "placer une épingle sur la carte", "إسقاط دبوس على الخريطة", "weka pini kwenye ramani"],
  ["add to cart", "ajouter au panier", "أضف إلى السلة", "ongeza kwenye kikapu"],
  ["go to cart", "aller au panier", "الذهاب إلى السلة", "nenda kwenye kikapu"],
  ["save changes", "enregistrer les modifications", "حفظ التغييرات", "hifadhi mabadiliko"],
  ["try again", "réessayer", "حاول مرة أخرى", "jaribu tena"],
  ["please try again", "veuillez réessayer", "يرجى المحاولة مرة أخرى", "tafadhali jaribu tena"],
  ["something went wrong", "une erreur s’est produite", "حدث خطأ ما", "kuna tatizo limetokea"],
  ["no results found", "aucun résultat", "لا توجد نتائج", "hakuna matokeo"],
  ["contact support", "contacter l’assistance", "التواصل مع الدعم", "wasiliana na msaada"],
  ["learn more", "en savoir plus", "معرفة المزيد", "jifunze zaidi"],
  ["view all", "tout voir", "عرض الكل", "angalia zote"],
  ["show more", "afficher plus", "عرض المزيد", "onyesha zaidi"],
  ["show less", "afficher moins", "عرض أقل", "onyesha kidogo"],
  ["select all", "tout sélectionner", "تحديد الكل", "chagua zote"],
  ["group booking", "réservation de groupe", "حجز جماعي", "uhifadhi wa kikundi"],
  ["travel fee", "frais de déplacement", "رسوم التنقل", "ada ya usafiri"],
  ["service fee", "frais de service", "رسوم الخدمة", "ada ya huduma"],
  ["approx. price", "prix indicatif", "سعر تقريبي", "bei ya makadirio"],
  ["running late", "en retard", "متأخر", "nimechelewa"],
  ["close out", "clôture", "إغلاق اليوم", "funga siku"],
  ["beauty professional", "professionnel beauté", "محترف تجميل", "mtaalamu wa urembo"],
  ["beauty professionals", "professionnels beauté", "محترفو التجميل", "wataalamu wa urembo"],
  ["beauty services", "services beauté", "خدمات التجميل", "huduma za urembo"],
  ["mobile pro", "pro mobile", "محترف متنقل", "mtaalamu wa simu"],
  ["mobile pros", "pros mobiles", "محترفون متنقلون", "wataalamu wa simu"],
  ["card machine", "terminal de carte", "جهاز البطاقة", "mashine ya kadi"],
  ["walk-in sale", "vente sans rendez-vous", "بيع بدون موعد", "mauzo ya moja kwa moja"],
  ["out of stock", "rupture de stock", "نفد المخزون", "haipatikani stokini"],
  ["in stock", "en stock", "متوفر", "ipo stokini"],
  ["low stock", "stock bas", "مخزون منخفض", "stoki ndogo"],
  ["save changes", "enregistrer les modifications", "حفظ التغييرات", "hifadhi mabadiliko"],
  ["search results", "résultats de recherche", "نتائج البحث", "matokeo ya utafutaji"],
  ["account settings", "réglages du compte", "إعدادات الحساب", "mipangilio ya akaunti"],
  ["privacy policy", "politique de confidentialité", "سياسة الخصوصية", "sera ya faragha"],
  ["terms of service", "conditions d’utilisation", "شروط الخدمة", "masharti ya huduma"],
  ["terms and conditions", "conditions générales", "الشروط والأحكام", "sheria na masharti"],
  ["help centre", "centre d’aide", "مركز المساعدة", "kituo cha msaada"],
  ["help center", "centre d’aide", "مركز المساعدة", "kituo cha msaada"],
  ["learning center", "centre d’apprentissage", "مركز التعلم", "kituo cha kujifunza"],
  ["not found", "introuvable", "غير موجود", "haijapatikana"],
  ["coming soon", "bientôt disponible", "قريبًا", "inakuja hivi karibuni"],
  ["failed to", "impossible de", "تعذر", "imeshindwa"],
  ["could not", "impossible de", "تعذر", "imeshindwa"],
  ["please enter", "veuillez saisir", "يرجى إدخال", "tafadhali weka"],
  ["please select", "veuillez sélectionner", "يرجى الاختيار", "tafadhali chagua"],
].sort((a, b) => b[0].length - a[0].length);

const WORDS = [
  ["booking", "réservation", "حجز", "uhifadhi"],
  ["bookings", "réservations", "حجوزات", "uhifadhi"],
  ["provider", "prestataire", "مزود الخدمة", "mtoa huduma"],
  ["providers", "prestataires", "مزودو الخدمة", "watoa huduma"],
  ["customer", "client", "عميل", "mteja"],
  ["customers", "clients", "عملاء", "wateja"],
  ["salon", "salon", "صالون", "saluni"],
  ["salons", "salons", "صالونات", "saluni"],
  ["service", "service", "خدمة", "huduma"],
  ["services", "services", "خدمات", "huduma"],
  ["appointment", "rendez-vous", "موعد", "miadi"],
  ["appointments", "rendez-vous", "مواعيد", "miadi"],
  ["payment", "paiement", "دفع", "malipo"],
  ["payments", "paiements", "مدفوعات", "malipo"],
  ["refund", "remboursement", "استرداد", "rejesho"],
  ["cancel", "annuler", "إلغاء", "ghairi"],
  ["cancelled", "annulé", "ملغى", "imeghairiwa"],
  ["confirm", "confirmer", "تأكيد", "thibitisha"],
  ["confirmed", "confirmé", "مؤكد", "imethibitishwa"],
  ["pending", "en attente", "قيد الانتظار", "inasubiri"],
  ["complete", "terminer", "إكمال", "kamilisha"],
  ["completed", "terminé", "مكتمل", "imekamilika"],
  ["save", "enregistrer", "حفظ", "hifadhi"],
  ["saved", "enregistré", "محفوظ", "imehifadhiwa"],
  ["delete", "supprimer", "حذف", "futa"],
  ["edit", "modifier", "تعديل", "hariri"],
  ["add", "ajouter", "إضافة", "ongeza"],
  ["remove", "retirer", "إزالة", "ondoa"],
  ["search", "rechercher", "بحث", "tafuta"],
  ["filter", "filtrer", "تصفية", "chuja"],
  ["sort", "trier", "ترتيب", "panga"],
  ["update", "mettre à jour", "تحديث", "sasisha"],
  ["updated", "mis à jour", "محدّث", "imesasishwa"],
  ["create", "créer", "إنشاء", "unda"],
  ["created", "créé", "تم الإنشاء", "imeundwa"],
  ["manage", "gérer", "إدارة", "simamia"],
  ["settings", "réglages", "إعدادات", "mipangilio"],
  ["notification", "notification", "إشعار", "arifa"],
  ["notifications", "notifications", "إشعارات", "arifa"],
  ["message", "message", "رسالة", "ujumbe"],
  ["messages", "messages", "رسائل", "ujumbe"],
  ["review", "avis", "تقييم", "tathmini"],
  ["reviews", "avis", "تقييمات", "tathmini"],
  ["order", "commande", "طلب", "agizo"],
  ["orders", "commandes", "طلبات", "maagizo"],
  ["product", "produit", "منتج", "bidhaa"],
  ["products", "produits", "منتجات", "bidhaa"],
  ["wallet", "portefeuille", "محفظة", "pochi"],
  ["address", "adresse", "عنوان", "anwani"],
  ["addresses", "adresses", "عناوين", "anwani"],
  ["location", "lieu", "موقع", "mahali"],
  ["locations", "lieux", "مواقع", "maeneo"],
  ["profile", "profil", "ملف شخصي", "wasifu"],
  ["password", "mot de passe", "كلمة المرور", "nenosiri"],
  ["email", "e-mail", "بريد إلكتروني", "barua pepe"],
  ["phone", "téléphone", "هاتف", "simu"],
  ["name", "nom", "اسم", "jina"],
  ["date", "date", "تاريخ", "tarehe"],
  ["time", "heure", "وقت", "muda"],
  ["status", "statut", "حالة", "hali"],
  ["price", "prix", "سعر", "bei"],
  ["total", "total", "الإجمالي", "jumla"],
  ["discount", "réduction", "خصم", "punguzo"],
  ["required", "obligatoire", "مطلوب", "inahitajika"],
  ["optional", "facultatif", "اختياري", "si lazima"],
  ["available", "disponible", "متاح", "inapatikana"],
  ["unavailable", "indisponible", "غير متاح", "haipatikani"],
  ["verified", "vérifié", "موثّق", "imethibitishwa"],
  ["loading", "chargement", "جاري التحميل", "inapakia"],
  ["error", "erreur", "خطأ", "hitilafu"],
  ["success", "succès", "نجاح", "imefaulu"],
  ["failed", "échec", "فشل", "imeshindwa"],
  ["retry", "réessayer", "إعادة المحاولة", "jaribu tena"],
  ["back", "retour", "رجوع", "rudi"],
  ["next", "suivant", "التالي", "ifuatayo"],
  ["done", "terminé", "تم", "imekamilika"],
  ["close", "fermer", "إغلاق", "funga"],
  ["open", "ouvrir", "فتح", "fungua"],
  ["yes", "oui", "نعم", "ndiyo"],
  ["no", "non", "لا", "hapana"],
  ["submit", "envoyer", "إرسال", "wasilisha"],
  ["apply", "appliquer", "تطبيق", "tumia"],
  ["clear", "effacer", "مسح", "futa"],
  ["today", "aujourd’hui", "اليوم", "leo"],
  ["tomorrow", "demain", "غدًا", "kesho"],
  ["yesterday", "hier", "أمس", "jana"],
  ["minutes", "minutes", "دقائق", "dakika"],
  ["minute", "minute", "دقيقة", "dakika"],
  ["hours", "heures", "ساعات", "saa"],
  ["hour", "heure", "ساعة", "saa"],
  ["days", "jours", "أيام", "siku"],
  ["day", "jour", "يوم", "siku"],
  ["week", "semaine", "أسبوع", "wiki"],
  ["month", "mois", "شهر", "mwezi"],
  ["year", "année", "سنة", "mwaka"],
];

function localeIndex(locale) {
  return locale === "fr" ? 1 : locale === "ar" ? 2 : 3;
}

function applyLongest(str, table, locale) {
  const idx = localeIndex(locale);
  let out = str;
  for (const row of table) {
    const en = row[0];
    const tr = row[idx];
    if (!en || !tr) continue;
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const starts = /^\w/.test(en);
    const ends = /\w$/.test(en);
    const re = new RegExp(`${starts ? "\\b" : ""}${escaped}${ends ? "\\b" : ""}`, "gi");
    out = out.replace(re, (match) => preserveCase(match, tr));
  }
  return out;
}

function wordCount(s) {
  return (String(s).match(/[A-Za-z\u00C0-\u024F']+/g) || []).length;
}

function preserveCase(src, dest) {
  if (src === src.toUpperCase() && src.length > 1) return dest.toUpperCase();
  if (src[0] === src[0].toUpperCase()) {
    return dest.charAt(0).toUpperCase() + dest.slice(1);
  }
  return dest;
}

function applyPatterns(en, locale, recurse) {
  const idx = localeIndex(locale);
  const patterns = [
    [
      /^Failed to (.+)$/i,
      ["Impossible de $1", "تعذر $1", "Imeshindwa $1"],
    ],
    [
      /^Could not (.+)$/i,
      ["Impossible de $1", "تعذر $1", "Imeshindwa $1"],
    ],
    [
      /^No (.+) yet$/i,
      ["Pas encore de $1", "لا يوجد $1 بعد", "Hakuna $1 bado"],
    ],
    [
      /^(.+) not found\.?$/i,
      ["$1 introuvable", "$1 غير موجود", "$1 haijapatikana"],
    ],
    [
      /^(.+) failed\.?$/i,
      ["Échec : $1", "فشل $1", "$1 imeshindwa"],
    ],
    [
      /^Add (.+)$/i,
      ["Ajouter $1", "إضافة $1", "Ongeza $1"],
    ],
    [
      /^Edit (.+)$/i,
      ["Modifier $1", "تعديل $1", "Hariri $1"],
    ],
    [
      /^Delete (.+)$/i,
      ["Supprimer $1", "حذف $1", "Futa $1"],
    ],
    [
      /^Save (.+)$/i,
      ["Enregistrer $1", "حفظ $1", "Hifadhi $1"],
    ],
    [
      /^Select (.+)$/i,
      ["Sélectionner $1", "اختيار $1", "Chagua $1"],
    ],
    [
      /^Search (.+)$/i,
      ["Rechercher $1", "بحث $1", "Tafuta $1"],
    ],
    [
      /^Manage (.+)$/i,
      ["Gérer $1", "إدارة $1", "Simamia $1"],
    ],
    [
      /^View (.+)$/i,
      ["Voir $1", "عرض $1", "Angalia $1"],
    ],
    [
      /^Enter (.+)$/i,
      ["Saisir $1", "أدخل $1", "Weka $1"],
    ],
    [
      /^Loading (.+)$/i,
      ["Chargement de $1", "جاري تحميل $1", "Inapakia $1"],
    ],
    [
      /^(.+) required\.?$/i,
      ["$1 obligatoire", "$1 مطلوب", "$1 inahitajika"],
    ],
  ];
  for (const [re, tpls] of patterns) {
    const m = en.match(re);
    if (!m) continue;
    const inner = recurse(m[1], locale);
    return tpls[idx - 1].replace("$1", inner);
  }
  return null;
}

export function translate(en, locale, depth = 0) {
  if (typeof en !== "string") return en;
  if (isIdentity(en)) return en;
  const exact = EXACT.get(en);
  if (exact?.[locale]) return exact[locale];
  const ci = EXACT.get(en.trim());
  if (ci?.[locale]) return ci[locale];

  if (depth > 4) return en;

  // Patterns run on the original string so {{vars}} stay intact in captures.
  const patterned = applyPatterns(en, locale, (inner, loc) => translate(inner, loc, depth + 1));
  if (patterned) {
    const enVars = extractVars(en);
    const locVars = extractVars(patterned);
    let ok = true;
    for (const v of enVars) if (!locVars.has(v)) ok = false;
    if (ok) return patterned;
  }

  const { out: protectedStr, tokens } = protectTokens(en);
  let out = applyLongest(protectedStr, PHRASES, locale);
  // Single-word swaps only on short strings — longer copy stays English unless mapped.
  if (wordCount(en) <= 6) {
    out = applyLongest(out, WORDS, locale);
  }
  return restoreTokens(out, tokens);
}

export function loadExternalMaps(mapDir, fs, path) {
  if (!fs.existsSync(mapDir)) return;
  const files = fs
    .readdirSync(mapDir)
    .filter((f) => f.startsWith("t-") && f.endsWith(".json") && f !== "t-mobile-fr-ar.json")
    .sort();
  for (const file of files) {
    const chunk = JSON.parse(fs.readFileSync(path.join(mapDir, file), "utf8"));
    for (const [en, row] of Object.entries(chunk)) {
      if (!row || typeof row !== "object") continue;
      const cur = EXACT.get(en) || {};
      EXACT.set(en, {
        fr: typeof row.fr === "string" ? row.fr : cur.fr,
        ar: typeof row.ar === "string" ? row.ar : cur.ar,
        sw: typeof row.sw === "string" ? row.sw : cur.sw,
      });
    }
  }
}

/** Load mobile phrase map (fr/ar only) into EXACT. */
export function loadFrArMobileMaps(mapDir, fs, path) {
  const file = path.join(mapDir, "t-mobile-fr-ar.json");
  if (!fs.existsSync(file)) return;
  const chunk = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [en, row] of Object.entries(chunk)) {
    if (!row || typeof row !== "object") continue;
    const cur = EXACT.get(en) || {};
    EXACT.set(en, {
      fr: typeof row.fr === "string" ? row.fr : cur.fr,
      ar: typeof row.ar === "string" ? row.ar : cur.ar,
      sw: cur.sw,
    });
  }
}
