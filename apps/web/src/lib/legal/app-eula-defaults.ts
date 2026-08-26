/** Default EULA body when CMS slug has no sections (App Store review-stable fallback). */

export const PARTNER_EULA_LAST_UPDATED = "26 August 2026";
export const CUSTOMER_EULA_LAST_UPDATED = "26 August 2026";

export const PARTNER_EULA_VERSION = "2026-08-26";
export const CUSTOMER_EULA_VERSION = "2026-08-26";

export type EulaSection = { title: string; content: string };

export const PARTNER_EULA_DEFAULT_SECTIONS: EulaSection[] = [
  {
    title: "License",
    content:
      "<p>We grant you a limited, non-exclusive, non-transferable, revocable license to install and use the Beautonomi Partner app solely to operate your beauty or wellness business on the Beautonomi platform. You may not copy, modify, reverse engineer, resell, or sublicense the app.</p>",
  },
  {
    title: "Eligibility",
    content:
      "<p>The app is a business tool for professionals aged <strong>18 or older</strong>. You represent that you have authority to bind your business and that information you provide is accurate.</p>",
  },
  {
    title: "Accounts and security",
    content:
      "<p>You are responsible for safeguarding login credentials and activity under your account. Notify us promptly of unauthorized access. We may suspend or terminate accounts that violate this EULA.</p>",
  },
  {
    title: "Auto-renewable subscriptions and In-App Purchases",
    content:
      "<p>Certain digital features require a paid auto-renewable subscription (e.g., Growth, Scale) or consumable In-App Purchases (e.g., paid advertising credits), processed through Apple In-App Purchase on iOS.</p><ul><li>Payment is charged to your Apple ID at confirmation of purchase.</li><li>Subscriptions renew automatically unless you cancel at least <strong>24 hours</strong> before the end of the current billing period.</li><li>Manage or cancel in Apple ID → Subscriptions.</li><li>Plan names, duration, and price are shown in the app before you confirm purchase.</li></ul>",
  },
  {
    title: "In-person payments (not Apple IAP)",
    content:
      "<p>Payments you collect in person for salon services, retail products, or terminal/POS transactions are separate from Apple In-App Purchases and are governed by your agreements with payment processors and applicable law.</p>",
  },
  {
    title: "User-generated content and community standards",
    content:
      "<p>The app includes features that allow you and your clients to create or share content, including messages, reviews, profile/catalogue media, and social/explore posts.</p><p><strong>Zero tolerance:</strong> There is no tolerance for objectionable content or abusive users. You must not upload, send, or share content that is illegal, harassing, hateful, threatening, sexually explicit, exploitative, fraudulent, spam, or otherwise harmful.</p><p>We may remove or hide objectionable content and suspend or permanently terminate accounts that violate these standards.</p>",
  },
  {
    title: "Content moderation, reporting, and response time",
    content:
      "<p>We provide content filtering controls, report content on posts/comments/messages, report a user, and block users. We review reports and aim to act within <strong>24 hours</strong> by removing or restricting content and, where appropriate, ejecting (suspending or banning) the offending user.</p>",
  },
  {
    title: "Blocking",
    content:
      "<p>You may block other users. Blocked users cannot interact with you through blocked channels as implemented in the app.</p>",
  },
  {
    title: "Privacy and tracking",
    content:
      '<p>See our <a href="/privacy-policy">Privacy Policy</a>. On iOS, the app may ask for permission to track activity across other companies’ apps and websites for campaign attribution (App Tracking Transparency). You may decline; core business features still work.</p>',
  },
  {
    title: "Acceptable use",
    content:
      "<p>You will not misuse the app, interfere with other users, scrape data, circumvent security, or use the app for unlawful discrimination or unsafe services.</p>",
  },
  {
    title: "Disclaimers and limitation of liability",
    content:
      "<p>The app is provided “as is” to the extent permitted by law. To the maximum extent permitted by law, Beautonomi is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the app.</p>",
  },
  {
    title: "Changes and contact",
    content:
      "<p>We may update this EULA. Material changes will be posted at this URL with a revised “Last updated” date. Questions: use in-app support or visit beautonomi.com.</p><p><strong>Apple note:</strong> This EULA is between you and Beautonomi, not Apple. Apple is not responsible for the app or its content.</p>",
  },
];

export const CUSTOMER_EULA_DEFAULT_SECTIONS: EulaSection[] = [
  {
    title: "Agreement",
    content:
      "<p>These terms govern your use of the Beautonomi customer app and marketplace services. By creating an account, signing in, or using the app, you agree to this End User License Agreement and our Privacy Policy.</p>",
  },
  {
    title: "Eligibility and age assurance",
    content:
      "<p>You must meet the minimum age required in your region to use social features (13+ where applicable). Date of birth and age bands may be used to enforce safety settings. Parental controls are available after sign-in under Safety &amp; parental controls.</p>",
  },
  {
    title: "User-generated content and community standards",
    content:
      "<p>The app includes reviews, Explore posts, comments, profile content, and messaging.</p><p><strong>Zero tolerance:</strong> There is no tolerance for objectionable content or abusive users. You must not post or send illegal, harassing, hateful, threatening, sexually explicit, exploitative, fraudulent, spam, or otherwise harmful content.</p>",
  },
  {
    title: "Content moderation, reporting, and response time",
    content:
      "<p>We provide parental controls (restricted mode, hide social feed, disable messaging/comments, sensitive content filter), report content, report users, and block users. We aim to act on reports within <strong>24 hours</strong> by removing or restricting content and ejecting offenders where appropriate.</p>",
  },
  {
    title: "Blocking",
    content:
      "<p>You may block other users. Blocked users cannot interact with you through blocked channels as implemented in the app.</p>",
  },
  {
    title: "Privacy and tracking",
    content:
      '<p>See our <a href="/privacy-policy">Privacy Policy</a>. On iOS, the app may request App Tracking Transparency for campaign attribution. You may decline; core features still work.</p>',
  },
  {
    title: "Bookings and payments",
    content:
      "<p>Service bookings and in-salon payments are subject to provider terms and applicable consumer law. Digital marketplace features are described in-app before purchase where applicable.</p>",
  },
  {
    title: "Changes and contact",
    content:
      "<p>We may update this EULA. Material changes will be posted here with a revised date. Contact us via in-app support or beautonomi.com.</p><p><strong>Apple note:</strong> This EULA is between you and Beautonomi, not Apple.</p>",
  },
];
