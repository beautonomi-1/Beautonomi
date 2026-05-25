import { paystackRequest, type PaystackResponse } from "@/lib/payments/paystack-complete";

export type PaystackVirtualTerminalDestination = {
  target: string;
  name: string;
  type?: "whatsapp" | string;
};

export type PaystackVirtualTerminalCustomField = {
  display_name: string;
  variable_name: string;
};

export type PaystackVirtualTerminal = {
  id: number;
  name: string;
  integration?: number;
  domain?: string;
  code: string;
  paymentMethods?: unknown[];
  active: boolean;
  metadata?: Record<string, unknown> | null;
  destinations?: PaystackVirtualTerminalDestination[];
  currency?: string;
  created_at?: string;
  connect_account_id?: string | null;
};

export type CreatePaystackVirtualTerminalRequest = {
  name: string;
  destinations?: PaystackVirtualTerminalDestination[];
  metadata?: Record<string, unknown>;
  currency?: string;
  custom_fields?: PaystackVirtualTerminalCustomField[];
};

export type ListPaystackVirtualTerminalsParams = {
  status?: "active" | "inactive";
  perPage?: number;
  search?: string;
  next?: string;
  previous?: string;
  tenantId?: string | null;
};

function terminalEndpoint(code?: string, suffix?: string) {
  const parts = ["/virtual_terminal"];
  if (code) parts.push(`/${encodeURIComponent(code)}`);
  if (suffix) parts.push(suffix);
  return parts.join("");
}

export async function createPaystackVirtualTerminal(
  request: CreatePaystackVirtualTerminalRequest,
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<PaystackVirtualTerminal>> {
  return paystackRequest<PaystackVirtualTerminal>(terminalEndpoint(), {
    method: "POST",
    body: request,
    tenantId: options?.tenantId,
  });
}

export async function listPaystackVirtualTerminals(
  params: ListPaystackVirtualTerminalsParams = {},
): Promise<PaystackResponse<PaystackVirtualTerminal[]>> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append("status", params.status);
  if (params.perPage) queryParams.append("perPage", params.perPage.toString());
  if (params.search) queryParams.append("search", params.search);
  if (params.next) queryParams.append("next", params.next);
  if (params.previous) queryParams.append("previous", params.previous);
  const query = queryParams.toString();

  return paystackRequest<PaystackVirtualTerminal[]>(
    `${terminalEndpoint()}${query ? `?${query}` : ""}`,
    { tenantId: params.tenantId },
  );
}

export async function fetchPaystackVirtualTerminal(
  code: string,
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<PaystackVirtualTerminal>> {
  return paystackRequest<PaystackVirtualTerminal>(terminalEndpoint(code), {
    tenantId: options?.tenantId,
  });
}

export async function updatePaystackVirtualTerminal(
  code: string,
  request: { name: string },
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<PaystackVirtualTerminal>> {
  return paystackRequest<PaystackVirtualTerminal>(terminalEndpoint(code), {
    method: "PUT",
    body: request,
    tenantId: options?.tenantId,
  });
}

export async function deactivatePaystackVirtualTerminal(
  code: string,
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<unknown>> {
  return paystackRequest(terminalEndpoint(code, "/deactivate"), {
    method: "PUT",
    tenantId: options?.tenantId,
  });
}

export async function assignPaystackVirtualTerminalDestinations(
  code: string,
  destinations: PaystackVirtualTerminalDestination[],
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<PaystackVirtualTerminalDestination[]>> {
  return paystackRequest<PaystackVirtualTerminalDestination[]>(
    terminalEndpoint(code, "/destination/assign"),
    {
      method: "POST",
      body: { destinations },
      tenantId: options?.tenantId,
    },
  );
}

export async function unassignPaystackVirtualTerminalDestinations(
  code: string,
  targets: string[],
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<unknown>> {
  return paystackRequest(terminalEndpoint(code, "/destination/unassign"), {
    method: "POST",
    body: { targets },
    tenantId: options?.tenantId,
  });
}

export async function addPaystackVirtualTerminalSplitCode(
  code: string,
  splitCode: string,
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<unknown>> {
  return paystackRequest(terminalEndpoint(code, "/split_code"), {
    method: "PUT",
    body: { split_code: splitCode },
    tenantId: options?.tenantId,
  });
}

export async function removePaystackVirtualTerminalSplitCode(
  code: string,
  splitCode: string,
  options?: { tenantId?: string | null },
): Promise<PaystackResponse<unknown>> {
  return paystackRequest(terminalEndpoint(code, "/split_code"), {
    method: "DELETE",
    body: { split_code: splitCode },
    tenantId: options?.tenantId,
  });
}
