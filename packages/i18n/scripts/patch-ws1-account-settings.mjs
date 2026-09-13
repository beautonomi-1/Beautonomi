#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function patch(rel, pairs, hook) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, "utf8");
  if (hook) s = hook(s);
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) { s = s.split(from).join(to); n++; }
  }
  fs.writeFileSync(p, s);
  console.log(`${rel}: ${n}`);
}

const hook = (s) => {
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { toast } from "sonner";',
      'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace(
      "export function PersonalInfoClient",
      "export function PersonalInfoClient"
    );
    s = s.replace(
      "export function PersonalInfoClient({ initial }: { initial: PersonalInfoInitialPayload }) {",
      "export function PersonalInfoClient({ initial }: { initial: PersonalInfoInitialPayload }) {\n  const { t } = useTranslation();"
    );
  }
  return s;
};

patch("apps/web/src/app/account-settings/personal-info/PersonalInfoClient.tsx", [
  ['preferredName: "Not provided"', 'preferredName: t("web.accountSettings.personalInfo.notProvided")'],
  ['governmentId: "Not provided"', 'governmentId: t("web.accountSettings.personalInfo.notProvided")'],
  ['toast.error("Please select a file to upload");', 'toast.error(t("web.accountSettings.personalInfo.selectFile"));'],
  ['toast.error("Please select a document type");', 'toast.error(t("web.accountSettings.personalInfo.selectDocType"));'],
  ['toast.error("Please select a country");', 'toast.error(t("web.accountSettings.personalInfo.selectCountry"));'],
  ['toast.success("Government ID uploaded successfully! It will be reviewed by our team.");', 'toast.success(t("web.accountSettings.personalInfo.idUploaded"));'],
  ['|| "Failed to upload Government ID"', '|| t("web.accountSettings.personalInfo.idUploadFailed")'],
  ['"We sent confirmation links to your current email and your new address. Open each link to finish the change (both may be required)."', 't("web.accountSettings.personalInfo.emailChangePending")'],
  ["preferredName: profile.preferred_name || 'Not provided'", "preferredName: profile.preferred_name || t('web.accountSettings.personalInfo.notProvided')"],
  ["phone: maskedPhone || 'Not provided'", "phone: maskedPhone || t('web.accountSettings.personalInfo.notProvided')"],
  ["governmentId: profile.government_id ? 'Provided' : (personalInfo.governmentId || 'Not provided')", "governmentId: profile.government_id ? t('web.accountSettings.personalInfo.provided') : (personalInfo.governmentId || t('web.accountSettings.personalInfo.notProvided'))"],
  ['governmentId: \'Pending verification\'', "governmentId: t('web.accountSettings.personalInfo.pendingVerification')"],
  ['toast.success("Changes saved successfully!");', 'toast.success(t("web.accountSettings.personalInfo.changesSaved"));'],
  ['|| "Failed to save changes"', '|| t("web.accountSettings.personalInfo.saveFailed")'],
  ['toast.error("An error occurred. Please try again.");', 'toast.error(t("web.accountSettings.personalInfo.errorGeneric"));'],
  ['toast.error("Enter a valid email address");', 'toast.error(t("web.accountSettings.personalInfo.enterValidEmail"));'],
  ['toast.success("Verification code sent to your email.");', 'toast.success(t("web.accountSettings.personalInfo.emailCodeSent"));'],
  ['toast.success("Email address updated successfully.");', 'toast.success(t("web.accountSettings.personalInfo.emailUpdated"));'],
  ['toast.success("Verification code sent to your phone.");', 'toast.success(t("web.accountSettings.personalInfo.phoneCodeSent"));'],
  ['toast.success("Phone number updated successfully!");', 'toast.success(t("web.accountSettings.personalInfo.phoneUpdated"));'],
  ['|| "Failed to save phone"', '|| t("web.accountSettings.personalInfo.phoneSaveFailed")'],
  ['{ label: "Account", href: "/account-settings" }', '{ label: t("web.accountSettings.account"), href: "/account-settings" }'],
  ['{ label: "Personal info" }', '{ label: t("web.accountSettings.personalInfo.title") }'],
  ['>Personal info</h1>', '>{t("web.accountSettings.personalInfo.title")}</h1>'],
  ['<p className="text-gray-600">Loading...</p>', '<p className="text-gray-600">{t("web.accountSettings.personalInfo.loading")}</p>'],
  ['label="Legal name"', 'label={t("web.accountSettings.personalInfo.legalName")}'],
  ['label="Preferred name"', 'label={t("web.accountSettings.personalInfo.preferredName")}'],
  ["personalInfo.preferredName !== 'Not provided'", "personalInfo.preferredName !== t('web.accountSettings.personalInfo.notProvided')"],
  ["personalInfo.preferredName === 'Not provided'", "personalInfo.preferredName === t('web.accountSettings.personalInfo.notProvided')"],
  ['label="Email address"', 'label={t("web.accountSettings.personalInfo.emailAddress")}'],
  ['editLabel="Change email"', 'editLabel={t("web.accountSettings.personalInfo.changeEmail")}'],
  ['label="Phone number"', 'label={t("web.accountSettings.personalInfo.phoneNumber")}'],
  ['editLabel="Change phone"', 'editLabel={t("web.accountSettings.personalInfo.changePhone")}'],
  ['>Government ID</span>', '>{t("web.accountSettings.personalInfo.governmentId")}</span>'],
  ['>Manage verification</Link>', '>{t("web.accountSettings.personalInfo.manageVerification")}</Link>'],
  ['label="Address"', 'label={t("web.accountSettings.personalInfo.address")}'],
  ["'Not provided'", "t('web.accountSettings.personalInfo.notProvided')"],
  ['label="Emergency contact"', 'label={t("web.accountSettings.personalInfo.emergencyContact")}'],
  ['title="Why isn\'t my info shown here?"', 'title={t("web.accountSettings.whyInfoHidden")}'],
  ['content="We\'re hiding some account details to protect your identity."', 'content={t("web.accountSettings.infoHiddenContent")}'],
  ['title="Which details can be edited?"', 'title={t("web.accountSettings.whichDetailsEditable")}'],
  ['content="Contact info and personal details can be edited. If this info was used to verify your identity, you\'ll need to get verified again the next time you book—or to continue beauty partner."', 'content={t("web.accountSettings.detailsEditableContent")}'],
  ['title="What info is shared with others?"', 'title={t("web.accountSettings.whatInfoShared")}'],
  ['content="Beautonomi only releases contact information for Providers and clients after a reservation is confirmed."', 'content={t("web.accountSettings.infoSharedContent")}'],
  ['editLabel = "Edit"', 'editLabel = t("web.accountSettings.personalInfo.edit")'],
  ['>Add<', '>{t("web.accountSettings.personalInfo.add")}<'],
  ['aria-label="Close"', 'aria-label={t("web.a11y.close")}'],
  ['>Cancel<', '>{t("web.accountSettings.personalInfo.cancel")}<'],
  ['>Save<', '>{t("web.accountSettings.personalInfo.save")}<'],
], hook);

