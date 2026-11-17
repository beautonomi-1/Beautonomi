type YocoSettings = {
  isEnabled: boolean;
  publicKey: string | null;
  connectedDate: string | null;
  platformEnabled: boolean;
};

type PaystackTerminalSettings = {
  isEnabled: boolean;
  platformEnabled: boolean;
  accepted: boolean;
  selectable: boolean;
  terminals: unknown[];
  selectableTerminals: unknown[];
  activeTerminalCount: number;
};

export type ProviderPaymentSettingsView = {
  vatNumber: string | null;
  yoco: YocoSettings;
  paystackTerminal: PaystackTerminalSettings;
};

/** Checkout flags stay. The VAT number and live terminal codes do not. */
export function redactProviderPaymentSettings<T extends ProviderPaymentSettingsView>(
  settings: T,
  access: { canCollectCard: boolean; canSeeVatNumber: boolean },
): T {
  const next: T = {
    ...settings,
    vatNumber: access.canSeeVatNumber ? settings.vatNumber : null,
  };
  if (!access.canCollectCard) {
    next.yoco = { ...settings.yoco, publicKey: null };
    next.paystackTerminal = {
      ...settings.paystackTerminal,
      isEnabled: false,
      selectable: false,
      terminals: [],
      selectableTerminals: [],
      activeTerminalCount: 0,
    };
  }
  return next;
}
