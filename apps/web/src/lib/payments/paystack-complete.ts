/**
 * Complete Paystack Integration
 * 
 * Comprehensive Paystack API integration following official documentation:
 * https://paystack.com/docs/api/
 * 
 * All endpoints, types, and utilities aligned with Paystack API requirements
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PaystackConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
}

export interface PaystackResponse<T = any> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackError {
  status: boolean;
  message: string;
  errors?: any;
}

// Transactions
export interface InitializeTransactionRequest {
  email: string;
  amount: number; // in kobo/cents
  currency?: string; // default: NGN
  reference?: string;
  callback_url?: string;
  plan?: string;
  invoice_limit?: number;
  metadata?: Record<string, any>;
  channels?: string[];
  split_code?: string;
  subaccount?: string;
  transaction_charge?: number;
  bearer?: "account" | "subaccount";
  make_reference_unique?: boolean;
}

export interface InitializeTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface Transaction {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message?: string;
  gateway_response: string;
  paid_at?: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address?: string;
  metadata?: Record<string, any>;
  log?: any;
  fees?: number;
  fees_split?: any;
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature: string;
    account_name?: string;
  };
  customer: {
    id: number;
    first_name?: string;
    last_name?: string;
    email: string;
    customer_code: string;
    phone?: string;
    metadata?: Record<string, any>;
    risk_action: string;
    international_format_phone?: string;
  };
  plan?: any;
  split?: any;
  order_id?: any;
  paidAt?: string;
  createdAt?: string;
  requested_amount: number;
  pos_transaction_data?: any;
  source?: any;
  fees_breakdown?: any;
}

// Transaction Splits
export interface CreateSplitRequest {
  name: string;
  type: "percentage" | "flat";
  currency: string;
  subaccounts: Array<{
    subaccount: string;
    share: number; // percentage or flat amount
  }>;
  bearer_type: "account" | "subaccount" | "all-proportional" | "all";
  bearer_subaccount?: string;
}

export interface Split {
  id: number;
  name: string;
  type: string;
  currency: string;
  integration: number;
  domain: string;
  split_code: string;
  active: boolean;
  bearer_type: string;
  bearer_subaccount?: string;
  created_at: string;
  updated_at: string;
  subaccounts: Array<{
    subaccount: {
      id: number;
      subaccount_code: string;
      business_name: string;
      description?: string;
      primary_contact_name?: string;
      primary_contact_email?: string;
      primary_contact_phone?: string;
      metadata?: Record<string, any>;
      percentage_charge: number;
      settlement_bank: string;
      account_number: string;
      active: boolean;
      migrate: boolean;
      is_verified: boolean;
      settlement_schedule: string;
    };
    share: number;
  }>;
  total_subaccounts: number;
}

// Customers
export interface CreateCustomerRequest {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

export interface Customer {
  id: number;
  first_name?: string;
  last_name?: string;
  email: string;
  customer_code: string;
  phone?: string;
  metadata?: Record<string, any>;
  risk_action: string;
  international_format_phone?: string;
  created_at: string;
  updated_at: string;
}

// Transfer Recipients
export interface CreateTransferRecipientRequest {
  type: "nuban" | "basa" | "mobile_money" | "barter";
  name: string;
  account_number: string;
  bank_code: string;
  currency?: string; // default: NGN
  description?: string;
  email?: string;
  metadata?: Record<string, any>;
}

export interface TransferRecipient {
  active: boolean;
  createdAt: string;
  currency: string;
  domain: string;
  id: number;
  integration: number;
  name: string;
  recipient_code: string;
  type: string;
  updatedAt: string;
  is_deleted: boolean;
  details: {
    authorization_code?: string;
    account_number: string;
    account_name: string;
    bank_code: string;
    bank_name: string;
  };
  metadata?: Record<string, any>;
  description?: string;
  email?: string;
}

// Transfers
export interface CreateTransferRequest {
  source: "balance";
  amount: number; // in kobo/cents
  recipient: string; // recipient_code
  reason?: string;
  reference?: string;
  currency?: string; // default: NGN
}

export interface Transfer {
  integration: number;
  domain: string;
  amount: number;
  currency: string;
  source: string;
  reason: string;
  recipient: number;
  status: string;
  transfer_code: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

// Subaccounts
export interface CreateSubaccountRequest {
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  metadata?: Record<string, any>;
  description?: string;
}

export interface Subaccount {
  id: number;
  subaccount_code: string;
  business_name: string;
  description?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  metadata?: Record<string, any>;
  percentage_charge: number;
  settlement_bank: string;
  account_number: string;
  active: boolean;
  migrate: boolean;
  is_verified: boolean;
  settlement_schedule: string;
  created_at: string;
  updated_at: string;
}

// Plans
export interface CreatePlanRequest {
  name: string;
  interval: "daily" | "weekly" | "monthly" | "annually" | "once";
  amount: number; // in kobo/cents
  currency?: string; // default: NGN
  description?: string;
  send_invoices?: boolean;
  send_sms?: boolean;
  hosted_page?: boolean;
  hosted_page_url?: string;
  hosted_page_summary?: string;
  metadata?: Record<string, any>;
}

export interface Plan {
  name: string;
  amount: number;
  interval: string;
  integration: number;
  domain: string;
  plan_code: string;
  send_invoices: boolean;
  send_sms: boolean;
  hosted_page: boolean;
  currency: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

// Subscriptions
export interface CreateSubscriptionRequest {
  customer: string; // customer_code or email
  plan: string; // plan_code
  authorization?: string; // authorization_code
  start_date?: string; // ISO 8601
}

export interface Subscription {
  customer: number;
  plan: number;
  integration: number;
  domain: string;
  start: number;
  status: string;
  quantity: number;
  amount: number;
  subscription_code: string;
  email_token: string;
  easy_cron_id?: any;
  cron_expression?: string;
  next_payment_date: string;
  open_invoice?: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

// Products
export interface CreateProductRequest {
  name: string;
  description?: string;
  price: number; // in kobo/cents
  currency?: string; // default: NGN
  limited?: boolean;
  quantity?: number;
}

export interface Product {
  name: string;
  description?: string;
  price: number;
  currency: string;
  limited: boolean;
  quantity?: number;
  integration: number;
  domain: string;
  product_code: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

// Payment Pages
export interface CreatePaymentPageRequest {
  name: string;
  description?: string;
  amount?: number; // in kobo/cents
  slug?: string;
  redirect_url?: string;
  custom_fields?: Array<{
    display_name: string;
    variable_name: string;
    value: string;
  }>;
}

export interface PaymentPage {
  id: number;
  domain: string;
  name: string;
  description?: string;
  amount?: number;
  currency: string;
  slug: string;
  custom_fields: any[];
  redirect_url?: string;
  success_message?: string;
}

// Payment Requests
export interface CreatePaymentRequest {
  customer: string; // customer_code or email
  amount: number; // in kobo/cents
  currency?: string; // default: NGN
  due_date?: string; // ISO 8601
  description?: string;
  line_items?: Array<{
    name: string;
    amount: number;
    quantity: number;
  }>;
  tax?: Array<{
    name: string;
    amount: number;
  }>;
  metadata?: Record<string, any>;
  send_notification?: boolean;
  draft?: boolean;
  has_invoice?: boolean;
  invoice_number?: number;
}

export interface PaymentRequest {
  id: number;
  domain: string;
  amount: number;
  currency: string;
  due_date?: string;
  has_invoice: boolean;
  invoice_number?: number;
  description?: string;
  pdf_url?: string;
  line_items: any[];
  tax: any[];
  customer: number;
  request_code: string;
  status: string;
  paid: boolean;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

// Settlements
export interface Settlement {
  id: number;
  domain: string;
  status: string;
  currency: string;
  integration: number;
  total_amount: number;
  total_fees: number;
  total_settled: number;
  total_volume: number;
  total_transactions: number;
  pending_volume: number;
  pending_transactions: number;
  processed_volume: number;
  processed_transactions: number;
  created_at: string;
  settled_by?: string;
  settled_at?: string;
}

// Disputes
export interface Dispute {
  id: number;
  domain: string;
  status: string;
  category: string;
  subcategory: string;
  amount: number;
  currency: string;
  resolved_at?: string;
  transaction: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message?: string;
    gateway_response: string;
    paid_at?: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address?: string;
    metadata?: Record<string, any>;
    log?: any;
    fees?: number;
    fees_split?: any;
    authorization: any;
    customer: any;
    plan?: any;
    split?: any;
  };
  evidence?: {
    customer_email: string;
    customer_name: string;
    customer_phone?: string;
    service_details?: string;
    delivery_address?: string;
    delivery_date?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_zipcode?: string;
    delivery_country?: string;
  };
  history: Array<{
    type: string;
    message: string;
    time: number;
  }>;
  customer_note?: string;
  merchant_note?: string;
  created_at: string;
  updated_at: string;
}

// Refunds
export interface CreateRefundRequest {
  transaction: string; // transaction reference
  amount?: number; // in kobo/cents, optional for full refund
  currency?: string; // default: NGN
  customer_note?: string;
  merchant_note?: string;
}

export interface Refund {
  id: number;
  transaction: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message?: string;
    gateway_response: string;
    paid_at?: string;
    created_at: string;
    channel: string;
    currency: string;
  };
  domain: string;
  amount: number;
  currency: string;
  deducted_amount: number;
  status: string;
  refunded_at?: string;
  customer_note?: string;
  merchant_note?: string;
  created_at: string;
  updated_at: string;
}

// Verification
export interface VerifyAccountRequest {
  account_number: string;
  bank_code: string;
}

export interface VerifyAccountResponse {
  account_number: string;
  account_name: string;
  bank_id: number;
}

export interface VerifyBVNRequest {
  bvn: string;
  account_number?: string;
  bank_code?: string;
  first_name?: string;
  last_name?: string;
}

export interface VerifyBVNResponse {
  first_name: string;
  last_name: string;
  dob: string;
  mobile: string;
  bvn: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const PAYSTACK_API_BASE = "https://api.paystack.co";

export function getPaystackConfig(): PaystackConfig {
  // NOTE: For server-side API calls we only require the secret key.
  // The public key is only needed for client-side inline/JS SDK flows.
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";

  if (!secretKey) {
    throw new Error("Paystack secret key not configured");
  }

  return { secretKey, publicKey, baseUrl: PAYSTACK_API_BASE };
}

export function verifyPaystackConfig(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  
  if (!process.env.PAYSTACK_SECRET_KEY) {
    missing.push("PAYSTACK_SECRET_KEY");
  }
  
  return {
    configured: missing.length === 0,
    missing,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert amount to Paystack's smallest currency unit (kobo/cents)
 */