// Wallet
{
  const p = path.join(root, "apps/web/src/app/account-settings/wallet/WalletPageClient.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace('import { toast } from "sonner";', 'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";');
    s = s.replace("}) {\n  const { format } = usePlatformCurrency();", "}) {\n  const { t } = useTranslation();\n  const { format } = usePlatformCurrency();");
  }
  const pairs = [
    ['toast.error("Failed to load wallet");', 'toast.error(t("web.accountSettings.wallet.loadFailed"));'],
    ['toast.success("Wallet refreshed");', 'toast.success(t("web.accountSettings.wallet.refreshed"));'],
    ['toast.error("Failed to refresh wallet");', 'toast.error(t("web.accountSettings.wallet.refreshFailed"));'],
    ['|| "Gift card added to your wallet"', '|| t("web.accountSettings.wallet.giftCardAdded")'],
    ['|| "Failed to add gift card"', '|| t("web.accountSettings.wallet.giftCardAddFailed")'],
    ['toast.error("Enter a valid amount");', 'toast.error(t("web.accountSettings.wallet.enterValidAmount"));'],
    ['toast.error("Minimum top up amount is 1");', 'toast.error(t("web.accountSettings.wallet.minTopUp"));'],
    ['toast.error("Payment link was not returned");', 'toast.error(t("web.accountSettings.wallet.paymentLinkMissing"));'],
    ['|| "Failed to start top up"', '|| t("web.accountSettings.wallet.topUpFailed")'],
    ['toast.error("Enter a gift card code");', 'toast.error(t("web.accountSettings.wallet.enterGiftCardCode"));'],
    ['|| "Gift card redeemed successfully"', '|| t("web.accountSettings.wallet.redeemSuccess")'],
    ['|| "Failed to redeem gift card"', '|| t("web.accountSettings.wallet.redeemFailed")'],
    ['{ label: "Home", href: "/" }', '{ label: t("web.accountSettings.wallet.home"), href: "/" }'],
    ['{ label: "Account Settings", href: "/account-settings" }', '{ label: t("web.accountSettings.wallet.accountSettings"), href: "/account-settings" }'],
    ['{ label: "Wallet" }', '{ label: t("web.accountSettings.wallet.title") }'],
    ['>Wallet</h1>', '>{t("web.accountSettings.wallet.title")}</h1>'],
    ['<p className="text-sm text-gray-500">Loading…</p>', '<p className="text-sm text-gray-500">{t("web.accountSettings.wallet.loading")}</p>'],
    ['>Available balance</h2>', '>{t("web.accountSettings.wallet.availableBalance")}</h2>'],
    ['>Top up / Redeem Gift Card</h2>', '>{t("web.accountSettings.wallet.topUpRedeem")}</h2>'],
    ['>Top up amount</Label>', '>{t("web.accountSettings.wallet.topUpAmount")}</Label>'],
    ['placeholder="Enter amount"', 'placeholder={t("web.accountSettings.wallet.enterAmount")}'],
    ['<span>Processing…</span>', '<span>{t("web.accountSettings.wallet.processing")}</span>'],
    ['<span>Top up with Card</span>', '<span>{t("web.accountSettings.wallet.topUpWithCard")}</span>'],
    ['<span className="bg-white/60 px-2 text-sm text-gray-500">or</span>', '<span className="bg-white/60 px-2 text-sm text-gray-500">{t("web.accountSettings.wallet.or")}</span>'],
    ['>Redeem Gift Card</Label>', '>{t("web.accountSettings.wallet.redeemGiftCard")}</Label>'],
    ['placeholder="Enter code"', 'placeholder={t("web.accountSettings.wallet.enterCode")}'],
    ['{isRedeeming ? "Redeeming…" : "Redeem"}', '{isRedeeming ? t("web.accountSettings.wallet.redeeming") : t("web.accountSettings.wallet.redeem")}'],
    ['title="No wallet transactions yet"', 'title={t("web.accountSettings.noWalletTransactions")}'],
    ['>Recent activity</h2>', '>{t("web.accountSettings.wallet.recentActivity")}</h2>'],
    ['aria-label="Refresh"', 'aria-label={t("web.accountSettings.wallet.refresh")}'],
    ['? "Credit" : "Debit"', '? t("web.accountSettings.wallet.credit") : t("web.accountSettings.wallet.debit")'],
  ];
  for (const [a,b] of pairs) if (s.includes(a)) s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log("WalletPageClient patched");
}

