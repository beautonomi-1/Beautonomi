export type PublicFooterLinkRow = {
  id: string;
  section: "about" | "business" | "legal" | "social" | "apps";
  title: string;
  href: string;
  display_order: number;
  is_external: boolean;
  is_active: boolean;
};

export type PublicFooterAppLinkRow = {
  id: string;
  platform: "ios" | "android";
  title: string;
  href: string;
  is_active: boolean;
};

export type PublicFooterSettingsRow = {
  social_label?: string;
  copyright_text?: string;
};

export type PublicFooterInitial = {
  links: PublicFooterLinkRow[];
  appLinks: PublicFooterAppLinkRow[];
  settings: PublicFooterSettingsRow;
};
