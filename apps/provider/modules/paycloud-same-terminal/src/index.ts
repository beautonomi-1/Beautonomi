/**
 * TypeScript surface for the native PayCloud same-terminal module.
 * The provider app also uses NativeModules directly in paycloud-same-terminal.ts.
 */
export type PaycloudIntentContract = {
  package_name?: string;
  action?: string;
  merchant_order_no_key?: string;
  order_amount_key?: string;
  currency_key?: string;
  pay_scenario_key?: string;
  pay_method_id_key?: string;
  trans_type_key?: string;
  tip_amount_key?: string;
  cashback_amount_key?: string;
  app_id_key?: string;
};

export type PaycloudIntentPayload = {
  merchant_order_no: string;
  order_amount: string;
  price_currency: string;
  pay_scenario: string;
  pay_method_id?: string;
  trans_type?: number;
  tip_amount?: string;
  cashback_amount?: string;
  app_id?: string;
  intent_contract?: PaycloudIntentContract;
};

export type PaycloudIntentResult = {
  success: boolean;
  trans_status?: string;
  message?: string;
};
