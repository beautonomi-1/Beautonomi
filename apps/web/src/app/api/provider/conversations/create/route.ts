import { NextRequest } from "next/server";
import { createConversation } from "../_helpers/create-conversation";

/**
 * POST /api/provider/conversations/create
 *
 * Create a new conversation with a customer (provider-initiated)
 */
export async function POST(request: NextRequest) {
  return createConversation(request);
}