export function convertToSmallestUnit(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert from Paystack's smallest currency unit to regular amount
 */
export function convertFromSmallestUnit(amount: number): number {
  return amount / 100;
}

/**
 * Generate unique transaction reference
 */
export function generateTransactionReference(prefix: string, id: string): string {
  const timestamp = Date.now();
  return `${prefix}_${id}_${timestamp}`;
}

/**
 * Make Paystack API request
 */
export async function paystackRequest<T = any>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    secretKey?: string;
  } = {}
): Promise<PaystackResponse<T>> {
  const { getPaystackSecretKey } = await import("@/lib/payments/paystack-server");
  const secretKey = options.secretKey || (await getPaystackSecretKey());
  
  const url = endpoint.startsWith("http") 
    ? endpoint 
    : `${PAYSTACK_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Paystack API error");
  }

  return data;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * TRANSACTIONS
 */

export async function initializeTransaction(
  request: InitializeTransactionRequest
): Promise<PaystackResponse<InitializeTransactionResponse>> {
  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: request,
  });
}

export async function verifyTransaction(
  reference: string
): Promise<PaystackResponse<Transaction>> {
  return paystackRequest(`/transaction/verify/${reference}`);
}

export async function listTransactions(params?: {
  perPage?: number;
  page?: number;
  customer?: number;
  status?: string;
  from?: string;
  to?: string;
  amount?: number;
}): Promise<PaystackResponse<Transaction[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.customer) queryParams.append("customer", params.customer.toString());
  if (params?.status) queryParams.append("status", params.status);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);
  if (params?.amount) queryParams.append("amount", params.amount.toString());

  const query = queryParams.toString();
  return paystackRequest(`/transaction${query ? `?${query}` : ""}`);
}

export async function fetchTransaction(
  id: number
): Promise<PaystackResponse<Transaction>> {
  return paystackRequest(`/transaction/${id}`);
}

export async function chargeAuthorization(
  authorizationCode: string,
  email: string,
  amount: number,
  metadata?: Record<string, any>
): Promise<PaystackResponse<Transaction>> {
  return paystackRequest("/transaction/charge_authorization", {
    method: "POST",
    body: {
      authorization_code: authorizationCode,
      email,
      amount,
      metadata,
    },
  });
}

/**
 * TRANSACTION SPLITS
 */

export async function createSplit(
  request: CreateSplitRequest
): Promise<PaystackResponse<Split>> {
  return paystackRequest("/split", {
    method: "POST",
    body: request,
  });
}

export async function listSplits(params?: {
  perPage?: number;
  page?: number;
  active?: boolean;
  sortBy?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Split[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.active !== undefined) queryParams.append("active", params.active.toString());
  if (params?.sortBy) queryParams.append("sortBy", params.sortBy);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/split${query ? `?${query}` : ""}`);
}