// Taxes
{
  const p = path.join(root, "apps/web/src/app/account-settings/taxes/TaxesPageClient.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace('import { toast } from "sonner";', 'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";');
    s = s.replace("const TaxesPage = ({ initial }", "const TaxesPage = ({ initial }");
    s = s.replace("const TaxesPage = ({ initial }: { initial: TaxesPageInitial | null }) => {", "const TaxesPage = ({ initial }: { initial: TaxesPageInitial | null }) => {\n  const { t } = useTranslation();");
  }
  const pairs = [
    ['loadingMessage="Loading tax information..."', 'loadingMessage={t("web.accountSettings.taxes.loading")}'],
    ['title="Unable to load tax information"', 'title={t("web.accountSettings.unableLoadTaxes")}'],
    ['label: "Try Again"', 'label: t("web.accountSettings.taxes.tryAgain")'],
    ['{ label: "Account", href: "/account-settings" }', '{ label: t("web.accountSettings.account"), href: "/account-settings" }'],
    ['{ label: "Taxes" }', '{ label: t("web.accountSettings.taxes.title") }'],
    ['>Taxes</h1>', '>{t("web.accountSettings.taxes.title")}</h1>'],
    ['<span className="font-medium">Coming soon:</span>', '<span className="font-medium">{t("web.accountSettings.taxes.comingSoon")}</span>'],
    ['>Taxpayers</TabsTrigger>', '>{t("web.accountSettings.taxes.taxpayers")}</TabsTrigger>'],
    ['>Tax Documents</TabsTrigger>', '>{t("web.accountSettings.taxes.taxDocuments")}</TabsTrigger>'],
    ['toast.success("Tax information saved successfully");', 'toast.success(t("web.accountSettings.taxes.saved"));'],
    ['toast.success("VAT ID saved successfully");', 'toast.success(t("web.accountSettings.taxes.vatSaved"));'],
  ];
  for (const [a,b] of pairs) if (s.includes(a)) s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log("TaxesPageClient patched");
}

