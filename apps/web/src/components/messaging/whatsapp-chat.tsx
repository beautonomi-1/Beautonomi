"use client";
import { useState, useRef, useEffect } from "react";
import { Send, ArrowLeft, MoreVertical, Phone, Tag, User, Mail, Copy, Check, Paperclip, X, File, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import CustomOfferModal from "./custom-offer-modal";
import Image from "next/image";

interface Attachment {
  url: string;
  type: string;
  name: string;
  size?: number;
  currency?: string;
  price?: number;
  duration_minutes?: number;
  offer_id?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string;
  content: string;
  attachments?: Attachment[];
  created_at: string;
  read_at?: string;
  is_read?: boolean;
}

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
  customer_avatar?: string;
}

interface WhatsAppChatProps {
  conversation: Conversation | null;
  currentUserId: string;
  onBack?: () => void;
  onConversationUpdate?: () => void;
  messagesEndpoint?: string; // Optional custom endpoint for messages
}

export default function WhatsAppChat({
  conversation,
  currentUserId,
  onBack,
  onConversationUpdate,
  messagesEndpoint,
}: WhatsAppChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustomOfferModal, setShowCustomOfferModal] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  
  // Determine if this is a provider chat (provider uses messagesEndpoint)
  const isProviderChat = !!messagesEndpoint;
  
  const handlePhoneCall = () => {
    if (!conversation?.provider_phone) {
      toast.error("Phone number not available");
      return;
    }
    // Open phone dialer
    window.location.href = `tel:${conversation.provider_phone}`;
  };
  
  const handleCopyPhone = async () => {
    if (!conversation?.provider_phone) {
      toast.error("Phone number not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(conversation.provider_phone);
      setCopiedPhone(true);
      toast.success("Phone number copied");
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      toast.error("Failed to copy phone number");
    }
  };
  
  const handleCopyEmail = async () => {
    if (!conversation?.provider_email) {
      toast.error("Email not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(conversation.provider_email);
      setCopiedEmail(true);
      toast.success("Email copied");
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error("Failed to copy email");
    }
  };
  
  const handleViewProfile = () => {
    if (isProviderChat) {
      // Provider viewing customer profile
      if (!conversation?.customer_id) {
        toast.error("Customer information not available");
        return;
      }
      window.location.href = `/provider/customers/${conversation.customer_id}/profile`;
    } else {
      // Customer viewing provider profile
      if (!conversation?.provider_id) {
        toast.error("Provider information not available");
        return;
      }
      window.location.href = `/partner-profile?slug=${conversation.provider_id}`;
    }
  };

  const handleDeleteConversation = async () => {
    if (!conversation || !conversation.id) {
      toast.error("Cannot delete: Conversation ID is missing");
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      const endpoint = isProviderChat
        ? `/api/provider/conversations/${conversation.id}`
        : `/api/me/conversations/${conversation.id}`;

      await fetcher.delete(endpoint);
      
      toast.success("Conversation deleted");
      setShowDeleteDialog(false);
      
      // Call onConversationUpdate to refresh the list
      if (onConversationUpdate) {
        onConversationUpdate();
      }
      
      // Navigate back to conversation list
      if (onBack) {
        onBack();
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Failed to delete conversation. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types and sizes
    const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
    const allowedDocTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedDocTypes];
    
    const maxImageSize = 10 * 1024 * 1024; // 10MB
    const maxVideoSize = 50 * 1024 * 1024; // 50MB
    const maxDocSize = 10 * 1024 * 1024; // 10MB

    const validFiles: File[] = [];
    const _previews: Array<{ file: File; preview: string }> = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid file type`);
        continue;
      }

      let maxSize = maxDocSize;
      if (allowedImageTypes.includes(file.type)) {
        maxSize = maxImageSize;
      } else if (allowedVideoTypes.includes(file.type)) {
        maxSize = maxVideoSize;
      }

      if (file.size > maxSize) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        toast.error(`${file.name}: File too large (max ${sizeMB}MB)`);
        continue;
      }

      validFiles.push(file);

      // Create preview for images
      if (allowedImageTypes.includes(file.type)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = e.target?.result as string;
          setFilePreviews((prev) => [...prev, { file, preview }]);
        };
        reader.readAsDataURL(file);
      }
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      toast.success(`${validFiles.length} file(s) selected`);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setFilePreviews([]);
  };

  const isImage = (type: string) => {
    return type.startsWith("image/");
  };

  const isVideo = (type: string) => {
    return type.startsWith("video/");
  };

  // Check if user is near bottom of messages
  const checkIfNearBottom = () => {
    if (!messagesContainerRef.current) return false;
    const container = messagesContainerRef.current;
    const threshold = 100; // pixels from bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    isNearBottomRef.current = isNearBottom;
    return isNearBottom;
  };

  // Scroll to bottom when new messages arrive (only if user is near bottom or it's their own message)
  useEffect(() => {
    if (messages.length === 0) return;
    
    // On initial load, scroll to bottom once (but only if chat is visible)
    if (!hasInitiallyScrolled) {
      // Wait a bit longer to ensure the container is rendered
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          scrollToBottom(false); // Instant scroll on initial load
          setHasInitiallyScrolled(true);
        }
      }, 200);
      return;
    }
    
    // For new messages, only auto-scroll if user is near bottom or should auto-scroll
    if (shouldAutoScroll || isNearBottomRef.current) {
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          scrollToBottom(true); // Smooth scroll for new messages
          setShouldAutoScroll(false);
        }
      }, 50);
    }
  }, [messages.length, hasInitiallyScrolled, shouldAutoScroll]);
  
  // Track scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      checkIfNearBottom();
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-focus input after sending message
  useEffect(() => {
    if (!isSending && messageInput === "") {
      inputRef.current?.focus();
    }
  }, [isSending, messageInput]);

  // Load messages when conversation changes. Defer realtime so React Strict Mode unmount doesn't call removeChannel before connect.
  useEffect(() => {
    if (conversation) {
      setHasInitiallyScrolled(false);
      setShouldAutoScroll(false);
      loadMessages();
      let cancelled = false;
      let unsubscribe: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (!cancelled) unsubscribe = subscribeToMessages();
      }, 200);
      setTimeout(() => inputRef.current?.focus(), 100);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch {
            // Ignore when channel is still connecting
          }
        }
      };
    } else {
      setMessages([]);
      setHasInitiallyScrolled(false);
    }
  }, [conversation?.id]);

  const scrollToBottom = (smooth: boolean = true) => {
    // Scroll the messages container, not the entire page
    const container = messagesContainerRef.current;
    if (container) {
      // Prevent any window/document scrolling
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
      });
      
      // Restore window scroll position if it changed (shouldn't happen, but safety check)
      requestAnimationFrame(() => {
        if (window.scrollY !== scrollTop || document.documentElement.scrollTop !== scrollTop) {
          window.scrollTo(0, scrollTop);
        }
      });
    }
  };

  const loadMessages = async () => {
    if (!conversation) return;
    try {
      setIsLoading(true);
      const endpoint = messagesEndpoint
        ? `/api/provider/conversations/${conversation.id}/messages`
        : `/api/me/messages?conversation_id=${conversation.id}`;
      const response = await fetcher.get<unknown>(endpoint);
      // Normalize: API may return { data: [...] }, { data: { messages: [...] } }, { messages: [...] }, or raw array
      const data = response && typeof response === "object" && "data" in response ? (response as { data: unknown }).data : response;
      let raw: unknown = [];
      if (Array.isArray(data)) {
        raw = data;
      } else if (data && typeof data === "object" && "messages" in data) {
        const m = (data as { messages: unknown }).messages;
        raw = Array.isArray(m) ? m : [];
      } else if (data && typeof data === "object" && "data" in data) {
        const d = (data as { data: unknown }).data;
        raw = Array.isArray(d) ? d : [];
      }
      const list: Message[] = Array.isArray(raw) ? raw : [];
      const transformed = list.map((msg: any) => ({
        ...msg,
        sender_role: msg.sender_type || msg.sender_role,
      }));
      transformed.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(transformed);
    } catch (err) {
      setMessages([]);
      toast.error("Failed to load messages");
      console.error("Error loading messages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToMessages = () => {
    if (!conversation) return () => {};
    
    const supabase = getSupabaseClient();
    const channelName = `messages:${conversation.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            const safePrev = Array.isArray(prev) ? prev : [];
            // Remove any temporary optimistic messages with same content from same sender
            const filtered = safePrev.filter((m) => 
              !(m.id.startsWith('temp-') && 
                m.sender_id === newMessage.sender_id && 
                m.content === newMessage.content &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 5000)
            );
            
            // Avoid duplicates (check by ID)
            if (filtered.some((m) => m.id === newMessage.id)) {
              return filtered;
            }
            
            // Add new message and sort to maintain order
            const updated = [...filtered, newMessage];
            updated.sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            // Auto-scroll if it's a new message from current user or user is near bottom
            const isOwnMessage = newMessage.sender_id === currentUserId;
            if (isOwnMessage || isNearBottomRef.current) {
              setShouldAutoScroll(true);
            }
            return updated;
          });
          // Only update conversation list if it's not our own message (to avoid duplicate updates)
          // For own messages, we already handled it optimistically
          if (onConversationUpdate && newMessage.sender_id !== currentUserId) {
            // Debounce the update to prevent excessive calls
            setTimeout(() => {
              onConversationUpdate();
            }, 500);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          // Update message read status when it's marked as read
          const updatedMessage = payload.new as Message;
          setMessages((prev) => {
            const safePrev = Array.isArray(prev) ? prev : [];
            return safePrev.map((msg) => 
              msg.id === updatedMessage.id
                ? { ...msg, read_at: updatedMessage.read_at, is_read: updatedMessage.is_read }
                : msg
            );
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`Subscribed to messages for conversation ${conversation.id}`);
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
      }
    };
  };

  const sendMessage = async () => {
    if ((!messageInput.trim() && selectedFiles.length === 0) || !conversation || isSending || isUploading) return;

    const messageContent = messageInput.trim();
    const tempId = `temp-${Date.now()}`;
    let uploadedAttachments: Attachment[] = [];

    // Upload files first if any
    if (selectedFiles.length > 0) {
      try {
        setIsUploading(true);
        const formData = new FormData();
        formData.append("conversation_id", conversation.id);
        selectedFiles.forEach((file) => {
          formData.append("files", file);
        });

        const uploadResponse = await fetch("/api/me/messages/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error?.message || "Failed to upload files");
        }

        const uploadData = await uploadResponse.json();
        uploadedAttachments = uploadData.data?.attachments || [];
      } catch (err: any) {
        toast.error(err.message || "Failed to upload files");
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // Optimistic UI update - show message immediately
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: currentUserId,
      content: messageContent || (uploadedAttachments.length > 0 ? "📎 Attachment" : ""),
      attachments: uploadedAttachments,
      created_at: new Date().toISOString(),
      read_at: undefined,
    };
    
    setMessages((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const updated = [...safePrev, optimisticMessage];
      updated.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return updated;
    });
    setMessageInput("");
    clearFiles();
    setShouldAutoScroll(true); // Auto-scroll for own messages
    
    try {
      setIsSending(true);
      // Use custom endpoint if provided, otherwise use default
      if (messagesEndpoint) {
        // For provider endpoint: /api/provider/conversations/[id]/messages
        await fetcher.post(`/api/provider/conversations/${conversation.id}/messages`, {
          content: messageContent || "",
          attachments: uploadedAttachments,
        });
      } else {
        // For customer endpoint: /api/me/messages
        await fetcher.post("/api/me/messages", {
          conversation_id: conversation.id,
          content: messageContent || "",
          attachments: uploadedAttachments,
        });
      }
      // Real-time subscription will update with actual message (replacing temp one)
      // Don't call onConversationUpdate here - let the subscription handle it
      // This prevents duplicate reloads and keeps the UI seamless
    } catch (err) {
      // Remove optimistic message on error
      setMessages((prev) => (Array.isArray(prev) ? prev : []).filter((m) => m.id !== tempId));
      
      // Handle subscription limit errors with better messaging
      let errorMessage = "Failed to send message";
      if (err instanceof FetchError) {
        if (err.status === 403 && err.message?.includes("subscription")) {
          errorMessage = "Message limit reached. Please upgrade your plan to send more messages.";
        } else {
          errorMessage = err.message || "Failed to send message";
        }
      }
      
      toast.error(errorMessage);
      console.error("Error sending message:", err);
      // Restore message input and files
      setMessageInput(messageContent);
      setSelectedFiles(selectedFiles);
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, "HH:mm");
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "dd/MM/yyyy");
    }
  };

  const getContactName = () => {
    if (!conversation) return "";
    // For provider chat, show customer name; for customer chat, show provider name
    if (isProviderChat) {
      return conversation.customer_name || "Customer";
    } else {
      return conversation.provider_name || "Provider";
    }
  };

  const getContactAvatar = () => {
    if (!conversation) return "";
    // For provider chat, show customer avatar; for customer chat, show provider avatar
    if (isProviderChat) {
      return conversation.customer_avatar || conversation.avatar || "";
    } else {
      return conversation.avatar || "";
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-col h-full bg-[#f0f2f5] items-center justify-center">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-full bg-[#FF0077] mx-auto mb-4 flex items-center justify-center">
            <Send className="w-8 h-8 text-white" />
          </div>
          <p className="text-[#667781] text-sm">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 overflow-hidden relative">
      {/* Header - Beautonomi brand */}
      <div className="bg-[#FF0077] text-white px-3 md:px-4 py-3 flex items-center gap-2 md:gap-3 shadow-md sticky top-0 z-20 flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-1 hover:bg-white/10 rounded-full transition-colors active:bg-white/20"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        <Avatar className="w-9 h-9 md:w-10 md:h-10 border-2 border-white/20 flex-shrink-0">
          <AvatarImage src={getContactAvatar()} alt={getContactName()} />
          <AvatarFallback className="bg-white/20 text-white">
            {getContactName().charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm md:text-base truncate">{getContactName()}</h2>
          {conversation.booking_number && (
            <p className="text-xs text-white/80 truncate">Booking #{conversation.booking_number}</p>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {isProviderChat && conversation.customer_id && (
            <button
              onClick={() => setShowCustomOfferModal(true)}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors"
              title="Send Custom Offer"
            >
              <Tag className="w-5 h-5" />
            </button>
          )}
          {!isProviderChat && conversation.provider_phone && (
            <button
              onClick={handlePhoneCall}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors"
              title="Call"
            >
              <Phone className="w-5 h-5" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white">
              {isProviderChat && conversation.customer_id && (
                <>
                  <DropdownMenuItem onClick={() => setShowCustomOfferModal(true)}>
                    <Tag className="w-4 h-4 mr-2" />
                    Send Custom Offer
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleViewProfile}>
                    <User className="w-4 h-4 mr-2" />
                    View Customer Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {conversation.provider_id && !isProviderChat && (
                <DropdownMenuItem onClick={handleViewProfile}>
                  <User className="w-4 h-4 mr-2" />
                  View Provider Profile
                </DropdownMenuItem>
              )}
              {conversation.provider_phone && (
                <>
                  <DropdownMenuItem onClick={handleCopyPhone}>
                    {copiedPhone ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Phone Number
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePhoneCall}>
                    <Phone className="w-4 h-4 mr-2" />
                    Call {conversation.provider_phone}
                  </DropdownMenuItem>
                </>
              )}
              {conversation.provider_email && (
                <DropdownMenuItem onClick={handleCopyEmail}>
                  {copiedEmail ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Copy Email
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {conversation.id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Conversation
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone and all messages will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Messages Area - Scrollable container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-2 bg-[#efeae2] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ddded6%22%20fill-opacity%3D%220.4%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] messages-container min-h-0 md:pb-4"
        style={{ 
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
          paddingBottom: selectedFiles.length > 0 
            ? 'calc(140px + 4rem + env(safe-area-inset-bottom, 0px))' // Input + previews + bottom nav (~64px/4rem)
            : 'calc(80px + 4rem + env(safe-area-inset-bottom, 0px))', // Input + bottom nav on mobile
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#667781] text-sm">Loading messages...</div>
          </div>
        ) : (() => {
          const messageList = Array.isArray(messages) ? messages : [];
          return messageList.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[#667781] text-sm">No messages yet</p>
                <p className="text-[#667781] text-xs mt-1">Start the conversation!</p>
              </div>
            </div>
          ) : (
          messageList.map((message, index) => {
            const isOwnMessage = message.sender_id === currentUserId;
            const _showTime =
              index === messageList.length - 1 ||
              new Date(message.created_at).getTime() -
                new Date(messageList[index + 1]?.created_at || message.created_at).getTime() >
                300000; // 5 minutes

            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[60%] rounded-lg px-3 py-2 shadow-sm ${
                    isOwnMessage
                      ? "bg-[#FFE5F0] rounded-tr-none"
                      : "bg-white rounded-tl-none"
                  }`}
                >
                  {!isOwnMessage && message.sender_name && (
                    <p className="text-xs font-semibold text-[#FF0077] mb-1">
                      {message.sender_name}
                    </p>
                  )}
                  {Array.isArray(message.attachments) &&
                  message.attachments.length > 0 &&
                  message.attachments[0]?.type === "custom_offer" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-[#111b21]">{message.content}</p>
                      <div className="rounded-md border border-[#FF0077]/20 bg-white/50 p-3">
                        <div className="flex flex-col gap-3">
                          <div className="text-sm">
                            <div className="font-semibold text-[#111b21]">Custom Offer</div>
                            <div className="text-xs text-[#667781] mt-1">
                              {message.attachments[0]?.currency} {message.attachments[0]?.price} •{" "}
                              {message.attachments[0]?.duration_minutes} mins
                            </div>
                          </div>
                          {!messagesEndpoint && message.attachments[0]?.offer_id && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  const response = await fetcher.post<{ data: { payment_url?: string } }>(
                                    `/api/me/custom-offers/${message.attachments[0]?.offer_id}/accept`,
                                    {}
                                  );
                                  const paymentUrl = response.data?.payment_url;
                                  if (paymentUrl) {
                                    window.location.href = paymentUrl;
                                  } else {
                                    toast.error("Payment link was not returned");
                                  }
                                } catch (err) {
                                  toast.error("Failed to accept offer");
                                  console.error(err);
                                }
                              }}
                              className="bg-[#FF0077] hover:bg-[#E6006A] text-white text-xs"
                            >
                              Accept & Pay
                            </Button>
                          )}
                        </div>
                      </div>
                      {!messagesEndpoint && (
                        <div className="text-xs text-[#667781]">
                          Or view:{" "}
                          <a
                            href="/account-settings/custom-requests"
                            className="underline text-[#FF0077]"
                          >
                            Custom Requests
                          </a>
                        </div>
                      )}
                    </div>
                  ) : Array.isArray(message.attachments) &&
                    message.attachments.length > 0 &&
                    message.attachments[0]?.type === "custom_request" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-[#111b21]">{message.content}</p>
                      <div className="rounded-md border border-[#FF0077]/20 bg-white/50 p-3">
                        <div className="text-sm font-semibold text-[#111b21]">Custom Request</div>
                        <div className="text-xs text-[#667781] mt-1">
                          {messagesEndpoint ? (
                            <>
                              Track it in{" "}
                              <a
                                href="/provider/custom-requests"
                                className="underline text-[#FF0077]"
                              >
                                Custom Requests
                              </a>
                            </>
                          ) : (
                            <>
                              View & respond in{" "}
                              <a
                                href="/account-settings/custom-requests"
                                className="underline text-[#FF0077]"
                              >
                                Custom Requests
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Display attachments (excluding custom_offer which is handled above) */}
                      {Array.isArray(message.attachments) && 
                       message.attachments.length > 0 && 
                       message.attachments.filter(a => a.type !== "custom_offer" && a.type !== "custom_request").length > 0 && (
                        <div className="space-y-2 mb-2">
                          {message.attachments
                            .filter(a => a.type !== "custom_offer" && a.type !== "custom_request")
                            .map((attachment, idx) => (
                            <div key={idx} className="rounded-lg overflow-hidden">
                              {isImage(attachment.type) ? (
                                <div className="relative max-w-full">
                                  <Image
                                    src={attachment.url}
                                    alt={attachment.name || "Image"}
                                    width={300}
                                    height={300}
                                    className="rounded-lg object-cover max-w-full h-auto cursor-pointer"
                                    onClick={() => window.open(attachment.url, "_blank")}
                                    unoptimized
                                  />
                                </div>
                              ) : isVideo(attachment.type) ? (
                                <div className="relative max-w-full">
                                  <video
                                    src={attachment.url}
                                    controls
                                    className="rounded-lg max-w-full h-auto max-h-[400px]"
                                    preload="metadata"
                                  >
                                    Your browser does not support the video tag.
                                  </video>
                                </div>
                              ) : (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-white/50 rounded border border-gray-200 hover:bg-white/70 transition-colors"
                                >
                                  <File className="w-5 h-5 text-[#FF0077]" />
                                  <span className="text-sm text-[#111b21] truncate flex-1">
                                    {attachment.name || "Document"}
                                  </span>
                                  <span className="text-xs text-[#667781]">
                                    {attachment.size ? `${Math.round(attachment.size / 1024)}KB` : ""}
                                  </span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Message content */}
                      {message.content && (
                        <p className="text-sm text-[#111b21] whitespace-pre-wrap break-words whatsapp-message-bubble">
                          {message.content}
                        </p>
                      )}
                    </>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-[#667781]">
                      {formatMessageTime(message.created_at)}
                    </span>
                    {isOwnMessage && (
                      <span 
                        className={`text-[10px] ${
                          message.read_at 
                            ? "text-[#FF0077]"
                            : "text-[#667781]"
                        }`}
                        title={
                          message.read_at 
                            ? "Read" 
                            : "Delivered"
                        }
                      >
                        {message.read_at ? "✓✓" : "✓✓"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
          ); })()}
        <div ref={messagesEndRef} />
      </div>

      {/* File Previews */}
      {selectedFiles.length > 0 && (
        <div 
          className="bg-white px-3 md:px-4 py-2 border-t border-gray-200 flex-shrink-0 fixed md:relative left-0 right-0"
          style={{
            zIndex: 55, // Above bottom nav (z-50) but below input (z-60)
            bottom: 'calc(4rem + 5rem + env(safe-area-inset-bottom, 0px))', // Above input bar (~80px/5rem) + bottom nav (~64px/4rem)
          }}
        >
          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative flex-shrink-0">
                {isImage(file.type) ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                    <Image
                      src={filePreviews.find(p => p.file === file)?.preview || ""}
                      alt={file.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="relative w-20 h-20 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center">
                    {isVideo(file.type) ? (
                      <Play className="w-6 h-6 text-[#FF0077]" />
                    ) : (
                      <File className="w-6 h-6 text-[#FF0077]" />
                    )}
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-[#667781] mt-1 truncate w-20" title={file.name}>
                  {file.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area - WhatsApp style - Sticky at bottom - Above bottom nav (z-50) */}
      <div 
        className="bg-white px-3 md:px-4 py-2 md:py-3 border-t border-gray-200 flex-shrink-0 md:sticky md:bottom-0 fixed left-0 right-0"
        style={{
          zIndex: 60, // Above bottom nav (z-50)
          bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))', // ~64px (4rem) for bottom nav height on mobile
        }}
      >
        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
            className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5 text-[#FF0077]" />
          </button>
          
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={selectedFiles.length > 0 ? "Add a caption (optional)" : "Type a message"}
              className="rounded-full border-gray-200 bg-gray-100 focus:bg-white focus:border-[#FF0077] pr-12 py-5 md:py-6 text-sm md:text-base message-input"
              disabled={isSending || isUploading}
              autoFocus
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={(!messageInput.trim() && selectedFiles.length === 0) || isSending || isUploading}
            className="rounded-full bg-[#FF0077] hover:bg-[#E6006A] active:bg-[#D60565] text-white p-2.5 md:p-3 h-auto w-auto min-w-[44px] md:min-w-[48px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Custom Offer Modal */}
      {isProviderChat && conversation.customer_id && (
        <CustomOfferModal
          isOpen={showCustomOfferModal}
          onClose={() => setShowCustomOfferModal(false)}
          customerId={conversation.customer_id}
          customerName={conversation.customer_name}
          onSuccess={() => {
            // Reload messages to show the new offer message
            // Use a small delay to let the database commit first
            setTimeout(() => {
              loadMessages();
              if (onConversationUpdate) {
                onConversationUpdate();
              }
            }, 300);
          }}
        />
      )}
    </div>
  );
}
