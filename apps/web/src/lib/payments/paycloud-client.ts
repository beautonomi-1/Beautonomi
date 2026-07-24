import {
  buildSignString,
  formatPrivateKeyPem,
  formatPublicKeyPem,
  signWithPrivateKey,
  verifyWithPublicKey,
} from "@/lib/payments/paycloud-sign";
import {
  getPaycloudApiBase,
  getPaycloudEntryPath,
  type PaycloudEnvironment,
  PAYCLOUD_TRANS_TYPE,
  PAYCLOUD_METHODS,
} from "@/lib/payments/paycloud";

export interface PaycloudAppCredentials {
  app_id: string;
  app_rsa_private_key: string;
  gateway_rsa_public_key: string;
  /** Gateway root e.g. https://addpay-open.wangtest.cn — paths are appended */
  api_base_url?: string;
}

export interface CreateOrderParams {
  merchant_no: string;
  store_no: string;
  terminal_sn: string;
  merchant_order_no: string;
  order_amount: number;
  tip_amount?: number;
  cashback_amount?: number;
  price_currency: string;
  pay_scenario: string;
  pay_method_id?: string;
  trans_type?: number;
  description?: string;
  notify_url: string;
  attach?: string;
  reject_trade_when_terminal_offline?: boolean;
  on_screen_tip?: boolean;
}

export interface PaycloudApiResponse {
  success: boolean;
  raw: Record<string, unknown>;
  response_code?: string;
  trans_status?: string;
  error_message?: string;
}

type BizValue = string | number | boolean;

/**
 * PayCloud Cloud OpenAPI: flat JSON body (not Alipay biz_content), RSA2 over
 * sorted stringified params, POST /api/entry/{ecrorder|orderquery|ecrclose}.
 * @see https://developers.paycloud.africa/docs/addpay/CloudAPI/create-order/
 */
function buildSignedBody(
  method: string,
  businessParams: Record<string, BizValue | undefined | null>,
  creds: PaycloudAppCredentials,
): Record<string, BizValue> {
  const body: Record<string, BizValue> = {
    app_id: creds.app_id,
    method,
    format: "JSON",
    charset: "UTF-8",
    sign_type: "RSA2",
    version: "1.0",
    timestamp: Date.now(),
  };

  for (const [k, v] of Object.entries(businessParams)) {
    if (v == null || v === "") continue;
    body[k] = v;
  }

  // Sign string uses string forms of all values (official RSA2 rule)
  const forSign: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    forSign[k] = String(v);
  }
  body.sign = signWithPrivateKey(buildSignString(forSign), formatPrivateKeyPem(creds.app_rsa_private_key));
  return body;
}

export function parsePaycloudResponse(raw: Record<string, unknown>): PaycloudApiResponse {
  const body = (raw.response && typeof raw.response === "object"
    ? (raw.response as Record<string, unknown>)
    : raw) as Record<string, unknown>;

  // Cloud API sync responses (orderquery, and the `code:"0"` envelope family) nest the
  // business result — `trans_status`, `order_amount`, `paid_amount`, `order_id` — inside
  // a `data` object. Merge it so callers can read those fields off `raw` and `trans_status`.
  const dataObj =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};
  const merged = { ...dataObj, ...body };

  const code = String(body.response_code ?? body.code ?? raw.response_code ?? raw.code ?? "");
  const success =
    code === "000" ||
    code === "103" ||
    code === "0" ||
    body.is_success === true ||
    raw.is_success === true;

  const msg =
    typeof body.response_msg === "string"
      ? body.response_msg
      : typeof body.msg === "string"
        ? body.msg
        : typeof raw.msg === "string"
          ? raw.msg
          : undefined;

  const transStatus =
    body.trans_status ?? dataObj.trans_status ?? raw.trans_status ?? null;

  return {
    success,
    raw: merged,
    response_code: code || undefined,
    trans_status: transStatus != null ? String(transStatus) : undefined,
    error_message: success ? undefined : msg,
  };
}

async function executePaycloudRequest(
  environment: PaycloudEnvironment,
  creds: PaycloudAppCredentials,
  entryPath: "ecrorder" | "orderquery" | "ecrclose",
  method: string,
  businessParams: Record<string, BizValue | undefined | null>,
): Promise<PaycloudApiResponse> {
  const gatewayRoot = (creds.api_base_url ?? getPaycloudApiBase(environment)).replace(/\/$/, "");
  const base = gatewayRoot.endsWith("/api/entry") ? gatewayRoot : `${gatewayRoot}/api/entry`;
  const url = `${base}/${entryPath}`;
  const body = buildSignedBody(method, businessParams, creds);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let raw: Record<string, unknown>;
  try {
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    return {
      success: false,
      raw: {},
      response_code: String(res.status),
      error_message: `Card machine service error (${res.status})`,
    };
  }

  if (typeof raw.sign === "string" && creds.gateway_rsa_public_key) {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "sign" || v == null || typeof v === "object") continue;
      flat[k] = String(v);
    }
    const ok = verifyWithPublicKey(
      buildSignString(flat),
      raw.sign,
      formatPublicKeyPem(creds.gateway_rsa_public_key),
    );
    if (!ok) {
      console.warn("[paycloud] response signature verification failed", { method, entryPath });
    }
  }

  return parsePaycloudResponse(raw);
}