// Wishlists
{
  const p = path.join(root, "apps/web/src/app/account-settings/wishlists/WishlistsPageClient.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace('import { toast } from "sonner";', 'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";');
    s = s.replace("const WishlistsPageClient = ({ initial }", "const WishlistsPageClient = ({ initial }");
    s = s.replace("const WishlistsPageClient = ({ initial }: { initial: WishlistsPageInitial | null }) => {", "const WishlistsPageClient = ({ initial }: { initial: WishlistsPageInitial | null }) => {\n  const { t } = useTranslation();");
  }
  const pairs = [
    ['>Wishlists</h2>', '>{t("web.accountSettings.wishlists.title")}</h2>'],
    ['Log in to view your wishlists', '{t("web.accountSettings.wishlists.logInTitle")}'],
    ['Log in', '{t("web.accountSettings.wishlists.logIn")}'],
    ['{ label: "Account", href: "/account-settings" }', '{ label: t("web.accountSettings.wishlists.account"), href: "/account-settings" }'],
    ['{ label: "Wishlists" }', '{ label: t("web.accountSettings.wishlists.title") }'],
    ['<p className="text-gray-600">Loading...</p>', '<p className="text-gray-600">{t("web.accountSettings.wishlists.loading")}</p>'],
    ['>Saved</h2>', '>{t("web.accountSettings.wishlists.saved")}</h2>'],
    ['loadingMessage="Loading your saved items…"', 'loadingMessage={t("web.accountSettings.wishlists.loadingSaved")}'],
    ['title="Unable to load wishlists"', 'title={t("web.accountSettings.unableLoadWishlists")}'],
    ['title="No saved items yet"', 'title={t("web.accountSettings.noSavedItems")}'],
    ['label: "Try Again"', 'label: t("web.accountSettings.wishlists.tryAgain")'],
    ['label: "Explore"', 'label: t("web.accountSettings.wishlists.explore")'],
    ['>Boards</h3>', '>{t("web.accountSettings.wishlists.boards")}</h3>'],
    ['{isCreatingBoard ? "Creating…" : "New board"}', '{isCreatingBoard ? t("web.accountSettings.wishlists.creating") : t("web.accountSettings.wishlists.newBoard")}'],
    ['>Saved posts</h3>', '>{t("web.accountSettings.wishlists.savedPosts")}</h3>'],
    ['>Add to board', '>{t("web.accountSettings.wishlists.addToBoard")'],
    ['>In board<', '>{t("web.accountSettings.wishlists.inBoard")}<'],
    ['>Saved providers</h3>', '>{t("web.accountSettings.wishlists.savedProviders")}</h3>'],
    ['>Saved products</h3>', '>{t("web.accountSettings.wishlists.savedProducts")}</h3>'],
    ['>No image<', '>{t("web.accountSettings.wishlists.noImage")}<'],
    ['>Out of stock<', '>{t("web.accountSettings.wishlists.outOfStock")}<'],
    ['>Your wishlists</h3>', '>{t("web.accountSettings.wishlists.yourWishlists")}</h3>'],
    ['>New wishlist</Button>', '>{t("web.accountSettings.wishlists.newWishlist")}</Button>'],
    ['>Default<', '>{t("web.accountSettings.wishlists.default")}<'],
  ];
  for (const [a,b] of pairs) if (s.includes(a)) s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log("WishlistsPageClient patched");
}
