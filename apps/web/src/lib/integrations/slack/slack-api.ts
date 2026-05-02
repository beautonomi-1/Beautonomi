/** Low-level Slack Web API helpers (oauth.v2.access, chat.postMessage, conversations.list). */

export type SlackOAuthAccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  team?: { id?: string; name?: string };
  bot_user_id?: string;
};

export async function slackOAuthV2Access(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<SlackOAuthAccessResponse> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await res.json()) as SlackOAuthAccessResponse;
}

export async function slackChatPostMessage(params: {
  token: string;
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ ok: boolean; error?: string; ts?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: params.channel,
      text: params.text,
      ...(params.blocks ? { blocks: params.blocks } : {}),
    }),
  });
  return (await res.json()) as { ok: boolean; error?: string; ts?: string };
}

export type SlackConversation = {
  id: string;
  name?: string;
  is_private?: boolean;
};

export async function slackListChannels(params: {
  token: string;
  cursor?: string;
}): Promise<{ ok: boolean; channels?: SlackConversation[]; response_metadata?: { next_cursor?: string }; error?: string }> {
  const u = new URL("https://slack.com/api/conversations.list");
  u.searchParams.set("types", "public_channel,private_channel");
  u.searchParams.set("exclude_archived", "true");
  u.searchParams.set("limit", "200");
  if (params.cursor) u.searchParams.set("cursor", params.cursor);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${params.token}` },
  });
  return (await res.json()) as {
    ok: boolean;
    channels?: SlackConversation[];
    response_metadata?: { next_cursor?: string };
    error?: string;
  };
}