export async function fetchSplit(
  id: number
): Promise<PaystackResponse<Split>> {
  return paystackRequest(`/split/${id}`);
}

export async function updateSplit(
  id: number,
  updates: Partial<CreateSplitRequest>
): Promise<PaystackResponse<Split>> {
  return paystackRequest(`/split/${id}`, {
    method: "PUT",
    body: updates,
  });
}

export async function addSubaccountToSplit(
  splitId: number,
  subaccount: string,
  share: number
): Promise<PaystackResponse<Split>> {
  return paystackRequest(`/split/${splitId}/subaccount/add`, {
    method: "POST",
    body: {
      subaccount,
      share,
    },
  });
}

export async function removeSubaccountFromSplit(
  splitId: number,
  subaccount: string
): Promise<PaystackResponse<Split>> {
  return paystackRequest(`/split/${splitId}/subaccount/remove`, {
    method: "POST",
    body: {
      subaccount,
    },
  });
}

/**
 * CUSTOMERS
 */

export async function createCustomer(
  request: CreateCustomerRequest
): Promise<PaystackResponse<Customer>> {
  return paystackRequest("/customer", {
    method: "POST",
    body: request,
  });
}

export async function listCustomers(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Customer[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/customer${query ? `?${query}` : ""}`);
}

export async function fetchCustomer(
  emailOrCode: string
): Promise<PaystackResponse<Customer>> {
  return paystackRequest(`/customer/${emailOrCode}`);
}

export async function updateCustomer(
  emailOrCode: string,
  updates: Partial<CreateCustomerRequest>
): Promise<PaystackResponse<Customer>> {
  return paystackRequest(`/customer/${emailOrCode}`, {
    method: "PUT",
    body: updates,
  });
}

export async function whitelistCustomer(
  customerCode: string
): Promise<PaystackResponse<Customer>> {
  return paystackRequest(`/customer/set_risk_action`, {
    method: "POST",
    body: {
      customer: customerCode,
      risk_action: "allow",
    },
  });
}

export async function blacklistCustomer(
  customerCode: string
): Promise<PaystackResponse<Customer>> {
  return paystackRequest(`/customer/set_risk_action`, {
    method: "POST",
    body: {
      customer: customerCode,
      risk_action: "deny",
    },
  });
}

/**
 * TRANSFER RECIPIENTS
 */

export async function createTransferRecipient(
  request: CreateTransferRecipientRequest
): Promise<PaystackResponse<TransferRecipient>> {
  return paystackRequest("/transferrecipient", {
    method: "POST",
    body: request,
  });
}

export async function bulkCreateTransferRecipients(
  recipients: CreateTransferRecipientRequest[]
): Promise<PaystackResponse<TransferRecipient[]>> {
  return paystackRequest("/transferrecipient/bulk", {
    method: "POST",
    body: {
      batch: recipients,
    },
  });
}

export async function listTransferRecipients(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<TransferRecipient[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/transferrecipient${query ? `?${query}` : ""}`);
}

