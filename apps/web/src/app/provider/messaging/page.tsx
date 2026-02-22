"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import WhatsAppChat from "@/components/messaging/whatsapp-chat";
import ConversationList from "@/components/messaging/conversation-list";
import { getSupabaseClient } from "@/lib/supabase/client";
import BackButton from "@/app/account-settings/components/back-button";
import Breadcrumb from "@/app/account-settings/components/breadcrumb";

interface Conversation {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_avatar?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count: number;
  booking_id?: string;
  booking_number?: string;
  provider_id?: string;
  last_message_at: string;
  last_message_preview?: string;
  avatar?: string; // For backward compatibility
}

export default function ProviderMessaging() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    loadCurrentUser();
    loadConversations();
    const unsubscribe = subscribeToConversations();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handle conversation selection from URL
  useEffect(() => {
    const conversationId = searchParams.get("conversationId");
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
        setShowChat(true);
      }
    }
  }, [searchParams, conversations]);

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

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Conversation[] }>(
        "/api/provider/conversations",
        { timeoutMs: 15000 } // 15 second timeout
      );
      
      // Handle case where response.data might be undefined or null
      if (!response || !response.data) {
        setConversations([]);
        return;
      }
      
      // Transform provider conversations to match the expected format
      const transformed = (response.data || []).map((conv) => ({
        ...conv,
        // For provider portal, show customer name (not provider name)
        provider_name: undefined, // Provider doesn't need provider_name
        customer_name: conv.customer_name || "Customer",
        avatar: conv.customer_avatar || conv.avatar || null,
        last_message_at: conv.last_message_time || conv.last_message_at || new Date().toISOString(),
        last_message_preview: conv.last_message || conv.last_message_preview || "",
        // Ensure unread_count is properly set
        unread_count: conv.unread_count || 0,
        // Ensure all required fields are present (especially customer_id for custom offers)
        customer_id: conv.customer_id || conv.customer_id, // Ensure customer_id is present
        provider_id: conv.provider_id,
        booking_id: conv.booking_id || null,
        booking_number: conv.booking_number || null,
      }));
      
      setConversations(transformed);
    } catch (err) {
      let errorMessage = "Failed to load conversations";
      
      if (err instanceof FetchTimeoutError) {
        errorMessage = "Request timed out. Please try again.";
      } else if (err instanceof FetchError) {
        // Provide more specific error messages based on status code
        if (err.status === 401) {
          errorMessage = "Please sign in to view your conversations.";
        } else if (err.status === 403) {
          errorMessage = "You don't have permission to view conversations. Please contact support if you believe this is an error.";
        } else if (err.status === 404) {
          errorMessage = "Conversations endpoint not found.";
        } else if (err.status === 0) {
          errorMessage = "Network error: Unable to reach server. Please check your connection.";
        } else if (err.status >= 500) {
          errorMessage = "Server error. Please try again later.";
        } else {
          errorMessage = err.message || `Failed to fetch conversations (${err.status})`;
        }
        
        // Log detailed error for debugging
        console.error("Error loading conversations:", {
          message: err.message,
          status: err.status,
          code: err.code,
          details: err.details,
        });
      } else {
        errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        console.error("Error loading conversations:", err);
      }
      
      setError(errorMessage);
      // Set empty array on error to prevent UI issues
      setConversations([]);
      // Show toast notification for user feedback
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToConversations = () => {
    const supabase = getSupabaseClient();
    
    // Debounce conversation reloads to prevent excessive API calls
    let reloadTimeout: NodeJS.Timeout | null = null;
    const debouncedReload = () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        loadConversations();
      }, 1000); // Wait 1 second before reloading to batch updates
    };
    
    // Subscribe to conversation updates
    const channel = supabase
      .channel("provider-conversations-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          debouncedReload();
        }
      )
      .subscribe();

    return () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
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

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading messages..." />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="flex flex-col h-screen bg-white overflow-hidden">
        {/* Mobile Header - Only show when list is visible, not when chat is open */}
        {!showChat && (
          <div className="md:hidden border-b border-[#e9edef] bg-white px-4 py-3">
            <BackButton href="/provider/dashboard" />
            <h1 className="text-xl font-semibold text-[#111b21] mt-2">Messages</h1>
          </div>
        )}

        {/* Desktop Header */}
        <div className="hidden md:block border-b border-[#e9edef] bg-white px-6 py-4">
          <Breadcrumb
            items={[
              { label: "Dashboard", href: "/provider/dashboard" },
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
            {error && !isLoading ? (
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
                onSelectConversation={handleSelectConversation as any}
                currentUserId={currentUserId}
                isLoading={isLoading}
                isProviderView={true}
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
                messagesEndpoint="/api/provider/conversations"
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
                    Choose a customer conversation to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