export async function createPaycloudOrder(
  environment: PaycloudEnvironment,
  creds: PaycloudAppCredentials,
  params: CreateOrderParams,
): Promise<PaycloudApiResponse> {
  const business: Record<string, BizValue | undefined | null> = {
    merchant_no: params.merchant_no,
    store_no: params.store_no,
    terminal_sn: params.terminal_sn,
    message_receiving_application: "WISECASHIER",
    merchant_order_no: params.merchant_order_no,
    order_amount: params.order_amount,
    tip_amount: params.tip_amount ?? 0,
    price_currency: params.price_currency,
    pay_scenario: params.pay_scenario,
    trans_type: params.trans_type ?? PAYCLOUD_TRANS_TYPE.SALE,
    description: params.description ?? "Beautonomi payment",
    notify_url: params.notify_url,
    expires: 300,
    reject_trade_when_terminal_offline: params.reject_trade_when_terminal_offline ?? true,
    required_terminal_authentication: false,
    api_version: "2.0",
    on_screen_tip: params.on_screen_tip ?? false,
  };
  if (params.pay_method_id) business.pay_method_id = params.pay_method_id;
  if (params.cashback_amount && params.cashback_amount > 0) {
    business.cashback_amount = params.cashback_amount;
    business.trans_type = PAYCLOUD_TRANS_TYPE.SALE_WITH_CASHBACK;
  }
  if (params.attach) business.attach = params.attach;

  return executePaycloudRequest(
    environment,
    creds,
    getPaycloudEntryPath("order"),
    PAYCLOUD_METHODS.CREATE_ORDER,
    business,
  );
}

export async function queryPaycloudOrder(
  environment: PaycloudEnvironment,
  creds: PaycloudAppCredentials,
  merchant_no: string,
  merchant_order_no: string,
): Promise<PaycloudApiResponse> {
  return executePaycloudRequest(
    environment,
    creds,
    getPaycloudEntryPath("query"),
    PAYCLOUD_METHODS.QUERY_ORDER,
    { merchant_no, merchant_order_no },
  );
}

export async function closePaycloudOrder(
  environment: PaycloudEnvironment,
  creds: PaycloudAppCredentials,
  params: {
    merchant_no: string;
    store_no: string;
    terminal_sn: string;
    merchant_order_no: string;
    description?: string;
  },
): Promise<PaycloudApiResponse> {
  return executePaycloudRequest(
    environment,
    creds,
    getPaycloudEntryPath("close"),
    PAYCLOUD_METHODS.CLOSE_ORDER,
    {
      merchant_no: params.merchant_no,
      store_no: params.store_no,
      terminal_sn: params.terminal_sn,
      message_receiving_application: "WISECASHIER",
      merchant_order_no: params.merchant_order_no,
      description: params.description ?? "Cancelled by Beautonomi",
    },
  );
}

/** Void a completed capture on the card machine (trans_type=2, distinct from ecrclose). */
export async function createPaycloudVoid(
  environment: PaycloudEnvironment,
  creds: PaycloudAppCredentials,
  params: {
    merchant_no: string;
    store_no: string;
    terminal_sn: string;
    merchant_order_no: string;
    orig_merchant_order_no: string;
    order_amount: number;
    price_currency: string;
    notify_url: string;
    description?: string;
    orig_trans_no?: string;
  },
): Promise<PaycloudApiResponse> {
  const business: Record<string, BizValue | undefined | null> = {
    merchant_no: params.merchant_no,
    store_no: params.store_no,
    terminal_sn: params.terminal_sn,
    message_receiving_application: "WISECASHIER",
    merchant_order_no: params.merchant_order_no,
    orig_merchant_order_no: params.orig_merchant_order_no,
    order_amount: params.order_amount,
    price_currency: params.price_currency,
    pay_scenario: "SWIPE_CARD",
    trans_type: PAYCLOUD_TRANS_TYPE.VOID,
    description: params.description ?? "Void by Beautonomi",
    notify_url: params.notify_url,
    expires: 300,
    reject_trade_when_terminal_offline: true,
    required_terminal_authentication: false,
    api_version: "2.0",
  };
  if (params.orig_trans_no) business.orig_trans_no = params.orig_trans_no;

  return executePaycloudRequest(
    environment,
    creds,
    getPaycloudEntryPath("order"),
    PAYCLOUD_METHODS.CREATE_ORDER,
    business,
  );
}

export function verifyPaycloudWebhookSignature(
  params: Record<string, string>,
  gatewayPublicKey: string,
): boolean {
  const sign = params.sign;
  if (!sign) return false;
  return verifyWithPublicKey(
    buildSignString(params),
    sign,
    formatPublicKeyPem(gatewayPublicKey),
  );
}
