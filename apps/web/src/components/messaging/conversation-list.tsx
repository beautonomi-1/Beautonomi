"use client";
import { useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isToday, isYesterday } from "date-fns";

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

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation: (conversation: Conversation) => void;
  currentUserId: string;
  isLoading?: boolean;
  isProviderView?: boolean; // Indicates if this is the provider portal view
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  currentUserId: _currentUserId,
  isLoading = false,
  isProviderView = false,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    
    const searchLower = searchQuery.toLowerCase();
    // For provider view, prioritize customer_name; for customer view, prioritize provider_name
    const name = isProviderView 
      ? (conv.customer_name || conv.provider_name || "").toLowerCase()
      : (conv.provider_name || conv.customer_name || "").toLowerCase();
    const booking = conv.booking_number?.toLowerCase() || "";
    const phone = conv.provider_phone?.toLowerCase() || "";
    const email = conv.provider_email?.toLowerCase() || "";
    const preview = conv.last_message_preview?.toLowerCase() || "";
    
    return (
      name.includes(searchLower) ||
      booking.includes(searchLower) ||
      phone.includes(searchLower) ||
      email.includes(searchLower) ||
      preview.includes(searchLower)
    );
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, "HH:mm");
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "dd/MM/yy");
    }
  };

  const getConversationName = (conv: Conversation) => {
    // For provider view, show customer name; for customer view, show provider name
    return isProviderView 
      ? (conv.customer_name || conv.provider_name || "Unknown")
      : (conv.provider_name || conv.customer_name || "Unknown");
  };

  const getConversationAvatar = (conv: Conversation) => {
    return conv.avatar || "";
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#e9edef]">
      {/* Search Header */}
      <div className="bg-[#f0f2f5] px-3 md:px-4 py-2.5 md:py-3 border-b border-[#e9edef] sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#667781] w-4 h-4 pointer-events-none" />
          <Input
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-lg bg-white border-[#e9edef] text-sm md:text-base py-5 md:py-6 focus-visible:ring-2 focus-visible:ring-[#008489]"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#667781] text-sm">Loading conversations...</div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <MessageSquare className="w-12 h-12 text-[#667781] mb-4" />
            <p className="text-[#667781] text-sm font-medium">No conversations</p>
            <p className="text-[#667781] text-xs mt-1">
              {searchQuery ? "No results found" : "Your conversations will appear here"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#e9edef]">
            {filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={`px-3 md:px-4 py-2.5 md:py-3 cursor-pointer active:bg-[#f5f6f6] hover:bg-[#f5f6f6] transition-colors ${
                  selectedConversationId === conversation.id ? "bg-[#f0f2f5]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0">
                    <AvatarImage src={getConversationAvatar(conversation)} alt={getConversationName(conversation)} />
                    <AvatarFallback className="bg-[#008489] text-white text-base md:text-lg">
                      {getConversationName(conversation).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-sm md:text-base text-[#111b21] truncate">
                        {getConversationName(conversation)}
                      </h3>
                      <span className="text-xs text-[#667781] flex-shrink-0 ml-2">
                        {formatTime(conversation.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-[#667781] truncate flex-1">
                        {conversation.last_message_preview 
                          ? conversation.last_message_preview
                          : conversation.booking_number
                          ? `Booking #${conversation.booking_number}`
                          : "No messages yet"}
                      </p>
                      {conversation.unread_count > 0 && (
                        <span className="bg-[#008489] text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center flex-shrink-0">
                          {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
