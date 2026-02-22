"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import AuthGuard from "@/components/auth/auth-guard";
import WhatsAppChat from "@/components/messaging/whatsapp-chat";
import ConversationList from "@/components/messaging/conversation-list";
import { getSupabaseClient } from "@/lib/supabase/client";
import BackButton from "../components/back-button";
import Breadcrumb from "../components/breadcrumb";

interface Conversation {
  id: string;
  booking_id?: string;
  provider_id?: string;
  customer_id: string;
  last_message_at: string;
  unread_count: number;
  provider_name?: string;
  provider_phone?: string;
  provider_email?: string;
  customer_name?: string;
  booking_number?: string;
  avatar?: string;
  last_message_preview?: string;
}

// Reserved for typing individual messages when needed
interface _Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string;
  content: string;
  attachments?: any[];
  created_at: string;
  read_at?: string;
}

export default function Component() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  // On desktop, show chat by default if conversation is selected. On mobile, start hidden.
  const [showChat, setShowChat] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const hasHandledQueryParams = useRef<string | false>(false);

  useEffect(() => {
    loadCurrentUser();
    loadConversations();
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (!cancelled) unsubscribe = subscribeToConversations();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only: load user, conversations, subscribe

  // Ensure chat is shown when conversation is selected (especially on desktop)
  useEffect(() => {
    if (selectedConversation && !showChat) {
      // On desktop, always show chat if conversation is selected
      // On mobile, only show if explicitly set
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setShowChat(true);
      }
    }
  }, [selectedConversation, showChat]);

  // Handle query parameters: provider and conversation
  useEffect(() => {
    const handleQueryParams = async () => {
      const providerId = searchParams.get("provider");
      const conversationId = searchParams.get("conversation");

      // If no query params, reset the flag
      if (!providerId && !conversationId) {
        hasHandledQueryParams.current = false;
        return;
      }

      // Wait for conversations to load before handling query params
      if (isLoadingConversations || !currentUserId) {
        return;
      }

      // Prevent handling the same params multiple times
      const paramsKey = `${providerId || ''}-${conversationId || ''}`;
      if (hasHandledQueryParams.current === paramsKey) {
        return;
      }

      // If we have a conversation ID, select it (only if not already selected)
      if (conversationId && (!selectedConversation || selectedConversation.id !== conversationId)) {
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation) {
          hasHandledQueryParams.current = paramsKey;
          setSelectedConversation(conversation);
          setShowChat(true);
          // Clean up URL after state is set
          setTimeout(() => {
            router.replace("/account-settings/messages", { scroll: false });
          }, 200);
          return;
        } else if (conversations.length > 0) {
          // Conversation ID provided but not found in list - might be loading
          // Wait a bit and try again, or it might be a new conversation that needs to be created
          console.warn(`Conversation ${conversationId} not found in list, waiting for reload...`);
        }
      }

      // If we have a provider ID but no conversation, create or find one
      // Only do this if we don't already have a selected conversation for this provider
      if (providerId && !conversationId && !isCreatingConversation) {
        // Check if we already have this conversation selected
        if (selectedConversation?.provider_id === providerId) {
          // Already have this conversation, ensure chat is shown and clean up URL
          hasHandledQueryParams.current = paramsKey;
          setShowChat(true);
          setTimeout(() => {
            router.replace("/account-settings/messages", { scroll: false });
          }, 200);
          return;
        }
        hasHandledQueryParams.current = paramsKey;
        await createOrFindConversation(providerId);
      }
    };

    handleQueryParams();
  }, [searchParams, conversations, isLoadingConversations, currentUserId, isCreatingConversation, router, selectedConversation]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: createOrFindConversation is stable

  const createOrFindConversation = async (providerId: string) => {
    if (isCreatingConversation) return;
    
    try {
      setIsCreatingConversation(true);
      
      // First, check if conversation already exists
      const existingConv = conversations.find(
        (conv) => conv.provider_id === providerId && !conv.booking_id
      );

      if (existingConv) {
        // Conversation exists, select it
        setSelectedConversation(existingConv);
        setShowChat(true);
        router.replace("/account-settings/messages", { scroll: false });
        return;
      }

      // Create new conversation
      const response = await fetcher.post<{ data: { id: string; created: boolean } }>(
        "/api/me/conversations/create",
        { provider_id: providerId, booking_id: null },
        { timeoutMs: 10000 }
      );

      if (response.data) {
        // Reload conversations to get the new one with all fields
        let updatedConversations = await loadConversations();
        
        // Find the new conversation - try multiple times in case of replication delay
        let newConv = updatedConversations.find(c => c.id === response.data.id);
        
        // If not found, wait a bit and try again (database replication delay)
        if (!newConv) {
          await new Promise(resolve => setTimeout(resolve, 500));
          updatedConversations = await loadConversations();
          newConv = updatedConversations.find(c => c.id === response.data.id);
        }
        
        // If still not found after retry, construct a minimal conversation object
        // The conversation exists in DB, just might not be in the list yet
        if (!newConv) {
          console.warn("Created conversation not found in list, using minimal object");
          // Find provider info from existing conversations or construct minimal
          const providerInfo = conversations.find(c => c.provider_id === providerId);
          newConv = {
            id: response.data.id,
            provider_id: providerId,
            customer_id: currentUserId,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
            provider_name: providerInfo?.provider_name || "Provider",
            avatar: providerInfo?.avatar || null,
          } as Conversation;
        }
        
        // Select the conversation and show chat immediately
        // Set both states together to ensure they're in sync
        setSelectedConversation(newConv);
        setShowChat(true);
        
        // Show success message
        toast.success("Conversation created");
        
        // Clean up URL after state has been set (longer delay to ensure React has updated)
        setTimeout(() => {
          // Only replace URL if we still have the conversation selected
          // This prevents clearing state if something went wrong
          router.replace("/account-settings/messages", { scroll: false });
        }, 500);
        
        // Reload conversations in background to get full details if we used minimal object
        if (!updatedConversations.find(c => c.id === response.data.id)) {
          setTimeout(() => {
            loadConversations().then((convs) => {
              const fullConv = convs.find(c => c.id === response.data.id);
              if (fullConv) {
                // Update with full conversation details, but keep showChat true
                setSelectedConversation(fullConv);
                setShowChat(true);
              }
            });
          }, 1000);
        }
      }
    } catch (err) {
      console.error("Error creating conversation:", err);
      toast.error("Failed to create conversation. Please try again.");
      // Clean up URL even on error
      router.replace("/account-settings/messages", { scroll: false });
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    } catch (err) {
      console.error("Error loading current user:", err);
    }
  };

  const loadConversations = async (): Promise<Conversation[]> => {
    try {
      setIsLoadingConversations(true);
      setError(null);
      const response = await fetcher.get<{ data: Conversation[]; error: { message: string; code?: string } | null }>("/api/me/conversations", {
        timeoutMs: 15000,
        cache: "no-store",
      });
      
      // The API returns { data: Conversation[], error: null } format via successResponse()
      // If fetcher.get succeeds (no throw), we have a successful response
      // Extract data from response - handle both { data: [...] } and direct array (fallback)
      let conversationsData: Conversation[] = [];
      
      if (response && typeof response === 'object') {
        if ('data' in response) {
          // Standard API response format: { data: [...], error: null }
          conversationsData = Array.isArray(response.data) ? response.data : [];
        } else if (Array.isArray(response)) {
          // Direct array response (fallback, shouldn't happen with current API)
          conversationsData = response;
        }
      }
      
      // Empty array is valid - means no conversations yet
      if (!Array.isArray(conversationsData)) {
        console.warn("Unexpected response format, defaulting to empty array:", response);
        conversationsData = [];
      }
      
      // Deduplicate conversations: for conversations without booking_id, keep only the most recent one per provider
      const deduplicated: Conversation[] = [];
      const providerMap = new Map<string, Conversation>();
      
      for (const conv of conversationsData) {
        // For conversations without booking_id, deduplicate by provider_id
        if (!conv.booking_id && conv.provider_id) {
          const existing = providerMap.get(conv.provider_id);
          if (!existing || new Date(conv.last_message_at) > new Date(existing.last_message_at)) {
            providerMap.set(conv.provider_id, conv);
          }
        } else {
          // For booking conversations, keep all (they're unique by booking_id)
          deduplicated.push(conv);
        }
      }
      
      // Add deduplicated provider conversations
      providerMap.forEach((conv) => deduplicated.push(conv));
      
      // Sort by last_message_at descending
      deduplicated.sort((a, b) => 
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
      
      setConversations(deduplicated);
      return deduplicated;
    } catch (err) {
      let errorMessage = "Failed to load conversations";
      
      if (err instanceof FetchTimeoutError) {
        errorMessage = "Request timed out. Please check your connection and try again.";
      } else if (err instanceof FetchError) {
        // Provide more specific error messages based on status code
        if (err.status === 401) {
          errorMessage = "Please sign in to view your conversations.";
        } else if (err.status === 403) {
          errorMessage = "You don't have permission to view conversations.";
        } else if (err.status === 404) {
          errorMessage = "Conversations endpoint not found.";
        } else if (err.status === 0) {
          errorMessage = "Network error: Unable to reach server. Please check your connection.";
        } else if (err.status >= 500) {
          errorMessage = "Server error. Please try again later.";
        } else {
          errorMessage = err.message || `Failed to load conversations (${err.status})`;
        }
      } else {
        // Handle unknown errors
        errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      }
      
      setError(errorMessage);
      
      // Only log non-timeout errors to console (timeouts are expected in some cases)
      if (!(err instanceof FetchTimeoutError)) {
        // Build error details safely
        const errorDetails: Record<string, unknown> = {};
        
        if (err instanceof Error) {
          if (err.message) errorDetails.message = err.message;
          if (err.name) errorDetails.name = err.name;
          if (err.stack) errorDetails.stack = err.stack;
        } else if (err !== null && typeof err === 'object') {
          // Try to extract useful info from error object
          try {
            const errStr = JSON.stringify(err);
            if (errStr !== '{}') {
              errorDetails.error = errStr;
            } else {
              errorDetails.error = String(err);
            }
          } catch {
            errorDetails.error = String(err);
          }
        } else {
          errorDetails.error = String(err);
        }
        
        if (err instanceof FetchError) {
          errorDetails.status = err.status;
          if (err.code) errorDetails.code = err.code;
        }
        
        // Only log if we have meaningful error details (not empty object)
        const hasDetails = Object.keys(errorDetails).length > 0 && 
          (errorDetails.message || errorDetails.error || errorDetails.status);
        if (hasDetails) {
          console.error("Error loading conversations:", errorDetails);
        }
      }
      
      // Only show toast for actual errors, not for empty results or timeouts on first load
      // Don't show error if:
      // 1. It's a timeout and we have no conversations (might be first load, network issue)
      // 2. It's a permission/table error (treated as empty state, not a real error)
      const isPermissionError = err instanceof FetchError && 
        (err.status === 403 || err.message?.includes('permission') || err.message?.includes('does not exist'));
      const isTimeoutOnFirstLoad = err instanceof FetchTimeoutError && conversations.length === 0;
      
      if (!isPermissionError && !isTimeoutOnFirstLoad) {
        toast.error(errorMessage);
      } else if (isPermissionError) {
        // Permission errors are handled gracefully - just log, don't show toast
        console.warn("Conversations access denied or table missing, showing empty state");
      }
      return [];
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const subscribeToConversations = () => {
    const supabase = getSupabaseClient();
    
    // Subscribe to conversation updates
    const channel = supabase
      .channel("customer-conversations-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
      }
    };
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowChat(true);
    // Ensure chat is visible on mobile
    if (window.innerWidth < 768) {
      setShowChat(true);
    }
  };

  const handleBack = () => {
    // On mobile, hide chat and show list
    if (window.innerWidth < 768) {
      setShowChat(false);
    }
    // Don't clear selectedConversation on desktop - keep it selected in the list
    // Only clear on mobile when going back
    if (window.innerWidth < 768) {
      setSelectedConversation(null);
    }
  };

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-white overflow-hidden">
        {/* Mobile Header - Only show when list is visible, not when chat is open */}
        {!showChat && (
          <div className="md:hidden border-b border-[#e9edef] bg-white px-4 py-3">
            <BackButton href="/account-settings" />
            <h1 className="text-xl font-semibold text-[#111b21] mt-2">Messages</h1>
          </div>
        )}

        {/* Desktop Header */}
        <div className="hidden md:block border-b border-[#e9edef] bg-white px-6 py-4">
          <Breadcrumb
            items={[
              { label: "Account", href: "/account-settings" },
              { label: "Messages" },
            ]}
          />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Conversations List */}
          <div
            className={`${
              showChat ? "hidden md:block" : "block"
            } w-full md:w-96 flex-shrink-0 absolute md:relative inset-0 z-10 md:z-auto bg-white`}
          >
            {error && !isLoadingConversations ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-[#111b21] text-sm font-medium mb-2">{error}</p>
                <button
                  onClick={loadConversations}
                  className="mt-4 px-4 py-2 bg-[#008489] text-white rounded-lg text-sm font-medium hover:bg-[#006a6f] transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <ConversationList
                conversations={conversations}
                selectedConversationId={selectedConversation?.id}
                onSelectConversation={handleSelectConversation}
                currentUserId={currentUserId}
                isLoading={isLoadingConversations}
              />
            )}
          </div>

          {/* Chat View - Full screen on mobile when open */}
          <div
            className={`${
              showChat ? "block" : "hidden md:block"
            } flex-1 flex flex-col absolute md:relative inset-0 z-20 md:z-auto bg-white h-full overflow-hidden min-h-0`}
          >
            {selectedConversation ? (
              <WhatsAppChat
                conversation={selectedConversation}
                currentUserId={currentUserId}
                onBack={handleBack}
                onConversationUpdate={loadConversations}
              />
            ) : (
              <div className="flex flex-col h-full bg-[#f0f2f5] items-center justify-center px-4">
                <div className="text-center p-6 md:p-8 max-w-sm">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#008489] mx-auto mb-4 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 md:w-10 md:h-10 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <p className="text-[#667781] text-sm md:text-base font-medium">Select a conversation</p>
                  <p className="text-[#667781] text-xs md:text-sm mt-1">
                    Choose a conversation from the list to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
