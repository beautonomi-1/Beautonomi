import { fetch as expoFetch } from "expo/fetch";
import { streamAssistantReply } from "@beautonomi/utils";
import {
  getBackendUrl,
  MOBILE_WEB_USER_AGENT_TOKEN,
  webApiTenantHeaders,
} from "@/config/public-env";
import { getAccessToken } from "@/lib/api-client";
import { getDeviceLocaleCountryIso } from "@/lib/device-default-country-dial";
import { getShopMarketHeaderSync } from "@/lib/market/shop-market-opt-in";

async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const res = await expoFetch(url, {
    method: init.method,
    body: init.body as string,
    headers: {
      ...(init.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...webApiTenantHeaders(),
      "X-App": "customer",
      "User-Agent": MOBILE_WEB_USER_AGENT_TOKEN,
      "X-Active-Market-Country": getDeviceLocaleCountryIso(),
      ...getShopMarketHeaderSync(),
    },
  });
  return res as unknown as Response;
}

export async function streamCustomerSupportAssistantReply(params: {
  ticketId: string;
  message: string;
  mode: "initial" | "follow_up";
  onAssistantChunk: (text: string) => void;
}) {
  const base = getBackendUrl().replace(/\/$/, "");
  const streamUrl = `${base}/api/me/support-tickets/${params.ticketId}/assistant-messages/stream`;
  return streamAssistantReply({
    streamUrl,
    message: params.message,
    body: { mode: params.mode },
    fetchFn: authedFetch as typeof fetch,
    onAssistantChunk: params.onAssistantChunk,
  });
}
