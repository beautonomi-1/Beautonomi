/**
 * TypeScript surface for the native PayCloud same-terminal module.
 * Matches PayCloud SameTerminalAppIntegration (com.wiseasy.transaction.call).
 */
export type PaycloudIntentContract = {
  package_name?: string;
  action?: string;
  version_key?: string;
  app_id_key?: string;
  trans_type_key?: string;
  trans_data_key?: string;
};

export type PaycloudSameTerminalTransType = "PRE-INIT" | "SALE" | "CASHBACK" | "REFUND";

export type PaycloudSameTerminalPaymentScenario = "CARD" | "SCANQR" | "BSCANQR" | "CASH";

export type PaycloudSameTerminalTransData = {
  businessOrderNo: string;
  paymentScenario: PaycloudSameTerminalPaymentScenario;
  amt: string;
  tipAmount?: string;
  cashAmount?: string;
  paymentMethod?: string;
  notifyUrl?: string;
  POSMode?: string;
  note?: string;
};

export type PaycloudIntentPayload = {
  version: string;
  appId: string;
  transType: PaycloudSameTerminalTransType;
  transData: PaycloudSameTerminalTransData;
  intent_contract?: PaycloudIntentContract;
};

export type PaycloudIntentTransDataResult = {
  transactionID?: string;
  refNo?: string;
  authCode?: string;
  cardNo?: string;
  transDate?: string;
  transTime?: string;
  amt?: string;
};

export type PaycloudIntentResult = {
  success: boolean;
  result?: string;
  resultMsg?: string;
  transData?: PaycloudIntentTransDataResult | string;
  message?: string;
};

export type PaycloudDeviceSerialSource = "build_serial" | "wiseasy_property" | "android_id";

export type PaycloudDeviceInfo = {
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  serialSource: PaycloudDeviceSerialSource | null;
};