export async function fetchTransferRecipient(
  idOrCode: string
): Promise<PaystackResponse<TransferRecipient>> {
  return paystackRequest(`/transferrecipient/${idOrCode}`);
}

export async function updateTransferRecipient(
  idOrCode: string,
  updates: Partial<CreateTransferRecipientRequest>
): Promise<PaystackResponse<TransferRecipient>> {
  return paystackRequest(`/transferrecipient/${idOrCode}`, {
    method: "PUT",
    body: updates,
  });
}

export async function deleteTransferRecipient(
  idOrCode: string
): Promise<PaystackResponse<any>> {
  return paystackRequest(`/transferrecipient/${idOrCode}`, {
    method: "DELETE",
  });
}

/**
 * TRANSFERS
 */

export async function createTransfer(
  request: CreateTransferRequest
): Promise<PaystackResponse<Transfer>> {
  return paystackRequest("/transfer", {
    method: "POST",
    body: request,
  });
}

export async function listTransfers(params?: {
  perPage?: number;
  page?: number;
  customer?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Transfer[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.customer) queryParams.append("customer", params.customer);
  if (params?.status) queryParams.append("status", params.status);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/transfer${query ? `?${query}` : ""}`);
}

export async function fetchTransfer(
  idOrCode: string
): Promise<PaystackResponse<Transfer>> {
  return paystackRequest(`/transfer/${idOrCode}`);
}

export async function finalizeTransfer(
  transferCode: string,
  otp: string
): Promise<PaystackResponse<Transfer>> {
  return paystackRequest("/transfer/finalize_transfer", {
    method: "POST",
    body: {
      transfer_code: transferCode,
      otp,
    },
  });
}

export async function verifyTransfer(
  reference: string
): Promise<PaystackResponse<Transfer>> {
  return paystackRequest(`/transfer/verify/${reference}`);
}

/**
 * TRANSFERS CONTROL
 */

export async function enableTransferOtp(): Promise<PaystackResponse<any>> {
  return paystackRequest("/transfer/enable_otp", {
    method: "POST",
  });
}

export async function disableTransferOtp(): Promise<PaystackResponse<any>> {
  return paystackRequest("/transfer/disable_otp", {
    method: "POST",
  });
}

export async function disableTransferOtpFinalize(
  transferCode: string
): Promise<PaystackResponse<any>> {
  return paystackRequest("/transfer/disable_otp_finalize", {
    method: "POST",
    body: {
      transfer_code: transferCode,
    },
  });
}

export async function resendTransferOtp(
  transferCode: string,
  reason: "resend_otp" | "transfer"
): Promise<PaystackResponse<any>> {
  return paystackRequest("/transfer/resend_otp", {
    method: "POST",
    body: {
      transfer_code: transferCode,
      reason,
    },
  });
}

/**
 * SUBACCOUNTS
 */

export async function createSubaccount(
  request: CreateSubaccountRequest
): Promise<PaystackResponse<Subaccount>> {
  return paystackRequest("/subaccount", {
    method: "POST",
    body: request,
  });
}

export async function listSubaccounts(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Subaccount[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/subaccount${query ? `?${query}` : ""}`);
}

