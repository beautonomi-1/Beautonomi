"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { Send, ArrowLeft, MoreVertical, Phone, Tag, User, Mail, Copy, Check, Paperclip, X, File, Play, Trash2, Undo2, Info, Loader2, ExternalLink, Clock, MapPin, FileText } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import CustomOfferModal from "./custom-offer-modal";
import { CustomOfferCard } from "@beautonomi/ui/web";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Attachment {
  url: string;
  type: string;
  name: string;
  size?: number;
  currency?: string;
  price?: number;
  duration_minutes?: number;
  offer_id?: string;
  /** Present on custom-offer / booking-linked attachments from messaging API. */
  booking_number?: string | null;
  preferred_start_at?: string | null;
  withdrawn?: boolean;
  /** Set when file URLs are past retention or removed server-side */
  expired?: boolean;
  /** Custom offer lifecycle: pending | payment_pending | paid | expired | withdrawn | declined */
  status?: string;
  booking_id?: string | null;
  notes?: string | null;
  expiration_at?: string | null;
  request_id?: string | null;
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
  customer_phone?: string | null;
  customer_email?: string | null;
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
  initialOfferId?: string | null;
}

export default function WhatsAppChat({
  conversation,
  currentUserId,
  onBack,
  onConversationUpdate,
  messagesEndpoint,
  initialOfferId,
}: WhatsAppChatProps) {
  const clientMounted = useClientMounted();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustomOfferModal, setShowCustomOfferModal] = useState(false);
  const [editOfferId, setEditOfferId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Offer detail sheet
  const [offerDetailOpen, setOfferDetailOpen] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<Record<string, any> | null>(null);
  // Payment option (full vs deposit) for customer Accept & Pay from chat
  const [paymentOptionOpen, setPaymentOptionOpen] = useState(false);
  const [selectedOfferIdForPayment, setSelectedOfferIdForPayment] = useState<string | null>(null);
  const [isAcceptingOffer, setIsAcceptingOffer] = useState(false);
  const [paymentQuote, setPaymentQuote] = useState<{
    pricing?: {
      totalAmount?: number;
      subtotal?: number;
      travelFee?: number;
      promotionDiscountAmount?: number;
      membershipDiscountAmount?: number;
      loyaltyDiscountAmount?: number;
      taxAmount?: number;
      serviceFeeAmount?: number;
      tipAmount?: number;
    };
    deposit?: { required?: boolean; percentage?: number; deposit_amount?: number; full_total?: number };
  } | null>(null);
  const [paymentQuoteLoading, setPaymentQuoteLoading] = useState(false);
  const [paymentOfferCurrency, setPaymentOfferCurrency] = useState<string | undefined>(undefined);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  /** When message attachment JSON lags behind DB (e.g. after payment). */
  const [offerStatusById, setOfferStatusById] = useState<
    Record<string, { status: string; booking_id: string | null }>
  >({});
  const offerStatusByIdRef = useRef(offerStatusById);
  offerStatusByIdRef.current = offerStatusById;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  
  // Determine if this is a provider chat (provider uses messagesEndpoint)
  const isProviderChat = !!messagesEndpoint;
  
  // In provider view use customer contact; in customer view use provider contact
  const contactPhone = isProviderChat ? conversation?.customer_phone : conversation?.provider_phone;
  const contactEmail = isProviderChat ? conversation?.customer_email : conversation?.provider_email;

  const handlePhoneCall = () => {
    if (!contactPhone) {
      toast.error("Phone number not available");
      return;
    }
    window.location.href = `tel:${contactPhone}`;
  };

  const handleCopyPhone = async () => {
    if (!contactPhone) {
      toast.error("Phone number not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(contactPhone);
      setCopiedPhone(true);
      toast.success("Phone number copied");
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      toast.error("Failed to copy phone number");
    }
  };

  const handleCopyEmail = async () => {
    if (!contactEmail) {
      toast.error("Email not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(contactEmail);
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

  const openOfferDetail = async (offerId: string) => {
    setOfferDetailOpen(true);
    setOfferDetailLoading(true);
    setOfferDetailData(null);
    try {
      const endpoint = isProviderChat
        ? `/api/provider/custom-offers/${offerId}`
        : `/api/me/custom-offers/${offerId}`;
      const res = await fetcher.get<{ data: Record<string, any> }>(endpoint);
      setOfferDetailData(res.data);
    } catch {
      toast.error("Failed to load offer details");
      setOfferDetailOpen(false);
    } finally {
      setOfferDetailLoading(false);
    }
  };

  const handleDeclineOffer = async (offerId: string) => {
    if (!window.confirm("Decline this custom offer? The provider will be notified.")) return;
    setDecliningOfferId(offerId);
    try {
      await fetcher.post(`/api/me/custom-offers/${offerId}/decline`, {});
      toast.success("Offer declined");
      setPaymentOptionOpen(false);
      setOfferDetailOpen(false);
      await loadMessages();
      onConversationUpdate?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to decline offer");
    } finally {
      setDecliningOfferId(null);
    }
  };

  const handleAcceptOffer = async (offerId: string, paymentOption: "full" | "deposit" = "full") => {
    setIsAcceptingOffer(true);
    try {
      const res = await fetcher.post<{ data: { paymentUrl?: string; payment_url?: string; charged?: boolean } }>(
        `/api/me/custom-offers/${offerId}/pay`,
        { payment_option: paymentOption },
      );
      const url = res.data?.paymentUrl ?? res.data?.payment_url;
      if (url) {
        window.location.href = url;
      } else if (res.data?.charged) {
        toast.success("Payment successful — booking confirmed!");
        setPaymentOptionOpen(false);
        setOfferDetailOpen(false);
        setTimeout(() => loadMessages(), 600);
      } else {
        toast.error("Unable to start payment. Please try again.");
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to accept offer");
    } finally {
      setIsAcceptingOffer(false);
    }
  };

  const openPaymentDialog = async (offerId: string, currency?: string) => {
    setSelectedOfferIdForPayment(offerId);
    setPaymentOfferCurrency(currency);
    setPaymentQuote(null);
    setPaymentOptionOpen(true);
    setPaymentQuoteLoading(true);
    try {
      const res = await fetcher.get<{ data: typeof paymentQuote }>(`/api/me/custom-offers/${offerId}/quote`);
      setPaymentQuote(res.data ?? null);
    } catch {
      // Graceful fallback — dialog still works without quote data
    } finally {
      setPaymentQuoteLoading(false);
    }
  };

  const formatPaymentMoney = useCallback((amount: number, currency?: string) => {
    if (!currency) return amount.toFixed(2);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }, []);

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
    setShowScrollToBottom(!isNearBottom);
    return isNearBottom;
  };

  // Scroll to bottom when new messages arrive (only if user is near bottom or it's their own message)
  useEffect(() => {
    if (messages.length === 0) return;

    // On initial load / thread switch: snap to bottom immediately, again after layout, and once more
    // after images/async content change scrollHeight (same pattern as native apps).
    if (!hasInitiallyScrolled) {
      const snap = () => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        }
      };
      snap();
      requestAnimationFrame(() => {
        requestAnimationFrame(snap);
      });
      const idle = window.setTimeout(() => {
        snap();
        setHasInitiallyScrolled(true);
      }, 400);
      return () => window.clearTimeout(idle);
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
      setOfferStatusById({});
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
      setOfferStatusById({});
    }
  }, [conversation?.id]);

  // Re-fetch custom offer rows when bubbles still show pending / payment_pending (stale attachments).
  useEffect(() => {
    if (!messages.length) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const base = isProviderChat ? "/api/provider/custom-offers" : "/api/me/custom-offers";
      const offerIds = new Set<string>();
      for (const message of messages) {
        const first = message.attachments?.[0];
        if (!first || first.type !== "custom_offer" || !first.offer_id) continue;
        const st = (first.status || "").toLowerCase();
        if (st === "pending" || st === "payment_pending" || !st) {
          const known = offerStatusByIdRef.current[first.offer_id];
          const knownSt = (known?.status || "").toLowerCase();
          if (
            knownSt === "paid" ||
            knownSt === "declined" ||
            knownSt === "withdrawn" ||
            knownSt === "expired"
          ) {
            continue;
          }
          offerIds.add(first.offer_id);
        }
      }
      if (offerIds.size === 0 || cancelled) return;
      void (async () => {
        const patch: Record<string, { status: string; booking_id: string | null }> = {};
        await Promise.all(
          [...offerIds].map(async (oid) => {
            try {
              const res = await fetcher.get<{ data: { status?: string; booking_id?: string | null } }>(
                `${base}/${encodeURIComponent(oid)}`,
              );
              const row = res.data;
              if (!row?.status) return;
              patch[oid] = { status: row.status, booking_id: row.booking_id ?? null };
            } catch {
              /* ignore */
            }
          }),
        );
        if (!cancelled && Object.keys(patch).length > 0) {
          setOfferStatusById((prev) => ({ ...prev, ...patch }));
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [messages, isProviderChat]);

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
      const response = await fetcher.get<any>(endpoint);
      // Normalize: API may return { data: [...] }, { data: { messages: [...] } }, { messages: [...] }, or raw array
      const data = response && typeof response === "object" && "data" in response ? (response as { data: any }).data : response;
      let raw: any = [];
      if (Array.isArray(data)) {
        raw = data;
      } else if (data && typeof data === "object" && "messages" in data) {
        const m = (data as { messages: any }).messages;
        raw = Array.isArray(m) ? m : [];
      } else if (data && typeof data === "object" && "data" in data) {
        const d = (data as { data: any }).data;
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
          // Merge read status AND attachments so offer lifecycle patches update live.
          const updatedMessage = payload.new as Message;
          setMessages((prev) => {
            const safePrev = Array.isArray(prev) ? prev : [];
            return safePrev.map((msg) =>
              msg.id === updatedMessage.id
                ? {
                    ...msg,
                    read_at: updatedMessage.read_at,
                    is_read: updatedMessage.is_read,
                    // Merge updated attachments (e.g. offer status patch by webhook)
                    attachments: Array.isArray(updatedMessage.attachments) && updatedMessage.attachments.length > 0
                      ? updatedMessage.attachments
                      : msg.attachments,
                    content: updatedMessage.content || msg.content,
                  }
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

    // Second channel: custom_offers status changes so offer cards update immediately
    // when a customer pays, without waiting for the message attachment patch.
    // RLS ensures we only receive rows the authenticated user can read.
    const offerChannel = supabase
      .channel(`${channelName}-offers`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "custom_offers" },
        (payload) => {
          const row = payload.new as { id?: string; status?: string; booking_id?: string | null };
          const oid = row.id;
          const status = row.status;
          const bookingId = row.booking_id ?? null;
          if (!oid || !status) return;
          setOfferStatusById((prev) => {
            if (!(oid in prev) && status === "pending") return prev;
            return { ...prev, [oid]: { status, booking_id: bookingId } };
          });
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
      }
      try {
        supabase.removeChannel(offerChannel);
      } catch {
        // Ignore
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
      
      let errorMessage = "Failed to send message";
      if (err instanceof FetchError) {
        if (err.status === 403 && (err.message?.includes("subscription") || err.message?.includes("plan"))) {
          errorMessage = "Messaging is not available on your current plan. Please upgrade your subscription to enable chat.";
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
    if (!clientMounted) return "\u2013";
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
          <div className="w-16 h-16 rounded-full bg-primary mx-auto mb-4 flex items-center justify-center">
            <Send className="w-8 h-8 text-white" />
          </div>
          <p className="text-[#667781] text-sm">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-100 overflow-hidden relative">
      {/* Header - Beautonomi brand (column header; scroll is messages only) */}
      <div className="bg-primary text-white px-3 md:px-4 py-3 flex items-center gap-2 md:gap-3 shadow-md z-20 flex-shrink-0">
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
          {contactPhone && (
            <button
              onClick={handlePhoneCall}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors"
              title={isProviderChat ? "Call client" : "Call"}
            >
              <Phone className="w-5 h-5" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors flex items-center gap-1"
                title={isProviderChat ? "Client details & options" : "More options"}
                aria-label={isProviderChat ? "Client details and options" : "More options"}
              >
                {isProviderChat ? (
                  <>
                    <Info className="w-5 h-5 md:w-5 md:h-5" />
                    <span className="hidden sm:inline text-xs font-medium">Details</span>
                  </>
                ) : (
                  <MoreVertical className="w-5 h-5" />
                )}
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
                  {(contactPhone || contactEmail) && <DropdownMenuSeparator />}
                </>
              )}
              {conversation.provider_id && !isProviderChat && (
                <DropdownMenuItem onClick={handleViewProfile}>
                  <User className="w-4 h-4 mr-2" />
                  View Provider Profile
                </DropdownMenuItem>
              )}
              {contactPhone && (
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
                        {isProviderChat ? "Copy client phone" : "Copy Phone Number"}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePhoneCall}>
                    <Phone className="w-4 h-4 mr-2" />
                    Call {contactPhone}
                  </DropdownMenuItem>
                </>
              )}
              {contactEmail && (
                <DropdownMenuItem onClick={handleCopyEmail}>
                  {copiedEmail ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      {isProviderChat ? "Copy client email" : "Copy Email"}
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
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 md:p-4 pb-2 md:pb-4 space-y-2 bg-[#efeae2] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ddded6%22%20fill-opacity%3D%220.4%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] messages-container"
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
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
                    <p className="text-xs font-semibold text-primary mb-1">
                      {message.sender_name}
                    </p>
                  )}
                  {Array.isArray(message.attachments) &&
                  message.attachments.length > 0 &&
                  message.attachments[0]?.type === "custom_offer" ? (() => {
                    const att = message.attachments[0];
                    const oid = att.offer_id ?? "";
                    const ov = oid ? offerStatusById[oid] : undefined;
                    return (
                    <div className="space-y-2">
                      {message.content && (
                        <p className="text-sm text-[#111b21]">{message.content}</p>
                      )}
                      <CustomOfferCard
                        attachment={att}
                        statusOverride={ov}
                        isMe={message.sender_id === currentUserId}
                        role={isProviderChat ? "provider" : "customer"}
                        onClick={() => att.offer_id && openOfferDetail(att.offer_id)}
                        onAccept={() => {
                          void openPaymentDialog(att.offer_id!, att.currency);
                        }}
                        onDecline={() => att.offer_id && void handleDeclineOffer(att.offer_id)}
                        isDeclineLoading={decliningOfferId === att.offer_id}
                        onResume={() => {
                          void openPaymentDialog(att.offer_id!, att.currency);
                        }}
                        onViewBooking={() => {
                          const bid = ov?.booking_id ?? att.booking_id ?? null;
                          if (bid) window.location.href = `/account-settings/bookings/${bid}`;
                        }}
                        onWithdraw={async () => {
                          try {
                            await fetcher.post(`/api/provider/custom-offers/${att.offer_id}/retract`, {});
                            toast.success("Offer withdrawn");
                            loadMessages();
                            onConversationUpdate?.();
                          } catch {
                            toast.error("Failed to retract offer");
                          }
                        }}
                        onEdit={() => {
                          setEditOfferId(att.offer_id ?? null);
                          setShowCustomOfferModal(true);
                        }}
                      />
                    </div>
                    );
                  })() : Array.isArray(message.attachments) &&
                    message.attachments.length > 0 &&
                    message.attachments[0]?.type === "custom_request" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-[#111b21]">{message.content}</p>
                      <div className="rounded-md border border-primary/20 bg-white/50 p-3">
                        <div className="text-sm font-semibold text-[#111b21]">Custom Request</div>
                        <div className="text-xs text-[#667781] mt-1">
                          {messagesEndpoint ? (
                            <>
                              Track it in{" "}
                              <a
                                href="/provider/custom-requests"
                                className="underline text-primary"
                              >
                                Custom Requests
                              </a>
                            </>
                          ) : (
                            <>
                              View & respond in{" "}
                              <a
                                href="/account-settings/custom-requests"
                                className="underline text-primary"
                              >
                                Custom Requests
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : Array.isArray(message.attachments) &&
                    message.attachments.length > 0 &&
                    message.attachments[0]?.type === "custom_offer_paid" ? (
                    <div className="space-y-2">
                      {message.content && (
                        <p className="text-sm text-[#111b21]">{message.content}</p>
                      )}
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-3">
                        <div className="text-emerald-600 text-xl mt-0.5">✓</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-emerald-800">Payment received — booking confirmed</div>
                          {message.attachments[0]?.booking_number && (
                            <div className="text-xs text-emerald-600 mt-0.5">#{message.attachments[0].booking_number}</div>
                          )}
                          {message.attachments[0]?.booking_id && (
                            <a
                              href={
                                isProviderChat
                                  ? `/provider/bookings/${message.attachments[0].booking_id}`
                                  : `/account-settings/bookings/${message.attachments[0].booking_id}`
                              }
                              className="text-xs text-emerald-700 underline mt-1 inline-block"
                            >
                              View Booking →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Display attachments (excluding custom_offer types which are handled above) */}
                      {Array.isArray(message.attachments) && 
                       message.attachments.length > 0 && 
                       message.attachments.filter(a => a.type !== "custom_offer" && a.type !== "custom_request" && a.type !== "custom_offer_paid").length > 0 && (
                        <div className="space-y-2 mb-2">
                          {message.attachments
                            .filter(a => a.type !== "custom_offer" && a.type !== "custom_request" && a.type !== "custom_offer_paid")
                            .map((attachment, idx) => (
                            <div key={idx} className="rounded-lg overflow-hidden">
                              {attachment.expired || !attachment.url ? (
                                <div className="flex items-center gap-2 p-3 bg-gray-100/80 rounded-lg border border-dashed border-gray-300 text-sm text-[#667781]">
                                  <File className="w-5 h-5 shrink-0 opacity-60" />
                                  <span>{attachment.name || "Attachment"} is no longer available (retention policy).</span>
                                </div>
                              ) : isImage(attachment.type) ? (
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
                                  <File className="w-5 h-5 text-primary" />
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
                            ? "text-primary"
                            : "text-[#667781]"
                        }`}
                        title={
                          message.read_at 
                            ? "Read" 
                            : "Delivered"
                        }
                      >
                        {message.read_at ? "✓✓" : "✓"}
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

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-[90px] right-4 z-30 w-10 h-10 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center text-[#667781] hover:text-[#111b21] hover:bg-gray-50 transition-all hover:scale-105 active:scale-95"
          aria-label="Scroll to bottom"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}

      {/* File Previews */}
      {selectedFiles.length > 0 && (
        <div className="bg-white px-3 md:px-4 py-2 border-t border-gray-200 flex-shrink-0 relative z-10">
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
                      <Play className="w-6 h-6 text-primary" />
                    ) : (
                      <File className="w-6 h-6 text-primary" />
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

      {/* Input area: in-flow footer; provider shell adds bottom padding for mobile nav */}
      <div
        className={cn(
          "bg-white px-3 md:px-4 py-2 md:py-3 border-t border-gray-200 flex-shrink-0 relative z-10",
          "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:pb-2"
        )}
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
            <Paperclip className="w-5 h-5 text-primary" />
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
              className="rounded-full border-gray-200 bg-gray-100 focus:bg-white focus:border-primary pr-12 py-5 md:py-6 text-sm md:text-base message-input"
              disabled={isSending || isUploading}
              autoFocus
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={(!messageInput.trim() && selectedFiles.length === 0) || isSending || isUploading}
            className="rounded-full bg-primary hover:bg-primary-hover active:bg-primary-hover text-white p-2.5 md:p-3 h-auto w-auto min-w-[44px] md:min-w-[48px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Custom Offer Modal (provider: create / edit) */}
      {isProviderChat && conversation.customer_id && (
        <CustomOfferModal
          isOpen={showCustomOfferModal}
          onClose={() => {
            setShowCustomOfferModal(false);
            setEditOfferId(null);
          }}
          customerId={conversation.customer_id}
          customerName={conversation.customer_name}
          conversationId={conversation.id}
          editOfferId={editOfferId}
          onSuccess={() => {
            setEditOfferId(null);
            setTimeout(() => {
              loadMessages();
              if (onConversationUpdate) {
                onConversationUpdate();
              }
            }, 300);
          }}
        />
      )}

      {/* Payment Option Dialog (customer: full vs deposit) */}
      <Dialog open={paymentOptionOpen} onOpenChange={(open) => { if (!isAcceptingOffer) setPaymentOptionOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Your Payment</DialogTitle>
            <DialogDescription>Confirm your booking by completing payment below.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {paymentQuoteLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {paymentQuote?.pricing ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Service subtotal</span>
                      <span className="font-medium text-gray-900">{formatPaymentMoney(Number(paymentQuote.pricing.subtotal ?? 0), paymentOfferCurrency)}</span>
                    </div>
                    {Number(paymentQuote.pricing.travelFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Travel fee</span>
                        <span className="font-medium text-gray-900">{formatPaymentMoney(Number(paymentQuote.pricing.travelFee ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.promotionDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">Promotion discount</span>
                        <span className="font-medium text-emerald-700">-{formatPaymentMoney(Number(paymentQuote.pricing.promotionDiscountAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.membershipDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">Membership discount</span>
                        <span className="font-medium text-emerald-700">-{formatPaymentMoney(Number(paymentQuote.pricing.membershipDiscountAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.loyaltyDiscountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700">Loyalty discount</span>
                        <span className="font-medium text-emerald-700">-{formatPaymentMoney(Number(paymentQuote.pricing.loyaltyDiscountAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.taxAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Tax</span>
                        <span className="font-medium text-gray-900">{formatPaymentMoney(Number(paymentQuote.pricing.taxAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.serviceFeeAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Platform fee</span>
                        <span className="font-medium text-gray-900">{formatPaymentMoney(Number(paymentQuote.pricing.serviceFeeAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                    {Number(paymentQuote.pricing.tipAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Tip</span>
                        <span className="font-medium text-gray-900">{formatPaymentMoney(Number(paymentQuote.pricing.tipAmount ?? 0), paymentOfferCurrency)}</span>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Pay in Full — always the primary recommended action */}
                <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-primary text-sm">Pay in Full</span>
                    <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full font-medium">Recommended</span>
                  </div>
                  {paymentQuote?.pricing?.totalAmount != null && (
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {formatPaymentMoney(paymentQuote.pricing.totalAmount, paymentOfferCurrency)}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mb-3">Secure instant confirmation · No balance due later</p>
                  <Button
                    className="w-full"
                    disabled={isAcceptingOffer}
                    onClick={() => selectedOfferIdForPayment && handleAcceptOffer(selectedOfferIdForPayment, "full")}
                  >
                    {isAcceptingOffer ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Pay in Full
                  </Button>
                </div>

                {/* Deposit — only show when provider requires it */}
                {paymentQuote?.deposit?.required && (
                  <>
                    <div className="flex items-center gap-2 my-1">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 whitespace-nowrap">or pay a deposit</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-gray-700">
                          Pay {paymentQuote.deposit.percentage}% Deposit
                        </span>
                        {paymentQuote.deposit.deposit_amount != null && (
                          <span className="text-sm font-semibold text-gray-900">
                            {formatPaymentMoney(paymentQuote.deposit.deposit_amount, paymentOfferCurrency)}
                          </span>
                        )}
                      </div>
                      {paymentQuote.deposit.full_total != null && paymentQuote.deposit.deposit_amount != null && (
                        <p className="text-xs text-gray-500 mb-2">
                          Remaining{" "}
                          {formatPaymentMoney(
                            paymentQuote.deposit.full_total! - paymentQuote.deposit.deposit_amount!,
                            paymentOfferCurrency,
                          )}{" "}
                          due before appointment
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-gray-600"
                        disabled={isAcceptingOffer}
                        onClick={() => selectedOfferIdForPayment && handleAcceptOffer(selectedOfferIdForPayment, "deposit")}
                      >
                        {isAcceptingOffer ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Pay Deposit Only
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" disabled={isAcceptingOffer} onClick={() => setPaymentOptionOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offer Detail Sheet */}
      <Dialog open={offerDetailOpen} onOpenChange={setOfferDetailOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Custom Offer Details</DialogTitle>
          </DialogHeader>
          {offerDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : offerDetailData ? (() => {
            const d = offerDetailData;
            const req = d.request ?? d;
            const rawStatus: string = String(d.status ?? "pending");
            const isPaidDetail = rawStatus === "paid" || !!d.booking_id;
            const isWithdrawnDetail = rawStatus === "withdrawn";
            const isExpiredDetail = rawStatus === "expired";
            const isDeclinedDetail = rawStatus === "declined";
            const isPaymentPendingDetail = rawStatus === "payment_pending";
            const statusLabel = isPaidDetail
              ? "Booked ✓"
              : isWithdrawnDetail
                ? "Withdrawn"
                : isDeclinedDetail
                  ? "Declined"
                  : isExpiredDetail
                    ? "Expired"
                    : isPaymentPendingDetail
                      ? "Payment in progress"
                      : "Pending";
            const statusClass = isPaidDetail
              ? "bg-emerald-100 text-emerald-700"
              : isWithdrawnDetail
                ? "bg-slate-100 text-slate-600"
                : isDeclinedDetail
                  ? "bg-rose-100 text-rose-700"
                  : isExpiredDetail
                    ? "bg-amber-100 text-amber-700"
                    : isPaymentPendingDetail
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-blue-100 text-blue-700";
            return (
              <div className="space-y-4 pb-2">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", statusClass)}>
                    {statusLabel}
                  </span>
                  {isPaymentPendingDetail && <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-600" />}
                </div>

                {/* Service */}
                {(req.service_name || req.description) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Service</div>
                    <div className="font-semibold text-gray-900">{req.service_name || req.description}</div>
                  </div>
                )}

                {/* Price */}
                <div className="flex gap-6">
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Price</div>
                    <div className="font-bold text-lg text-gray-900">{d.currency} {d.price}</div>
                    {d.travel_fee ? <div className="text-xs text-gray-500">+ {d.currency} {d.travel_fee} travel fee</div> : null}
                  </div>
                  {d.duration_minutes && (
                    <div>
                      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Duration</div>
                      <div className="font-semibold text-gray-900">{d.duration_minutes} mins</div>
                    </div>
                  )}
                </div>

                {/* Preferred time */}
                {(d.scheduled_at ?? req.preferred_start_at) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Preferred Time
                    </div>
                    <div className="text-sm text-gray-800">
                      {clientMounted
                        ? format(new Date(d.scheduled_at ?? req.preferred_start_at), "EEE, d MMM yyyy · HH:mm")
                        : "–"}
                    </div>
                  </div>
                )}

                {/* Location */}
                {(req.location_type || d.location?.name) && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Location
                    </div>
                    <div className="text-sm text-gray-800 capitalize">
                      {d.location?.name || (req.location_type === "at_home" ? "At your home" : req.location_type === "at_salon" ? "At the salon" : req.location_type || "–")}
                    </div>
                    {req.location_type === "at_home" && req.address_line1 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[req.address_line1, req.address_line2, req.address_city, req.address_country].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {/* Expiry */}
                {d.expiration_at && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Offer Expires</div>
                    <div className={cn("text-sm", isExpiredDetail ? "text-amber-600 font-medium" : "text-gray-800")}>
                      {clientMounted ? format(new Date(d.expiration_at), "EEE, d MMM yyyy · HH:mm") : "–"}
                      {isExpiredDetail && " (expired)"}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {d.notes && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Notes
                    </div>
                    <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2.5">{d.notes}</div>
                  </div>
                )}

                {/* Expired hint */}
                {isExpiredDetail && (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    This offer has expired. The provider may send a new one.
                  </div>
                )}

                {/* Withdrawn hint */}
                {isWithdrawnDetail && (
                  <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    This offer has been withdrawn. The provider may send a new one.
                  </div>
                )}

                {isDeclinedDetail && (
                  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                    You declined this offer. The provider has been notified.
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  {/* Customer: Accept & Pay */}
                  {!isProviderChat &&
                    !isPaidDetail &&
                    !isWithdrawnDetail &&
                    !isExpiredDetail &&
                    !isDeclinedDetail &&
                    !isPaymentPendingDetail &&
                    d.id && (
                    <Button
                      className="w-full"
                      disabled={isAcceptingOffer}
                      onClick={() => {
                        setOfferDetailOpen(false);
                        void openPaymentDialog(d.id, d.currency);
                      }}
                    >
                      Accept & Pay
                    </Button>
                  )}
                  {!isProviderChat &&
                    !isPaidDetail &&
                    !isWithdrawnDetail &&
                    !isExpiredDetail &&
                    !isDeclinedDetail &&
                    !isPaymentPendingDetail &&
                    d.id && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={decliningOfferId === d.id}
                        onClick={() => void handleDeclineOffer(d.id)}
                      >
                        {decliningOfferId === d.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Decline offer"
                        )}
                      </Button>
                    )}
                  {/* Customer: View Booking when paid */}
                  {!isProviderChat && isPaidDetail && d.booking_id && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        window.location.href = `/account-settings/bookings/${d.booking_id}`;
                      }}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Booking
                    </Button>
                  )}
                  {/* Provider: Withdraw offer */}
                  {isProviderChat && !isPaidDetail && !isWithdrawnDetail && !isExpiredDetail && !isDeclinedDetail && d.id && (
                    <Button
                      variant="outline"
                      className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={async () => {
                        if (!confirm("Are you sure you want to withdraw this offer?")) return;
                        try {
                          await fetcher.post(`/api/provider/custom-offers/${d.id}/retract`, {});
                          toast.success("Offer withdrawn");
                          setOfferDetailOpen(false);
                          loadMessages();
                          onConversationUpdate?.();
                        } catch {
                          toast.error("Failed to withdraw offer");
                        }
                      }}
                    >
                      <Undo2 className="w-4 h-4 mr-2" />
                      Withdraw Offer
                    </Button>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="text-sm text-gray-500 py-4 text-center">Could not load offer details.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
