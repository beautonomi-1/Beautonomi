"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, LifeBuoy, Sparkles } from "lucide-react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";
import {
  contextTypeForCategory,
  isSelectableForAudience,
  supportTicketPresetFromCategory,
  type SupportTicketCategoryAudience,
} from "@/lib/support/ticket-categories";
import { SupportTicketCategoryPicker } from "@/components/support/SupportTicketCategoryPicker";
import { resolveSupportTicketPrefillFromSearch, shouldSendSupportContextId, supportPrefillNoun } from "@beautonomi/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag, useSupportAssistantActive } from "@/providers/ConfigBundleProvider";
import { isSafetySupportCategory } from "@/lib/support/support-assistant/categories";

function resolvePickerAudience(role: string | null | undefined): SupportTicketCategoryAudience {
  if (role === "provider_owner" || role === "provider_staff") return "provider";
  if (role === "superadmin") return "both";
  return "customer";
}

export default function SubmitTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const pickerAudience = resolvePickerAudience(role);

  const bookingPrefill = useMemo(
    () =>
      resolveSupportTicketPrefillFromSearch({
        bookingId: searchParams.get("booking_id"),
        bookingNumber: searchParams.get("booking_number"),
        orderId: searchParams.get("order_id"),
        orderNumber: searchParams.get("order_number"),
        giftCardId: searchParams.get("gift_card_id"),
        giftCardCode: searchParams.get("gift_card_code"),
        category: searchParams.get("category"),
      }),
    [searchParams],
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [category, setCategory] = useState("");
  const [supportContextType, setSupportContextType] = useState<string | null>(null);
  const [supportContextLabel, setSupportContextLabel] = useState("");
  const [supportContextId, setSupportContextId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [priorityTouched, setPriorityTouched] = useState(false);
  const assistantFlagKey =
    pickerAudience === "provider" ? "support.ai_assistant.provider" : "support.ai_assistant.customer";
  const assistantFlagOn = useFeatureFlag(assistantFlagKey);
  const assistantAgentActive = useSupportAssistantActive();
  const assistantChatAvailable = assistantFlagOn && assistantAgentActive;
  const [chatStep, setChatStep] = useState<"category" | "chat" | "form">("form");
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    if (assistantChatAvailable) {
      setChatStep("category");
    } else {
      setChatStep("form");
    }
  }, [assistantChatAvailable]);

  const applyCategory = useCallback(
    (value: string) => {
      setCategory(value);
      const preset = supportTicketPresetFromCategory(value);
      if (preset.priority && !priorityTouched) {
        setPriority(preset.priority);
      }
      if (preset.subject && !subjectTouched) {
        setSubject(preset.subject);
      }
    },
    [priorityTouched, subjectTouched],
  );

  useEffect(() => {
    if (bookingPrefill.supportContextType) {
      setSupportContextType(bookingPrefill.supportContextType);
      setSupportContextLabel(bookingPrefill.supportContextLabel);
      setSupportContextId(bookingPrefill.supportContextId);
      const kind = supportPrefillNoun(bookingPrefill.supportContextType);
      setSubject((current) =>
        current.trim()
          ? current
          : `Help with ${kind} ${bookingPrefill.supportContextLabel.split(" (")[0]}`,
      );
    }
    const fromUrl = bookingPrefill.category ?? searchParams.get("category");
    if (fromUrl && isSelectableForAudience(fromUrl, pickerAudience)) {
      applyCategory(fromUrl);
    }
  }, [bookingPrefill, searchParams, pickerAudience, applyCategory]);

  const sendChatFirstTicket = async () => {
    if (!category.trim() || !message.trim()) {
      toast.error("Please choose a category and describe your issue");
      return;
    }
    const hasRef = Boolean(supportContextId) || Boolean(supportContextLabel.trim());
    const contextType =
      hasRef && supportContextType
        ? supportContextType
        : contextTypeForCategory(category) ?? supportContextType ?? undefined;
    const preset = supportTicketPresetFromCategory(category);
    const subjectLine =
      subject.trim() ||
      preset.subject ||
      message.trim().slice(0, 120) ||
      "Support request";

    try {
      setChatSending(true);
      const createPath =
        pickerAudience === "provider" ? "/api/provider/support-tickets" : "/api/me/support-tickets";
      const res = await fetcher.post<{
        data?: {
          ticket?: { id?: string; ticket_number?: string };
          assistantUnavailable?: { code?: string };
          assistantPending?: boolean;
        };
      }>(createPath, {
        subject: subjectLine,
        message: message.trim(),
        priority: preset.priority ?? priority,
        category,
        support_context_type: contextType,
        support_context_id: contextType && shouldSendSupportContextId(contextType) ? supportContextId : null,
        support_context_label: supportContextLabel.trim() || null,
        handling_mode: "assistant",
      });
      const ticketId = (res as { data?: { ticket?: { id?: string } } })?.data?.ticket?.id;
      const ticketNumber = (res as { data?: { ticket?: { ticket_number?: string } } })?.data?.ticket?.ticket_number;
      const assistantUnavailable = (res as { data?: { assistantUnavailable?: { code?: string } } })?.data
        ?.assistantUnavailable;
      if (assistantUnavailable) {
        toast.info("Your ticket was sent to our support team. We'll reply in this thread.");
      } else {
        toast.success(
          ticketNumber
            ? `Ticket ${ticketNumber} — chat with our assistant below.`
            : "Ticket created — continuing in chat.",
        );
      }
      router.push(ticketId ? `/help/my-tickets/${ticketId}` : "/help/my-tickets");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start support chat");
    } finally {
      setChatSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category.trim()) {
      toast.error("Please choose a category so we can route your request");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in the subject and message");
      return;
    }

    const hasRef = Boolean(supportContextId) || Boolean(supportContextLabel.trim());
    const contextType =
      hasRef && supportContextType
        ? supportContextType
        : contextTypeForCategory(category) ?? supportContextType ?? undefined;

    try {
      setIsSubmitting(true);
      const res = await fetcher.post<{ data?: { ticket?: { ticket_number?: string } }; message?: string }>(
        "/api/me/support-tickets",
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          category,
          support_context_type: contextType,
          support_context_id: contextType && shouldSendSupportContextId(contextType) ? supportContextId : null,
          support_context_label: supportContextLabel.trim() || null,
        },
      );
      const ticketNumber = (res as { data?: { ticket?: { ticket_number?: string } } })?.data?.ticket?.ticket_number;
      toast.success(
        ticketNumber
          ? `Ticket submitted. Reference: ${ticketNumber}. We’ll email you a confirmation.`
          : "Ticket submitted — we’ll email you a confirmation shortly.",
      );
      router.push("/help/my-tickets");
    } catch (error: unknown) {
      console.error("Failed to submit ticket:", error);
      toast.error(error instanceof Error ? error.message : "Failed to submit support ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "rounded-xl border-zinc-200 bg-zinc-50 text-[13px] text-zinc-700 placeholder:text-zinc-400 shadow-sm transition-[box-shadow,border-color,background-color] focus-visible:border-[#FF0077]/35 focus-visible:bg-white focus-visible:ring-[#FF0077]/15";

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-zinc-50/80 pb-24 md:pb-8">
        <BeautonomiHeader />
        <div className="mx-auto w-full max-w-xl px-4 py-8 md:max-w-2xl md:py-10">
          <Button
            variant="ghost"
            asChild
            className="-ms-2 mb-6 rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Link href={PLATFORM_CONTACT_HREF}>
              <ArrowLeft className="me-2 h-4 w-4" />
              Back to Help centre
            </Link>
          </Button>

          <Card className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-white/80 shadow-xl shadow-zinc-200/60 backdrop-blur-sm">
            <CardHeader className="space-y-3 border-b border-zinc-100 bg-gradient-to-br from-[#FF0077]/5 via-white to-white pb-8 pt-8">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF0077]/10 text-[#FF0077]">
                  <LifeBuoy className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold tracking-tight text-zinc-900">
                    Submit a support ticket
                  </CardTitle>
                  <CardDescription className="mt-1.5 text-base leading-relaxed text-zinc-600">
                    Tell us what happened — pick the closest category, add a clear subject, and we’ll get back to you by
                    email.
                  </CardDescription>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <Sparkles className="h-4 w-4 shrink-0 text-[#FF0077]/80" aria-hidden />
                Tip: include dates, booking IDs, or screenshots in your message when relevant.
              </p>
            </CardHeader>
            <CardContent className="px-5 py-8 sm:px-8">
              {chatStep === "category" && assistantChatAvailable ? (
                <div className="space-y-6">
                  {bookingPrefill.supportContextLabel ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                      Related: <span className="font-medium">{bookingPrefill.supportContextLabel}</span>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="category-chat" className="text-xs font-medium text-zinc-700">
                      Category <span className="text-[#FF0077]">*</span>
                    </Label>
                    <SupportTicketCategoryPicker
                      id="category-chat"
                      value={category}
                      onChange={applyCategory}
                      audience={pickerAudience}
                      triggerClassName={inputClass}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setChatStep("form")}>
                      Use full form
                    </Button>
                    <Button
                      type="button"
                      disabled={!category.trim() || isSafetySupportCategory(category)}
                      onClick={() => setChatStep(isSafetySupportCategory(category) ? "form" : "chat")}
                    >
                      Continue to chat
                    </Button>
                  </div>
                  {isSafetySupportCategory(category) ? (
                    <p className="text-xs text-amber-700">
                      Safety reports go straight to our team — please use the full form.
                    </p>
                  ) : null}
                </div>
              ) : chatStep === "chat" && assistantChatAvailable ? (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-600">
                    Ticket category: <span className="font-medium text-zinc-900">{category || "—"}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    AI can make mistakes — you can talk to a person anytime after your ticket is created.
                  </p>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe what happened…"
                    rows={8}
                    maxLength={5000}
                    className={`min-h-[180px] resize-y rounded-2xl ${inputClass}`}
                    aria-label="Your message to support"
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setChatStep("category")}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      disabled={chatSending || !message.trim()}
                      onClick={() => void sendChatFirstTicket()}
                    >
                      {chatSending ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        <>
                          <Send className="me-2 h-4 w-4" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {bookingPrefill.supportContextLabel ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                    Related: <span className="font-medium">{bookingPrefill.supportContextLabel}</span>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="context-label" className="text-xs font-medium text-zinc-700">
                    Related reference <span className="font-normal text-zinc-400">(optional)</span>
                  </Label>
                  <Input
                    id="context-label"
                    value={supportContextLabel}
                    onChange={(e) => setSupportContextLabel(e.target.value)}
                    placeholder="e.g. Booking TKT/ID, order number, product name, payment reference"
                    maxLength={160}
                    className={`h-11 ${inputClass}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="text-xs font-medium text-zinc-700">
                    Category <span className="text-[#FF0077]">*</span>
                  </Label>
                  <SupportTicketCategoryPicker
                    id="category"
                    value={category}
                    onChange={applyCategory}
                    audience={pickerAudience}
                    triggerClassName={inputClass}
                  />
                  <p className="text-[11px] text-zinc-500">
                    This routes your ticket to the right team — you can add detail below.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-xs font-medium text-zinc-700">
                    Subject <span className="text-[#FF0077]">*</span>
                  </Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => {
                      setSubjectTouched(true);
                      setSubject(e.target.value);
                    }}
                    placeholder="Short summary, e.g. “Refund not received after cancellation”"
                    maxLength={200}
                    required
                    className={`h-11 ${inputClass}`}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priority" className="text-xs font-medium text-zinc-700">
                      Priority
                    </Label>
                    <Select
                      value={priority}
                      onValueChange={(value: "low" | "medium" | "high" | "urgent") => {
                        setPriorityTouched(true);
                        setPriority(value);
                      }}
                    >
                      <SelectTrigger id="priority" className={`h-11 ${inputClass}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="item-aligned" className="rounded-2xl border-zinc-200 shadow-lg">
                        <SelectItem value="low" className="rounded-lg text-[13px] text-zinc-700">
                          Low — when you have time
                        </SelectItem>
                        <SelectItem value="medium" className="rounded-lg text-[13px] text-zinc-700">
                          Medium — normal response time
                        </SelectItem>
                        <SelectItem value="high" className="rounded-lg text-[13px] text-zinc-700">
                          High — blocking or urgent
                        </SelectItem>
                        <SelectItem value="urgent" className="rounded-lg text-[13px] text-zinc-700">
                          Urgent — safety or immediate harm
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-xs font-medium text-zinc-700">
                    Message <span className="text-[#FF0077]">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What did you try? What did you expect? Any error messages? The more context, the faster we can help."
                    rows={9}
                    maxLength={5000}
                    required
                    className={`min-h-[200px] resize-y rounded-2xl ${inputClass} leading-relaxed`}
                  />
                  <div className="flex justify-end">
                    <span className="text-xs tabular-nums text-zinc-400">{message.length} / 5000</span>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-6 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push(PLATFORM_CONTACT_HREF)}
                    className="h-11 rounded-xl border-zinc-200 bg-white sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !subject.trim() || !message.trim() || !category.trim()}
                    className="h-11 rounded-xl bg-gradient-to-r from-[#FF0077] to-[#E6006A] px-8 font-medium text-white shadow-md shadow-[#FF0077]/25 transition hover:from-[#E6006A] hover:to-[#FF0077] disabled:opacity-50 sm:w-auto"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="me-2 h-4 w-4" />
                        Submit ticket
                      </>
                    )}
                  </Button>
                </div>
              </form>
              )}
            </CardContent>
          </Card>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