export async function fetchSubaccount(
  idOrCode: string
): Promise<PaystackResponse<Subaccount>> {
  return paystackRequest(`/subaccount/${idOrCode}`);
}

export async function updateSubaccount(
  idOrCode: string,
  updates: Partial<CreateSubaccountRequest>
): Promise<PaystackResponse<Subaccount>> {
  return paystackRequest(`/subaccount/${idOrCode}`, {
    method: "PUT",
    body: updates,
  });
}

/**
 * PLANS
 */

export async function createPlan(
  request: CreatePlanRequest
): Promise<PaystackResponse<Plan>> {
  return paystackRequest("/plan", {
    method: "POST",
    body: request,
  });
}

export async function listPlans(params?: {
  perPage?: number;
  page?: number;
  status?: string;
  interval?: string;
  amount?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Plan[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.status) queryParams.append("status", params.status);
  if (params?.interval) queryParams.append("interval", params.interval);
  if (params?.amount) queryParams.append("amount", params.amount.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/plan${query ? `?${query}` : ""}`);
}

export async function fetchPlan(
  idOrCode: string
): Promise<PaystackResponse<Plan>> {
  return paystackRequest(`/plan/${idOrCode}`);
}

export async function updatePlan(
  idOrCode: string,
  updates: Partial<CreatePlanRequest>
): Promise<PaystackResponse<Plan>> {
  return paystackRequest(`/plan/${idOrCode}`, {
    method: "PUT",
    body: updates,
  });
}

/**
 * SUBSCRIPTIONS
 */

export async function createSubscription(
  request: CreateSubscriptionRequest
): Promise<PaystackResponse<Subscription>> {
  return paystackRequest("/subscription", {
    method: "POST",
    body: request,
  });
}

export async function listSubscriptions(params?: {
  perPage?: number;
  page?: number;
  customer?: string;
  plan?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Subscription[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.customer) queryParams.append("customer", params.customer);
  if (params?.plan) queryParams.append("plan", params.plan);
  if (params?.status) queryParams.append("status", params.status);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/subscription${query ? `?${query}` : ""}`);
}

export async function fetchSubscription(
  idOrCode: string
): Promise<PaystackResponse<Subscription>> {
  return paystackRequest(`/subscription/${idOrCode}`);
}

export async function enableSubscription(
  code: string,
  token: string
): Promise<PaystackResponse<Subscription>> {
  return paystackRequest(`/subscription/enable`, {
    method: "POST",
    body: {
      code,
      token,
    },
  });
}

export async function disableSubscription(
  code: string,
  token: string
): Promise<PaystackResponse<Subscription>> {
  return paystackRequest(`/subscription/disable`, {
    method: "POST",
    body: {
      code,
      token,
    },
  });
}

/**
 * PRODUCTS
 */

export async function createProduct(
  request: CreateProductRequest
): Promise<PaystackResponse<Product>> {
  return paystackRequest("/product", {
    method: "POST",
    body: request,
  });
}

export async function listProducts(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Product[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/product${query ? `?${query}` : ""}`);
}

export async function fetchProduct(
  id: number
): Promise<PaystackResponse<Product>> {
  return paystackRequest(`/product/${id}`);
}

export async function updateProduct(
  id: number,
  updates: Partial<CreateProductRequest>
): Promise<PaystackResponse<Product>> {
  return paystackRequest(`/product/${id}`, {
    method: "PUT",
    body: updates,
  });
}

/**
 * PAYMENT PAGES
 */

export async function createPaymentPage(
  request: CreatePaymentPageRequest
): Promise<PaystackResponse<PaymentPage>> {
  return paystackRequest("/paymentpage", {
    method: "POST",
    body: request,
  });
}

export async function listPaymentPages(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<PaymentPage[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/paymentpage${query ? `?${query}` : ""}`);
}

export async function fetchPaymentPage(
  idOrSlug: string
): Promise<PaystackResponse<PaymentPage>> {
  return paystackRequest(`/paymentpage/${idOrSlug}`);
}

export async function updatePaymentPage(
  idOrSlug: string,
  updates: Partial<CreatePaymentPageRequest>
): Promise<PaystackResponse<PaymentPage>> {
  return paystackRequest(`/paymentpage/${idOrSlug}`, {
    method: "PUT",
    body: updates,
  });
}

/**
 * PAYMENT REQUESTS
 */

export async function createPaymentRequest(
  request: CreatePaymentRequest
): Promise<PaystackResponse<PaymentRequest>> {
  return paystackRequest("/paymentrequest", {
    method: "POST",
    body: request,
  });
}

export async function listPaymentRequests(params?: {
  perPage?: number;
  page?: number;
  customer?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<PaymentRequest[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.customer) queryParams.append("customer", params.customer);
  if (params?.status) queryParams.append("status", params.status);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/paymentrequest${query ? `?${query}` : ""}`);
}

export async function fetchPaymentRequest(
  idOrCode: string
): Promise<PaystackResponse<PaymentRequest>> {
  return paystackRequest(`/paymentrequest/${idOrCode}`);
}

export async function updatePaymentRequest(
  idOrCode: string,
  updates: Partial<CreatePaymentRequest>
): Promise<PaystackResponse<PaymentRequest>> {
  return paystackRequest(`/paymentrequest/${idOrCode}`, {
    method: "PUT",
    body: updates,
  });
}

export async function archivePaymentRequest(
  idOrCode: string
): Promise<PaystackResponse<PaymentRequest>> {
  return paystackRequest(`/paymentrequest/archive/${idOrCode}`, {
    method: "POST",
  });
}

/**
 * SETTLEMENTS
 */

export async function listSettlements(params?: {
  perPage?: number;
  page?: number;
  subaccount?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Settlement[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.subaccount) queryParams.append("subaccount", params.subaccount);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/settlement${query ? `?${query}` : ""}`);
}

export async function fetchSettlement(
  id: number
): Promise<PaystackResponse<Settlement>> {
  return paystackRequest(`/settlement/${id}`);
}

/**
 * DISPUTES
 */

export async function listDisputes(params?: {
  perPage?: number;
  page?: number;
  transaction?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Dispute[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.transaction) queryParams.append("transaction", params.transaction);
  if (params?.status) queryParams.append("status", params.status);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/dispute${query ? `?${query}` : ""}`);
}

export async function fetchDispute(
  id: number
): Promise<PaystackResponse<Dispute>> {
  return paystackRequest(`/dispute/${id}`);
}

export async function updateDispute(
  id: number,
  refundAmount: number,
  uploadedFilename?: string
): Promise<PaystackResponse<Dispute>> {
  return paystackRequest(`/dispute/${id}`, {
    method: "PUT",
    body: {
      refund_amount: refundAmount,
      uploaded_filename: uploadedFilename,
    },
  });
}

export async function addEvidence(
  disputeId: number,
  evidence: {
    customer_email: string;
    customer_name: string;
    customer_phone?: string;
    service_details?: string;
    delivery_address?: string;
    delivery_date?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_zipcode?: string;
    delivery_country?: string;
  }
): Promise<PaystackResponse<Dispute>> {
  return paystackRequest(`/dispute/${disputeId}/evidence`, {
    method: "POST",
    body: evidence,
  });
}

export async function resolveDispute(
  disputeId: number,
  resolution: "merchant-accepted" | "declined",
  message: string,
  refundAmount?: number,
  uploadedFilename?: string
): Promise<PaystackResponse<Dispute>> {
  return paystackRequest(`/dispute/${disputeId}/resolve`, {
    method: "PUT",
    body: {
      resolution,
      message,
      refund_amount: refundAmount,
      uploaded_filename: uploadedFilename,
    },
  });
}

/**
 * REFUNDS
 */

export async function createRefund(
  request: CreateRefundRequest
): Promise<PaystackResponse<Refund>> {
  return paystackRequest("/refund", {
    method: "POST",
    body: request,
  });
}

export async function listRefunds(params?: {
  perPage?: number;
  page?: number;
  transaction?: string;
  currency?: string;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<Refund[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.transaction) queryParams.append("transaction", params.transaction);
  if (params?.currency) queryParams.append("currency", params.currency);
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/refund${query ? `?${query}` : ""}`);
}

export async function fetchRefund(
  id: number
): Promise<PaystackResponse<Refund>> {
  return paystackRequest(`/refund/${id}`);
}

/**
 * VERIFICATION
 */

export async function verifyAccount(
  request: VerifyAccountRequest
): Promise<PaystackResponse<VerifyAccountResponse>> {
  const config = getPaystackConfig();
  const queryParams = new URLSearchParams({
    account_number: request.account_number,
    bank_code: request.bank_code,
  });

  const response = await fetch(
    `${PAYSTACK_API_BASE}/bank/resolve?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.secretKey}`,
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Verification failed");
  }
  return data;
}

export async function listBanks(params?: {
  country?: string;
  use_cursor?: boolean;
  perPage?: number;
  page?: number;
  next?: string;
  previous?: string;
  gateway?: string;
  type?: string;
  currency?: string;
}): Promise<PaystackResponse<any[]>> {
  const queryParams = new URLSearchParams();
  if (params?.country) queryParams.append("country", params.country);
  if (params?.use_cursor) queryParams.append("use_cursor", params.use_cursor.toString());
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.next) queryParams.append("next", params.next);
  if (params?.previous) queryParams.append("previous", params.previous);
  if (params?.gateway) queryParams.append("gateway", params.gateway);
  if (params?.type) queryParams.append("type", params.type);
  if (params?.currency) queryParams.append("currency", params.currency);

  const query = queryParams.toString();
  return paystackRequest(`/bank${query ? `?${query}` : ""}`);
}

