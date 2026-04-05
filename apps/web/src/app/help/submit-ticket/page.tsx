"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
import { SUPPORT_TICKET_CATEGORY_GROUPS } from "@/lib/support/ticket-categories";

export default function SubmitTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [category, setCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    try {
      setIsSubmitting(true);
      const res = await fetcher.post<{ data?: { ticket?: { ticket_number?: string } }; message?: string }>(
        "/api/me/support-tickets",
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          category,
        }
      );
      const ticketNumber = (res as { data?: { ticket?: { ticket_number?: string } } })?.data?.ticket?.ticket_number;
      toast.success(
        ticketNumber
          ? `Ticket submitted. Reference: ${ticketNumber}. We’ll email you a confirmation.`
          : "Ticket submitted — we’ll email you a confirmation shortly."
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
        <div className="mx-auto w-full max-w-xl px-4 py-8 md:py-10 md:max-w-2xl">
          <Button
            variant="ghost"
            asChild
            className="-ml-2 mb-6 rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Link href={PLATFORM_CONTACT_HREF}>
              <ArrowLeft className="mr-2 h-4 w-4" />
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
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-xs font-medium text-zinc-700">
                    Category <span className="text-[#FF0077]">*</span>
                  </Label>
                  <Select value={category || undefined} onValueChange={setCategory}>
                    <SelectTrigger id="category" className={`h-11 w-full ${inputClass}`}>
                      <SelectValue placeholder="Choose what this is mostly about…" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      avoidCollisions={false}
                      className="max-h-[min(24rem,60vh)] overscroll-contain rounded-2xl border-zinc-200 bg-white shadow-lg [&_[data-radix-select-viewport]]:max-h-[min(24rem,60vh)] [&_[data-radix-select-viewport]]:overflow-y-auto [&_[data-radix-select-viewport]]:overscroll-contain [&_[data-radix-select-viewport]]:pr-1"
                    >
                      {SUPPORT_TICKET_CATEGORY_GROUPS.map((group, gi) => (
                        <Fragment key={group.label}>
                          {gi > 0 ? <SelectSeparator className="my-1 bg-zinc-200" /> : null}
                          <SelectGroup>
                            <SelectLabel className="px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              {group.label}
                            </SelectLabel>
                            {group.items.map((item) => (
                              <SelectItem
                                key={item.value}
                                value={item.value}
                                className="cursor-pointer rounded-lg py-2 pl-8 pr-2 text-[13px] leading-snug text-zinc-700 focus:bg-[#FF0077]/8"
                              >
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </Fragment>
                      ))}
                    </SelectContent>
                  </Select>
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
                    onChange={(e) => setSubject(e.target.value)}
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
                      onValueChange={(value: "low" | "medium" | "high") => setPriority(value)}
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit ticket
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