export async function verifyBVN(
  request: VerifyBVNRequest
): Promise<PaystackResponse<VerifyBVNResponse>> {
  return paystackRequest("/bvn/match", {
    method: "POST",
    body: request,
  });
}

/**
 * BULK CHARGES
 */

export async function createBulkCharge(
  charges: Array<{
    authorization: string;
    amount: number;
    email: string;
    reference?: string;
    metadata?: Record<string, any>;
  }>
): Promise<PaystackResponse<any>> {
  return paystackRequest("/bulkcharge", {
    method: "POST",
    body: {
      batch: charges,
    },
  });
}

export async function listBulkCharges(params?: {
  perPage?: number;
  page?: number;
  from?: string;
  to?: string;
}): Promise<PaystackResponse<any[]>> {
  const queryParams = new URLSearchParams();
  if (params?.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.from) queryParams.append("from", params.from);
  if (params?.to) queryParams.append("to", params.to);

  const query = queryParams.toString();
  return paystackRequest(`/bulkcharge${query ? `?${query}` : ""}`);
}

export async function fetchBulkCharge(
  idOrCode: string
): Promise<PaystackResponse<any>> {
  return paystackRequest(`/bulkcharge/${idOrCode}`);
}

export async function pauseBulkCharge(
  batchCode: string
): Promise<PaystackResponse<any>> {
  return paystackRequest(`/bulkcharge/pause/${batchCode}`, {
    method: "POST",
  });
}

export async function resumeBulkCharge(
  batchCode: string
): Promise<PaystackResponse<any>> {
  return paystackRequest(`/bulkcharge/resume/${batchCode}`, {
    method: "POST",
  });
}

/**
 * APPLE PAY
 */

export async function listApplePayDomains(): Promise<PaystackResponse<any[]>> {
  return paystackRequest("/apple-pay/domain");
}

export async function registerApplePayDomain(
  domainName: string
): Promise<PaystackResponse<any>> {
  return paystackRequest("/apple-pay/domain", {
    method: "POST",
    body: {
      domain_name: domainName,
    },
  });
}

export async function unregisterApplePayDomain(
  domainName: string
): Promise<PaystackResponse<any>> {
  return paystackRequest(`/apple-pay/domain/${domainName}`, {
    method: "DELETE",
  });
}
