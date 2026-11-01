"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import type { StaffJobPreset } from "@/lib/provider/staff-job-presets";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  locationIds: string[];
  locations?: Array<{ id: string; name: string }>;
  offeringIds: string[];
  offerings?: Array<{ id: string; title: string }>;
  staffOptions: Array<{ id: string; name: string }>;
  staffLimit?: {
    canProceed: boolean;
    currentCount: number;
    limitValue: number | null;
  };
};

type ReadyState = {
  joinUrl: string | null;
  emailDelivered: boolean;
  memberName: string;
  job: StaffJobPreset;
  serviceCount: number;
  bookableFrom: string;
  timeClock: boolean;
  commissionSet: boolean;
  hoursCopied: boolean;
};

const JOBS: StaffJobPreset[] = ["stylist", "senior", "front_desk", "manager"];

export function TeamMemberAddWizard({
  open,
  onOpenChange,
  onCreated,
  locationIds,
  locations = [],
  offeringIds,
  offerings = [],
  staffOptions,
  staffLimit,
}: Props) {
  const { t } = useTranslation();
  const tl = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      String(t(`web.provider.teamAddWizard.${key}`, opts as never)),
    [t],
  );

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState<ReadyState | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [job, setJob] = useState<StaffJobPreset>("stylist");
  const [publicTitle, setPublicTitle] = useState("");
  const [takesAppointments, setTakesAppointments] = useState(true);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [copyStaffId, setCopyStaffId] = useState<string>("");
  const [bookableFrom, setBookableFrom] = useState("");
  const [timeClock, setTimeClock] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);

  const reset = useCallback(() => {
    setStep(0);
    setReady(null);
    setName("");
    setEmail("");
    setPhone("");
    setJob("stylist");
    setPublicTitle("");
    setTakesAppointments(true);
    setSelectedLocationIds(locationIds);
    setAvatarUrl(null);
    setAvatarPreview(null);
    setCommissionEnabled(false);
    setCommissionPercent(0);
    setCopyStaffId("");
    setBookableFrom("");
    setTimeClock(false);
    setServiceIds(offeringIds);
  }, [offeringIds]);

  useEffect(() => {
    if (open) {
      setServiceIds(offeringIds);
      setSelectedLocationIds(locationIds);
    } else {
      reset();
    }
  }, [open, offeringIds, locationIds, reset]);

  const seatLine = useMemo(() => {
    if (!staffLimit || staffLimit.limitValue == null) return null;
    return tl("seatLine", {
      current: staffLimit.currentCount,
      max: staffLimit.limitValue,
    });
  }, [staffLimit, tl]);

  const bookableJob = takesAppointments && job !== "front_desk";

  async function submit() {
    if (staffLimit && !staffLimit.canProceed) {
      toast.error(tl("limitBlocked"));
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error(tl("nameEmailRequired"));
      return;
    }
    if (phone.trim() && !isCompleteE164(phone.trim())) {
      toast.error(tl("invalidPhone"));
      return;
    }
    setSubmitting(true);
    try {
      const branchIds =
        selectedLocationIds.length > 0 ? selectedLocationIds : locationIds;
      const hours_source = copyStaffId
        ? { type: "staff" as const, staff_id: copyStaffId }
        : { type: "location" as const, location_id: branchIds[0] };
      const created = await providerApi.createTeamMember({
        name: name.trim(),
        email: email.trim(),
        mobile: phone.trim(),
        job,
        public_title: publicTitle.trim() || null,
        takes_appointments: job === "front_desk" ? false : takesAppointments,
        location_ids: branchIds,
        service_ids: bookableJob ? serviceIds : [],
        commission_rate: commissionEnabled ? Math.round(commissionPercent) : null,
        avatar_url: avatarUrl ?? undefined,
        invite_email: true,
        hours_source,
        bookable_from: bookableFrom.trim() || null,
        time_clock_enabled: timeClock,
      });
      setReady({
        joinUrl: (created as { join_url?: string | null }).join_url ?? null,
        emailDelivered: (created as { email_delivered?: boolean }).email_delivered === true,
        memberName: created.name,
        job,
        serviceCount: bookableJob ? serviceIds.length : 0,
        bookableFrom: bookableFrom.trim(),
        timeClock,
        commissionSet: commissionEnabled,
        hoursCopied: (created as { hours_copied?: boolean }).hours_copied === true,
      });
      setStep(4);
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tl("createFailed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function copyLink() {
    if (!ready?.joinUrl) return;
    void navigator.clipboard.writeText(ready.joinUrl);
    toast.success(tl("linkCopied"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ready ? tl("readyTitle") : tl("title")}</DialogTitle>
        </DialogHeader>

        {ready ? (
          <div className="space-y-3 text-sm">
            <p>{ready.emailDelivered ? tl("inviteEmailed", { name: ready.memberName }) : tl("inviteLinkReady")}</p>
            {ready.joinUrl ? (
              <div className="flex gap-2">
                <Input readOnly value={ready.joinUrl} className="text-xs" />
                <Button type="button" variant="outline" onClick={copyLink}>
                  {tl("copyLink")}
                </Button>
              </div>
            ) : null}
            <p>
              {bookableJob
                ? tl("bookableSummary", {
                    count: ready.serviceCount,
                    from: ready.bookableFrom || tl("bookableNow"),
                  })
                : tl("notOnPublicBooking")}
            </p>
            {!ready.commissionSet ? <p className="text-muted-foreground">{tl("hintNoCommission")}</p> : null}
            {!ready.timeClock ? <p className="text-muted-foreground">{tl("hintNoTimeClock")}</p> : null}
            {bookableJob && ready.serviceCount === 0 ? (
              <p className="text-amber-700">{tl("hintNoServices")}</p>
            ) : null}
            {!ready.hoursCopied ? (
              <p className="text-muted-foreground">{tl("hintNoHoursCopied")}</p>
            ) : null}
          </div>
        ) : (
          <>
            {seatLine ? <p className="text-sm text-muted-foreground">{seatLine}</p> : null}
            {step === 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt="" />
                    ) : (
                      <AvatarFallback>{name.charAt(0).toUpperCase() || "?"}</AvatarFallback>
                    )}
                  </Avatar>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Camera className="h-4 w-4" />
                    {tl("photoOptional")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { fetcher } = await import("@/lib/http/fetcher");
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("folder", "avatars");
                          const res = await fetcher.post<{ data?: { url?: string } }>("/api/upload", fd);
                          const url = res.data?.url;
                          if (!url) {
                            toast.error(tl("photoUploadFailed"));
                            return;
                          }
                          setAvatarUrl(url);
                          setAvatarPreview(url);
                        } catch {
                          toast.error(tl("photoUploadFailed"));
                        }
                      }}
                    />
                  </label>
                </div>
                <div>
                  <Label>{tl("name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>{tl("email")}</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </div>
                <PhoneInput label={tl("mobile")} value={phone} onChange={setPhone} />
              </div>
            ) : null}
            {step === 1 ? (
              <div className="space-y-3">
                <div>
                  <Label>{tl("publicTitle")}</Label>
                  <Input
                    value={publicTitle}
                    onChange={(e) => setPublicTitle(e.target.value)}
                    maxLength={120}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{tl("publicTitleHint")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={job === "front_desk" ? false : takesAppointments}
                    onCheckedChange={setTakesAppointments}
                    disabled={job === "front_desk"}
                  />
                  <Label>{tl("takesAppointments")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{tl("takesAppointmentsHint")}</p>
                <Label>{tl("job")}</Label>
                <div className="flex flex-wrap gap-2">
                  {JOBS.map((j) => (
                    <Button
                      key={j}
                      type="button"
                      size="sm"
                      variant={job === j ? "default" : "outline"}
                      onClick={() => {
                        setJob(j);
                        if (j === "front_desk") setTakesAppointments(false);
                      }}
                    >
                      {tl(`job_${j}`)}
                    </Button>
                  ))}
                </div>
                {job === "front_desk" ? (
                  <p className="text-xs text-muted-foreground">{tl("frontDeskHint")}</p>
                ) : null}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={commissionEnabled} onCheckedChange={setCommissionEnabled} />
                    <Label>{tl("paysCommission")}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">{Math.round(commissionPercent)}%</p>
                  <Slider
                    value={[commissionPercent]}
                    onValueChange={([v]) => setCommissionPercent(Math.round(v))}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!commissionEnabled}
                  />
                </div>
              </div>
            ) : null}
            {step === 2 ? (
              <div className="space-y-3">
                {(locations.length > 1 || locationIds.length > 1) ? (
                  <div>
                    <Label>{tl("branches")}</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(locations.length > 0
                        ? locations
                        : locationIds.map((id) => ({ id, name: id }))
                      ).map((loc) => (
                        <Button
                          key={loc.id}
                          type="button"
                          size="sm"
                          variant={selectedLocationIds.includes(loc.id) ? "default" : "outline"}
                          onClick={() =>
                            setSelectedLocationIds((prev) =>
                              prev.includes(loc.id)
                                ? prev.filter((x) => x !== loc.id)
                                : [...prev, loc.id],
                            )
                          }
                        >
                          {loc.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {bookableJob && (offerings.length > 0 || offeringIds.length > 0) ? (
                  <div>
                    <Label>{tl("servicesOffered")}</Label>
                    <div className="flex flex-wrap gap-2 mt-1 max-h-40 overflow-y-auto">
                      {(offerings.length > 0
                        ? offerings
                        : offeringIds.map((id) => ({ id, title: id }))
                      ).map((svc) => (
                        <Button
                          key={svc.id}
                          type="button"
                          size="sm"
                          variant={serviceIds.includes(svc.id) ? "default" : "outline"}
                          onClick={() =>
                            setServiceIds((prev) =>
                              prev.includes(svc.id)
                                ? prev.filter((x) => x !== svc.id)
                                : [...prev, svc.id],
                            )
                          }
                        >
                          {svc.title}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{tl("servicesDefaultAll")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {step === 3 ? (
              <div className="space-y-3">
                <div>
                  <Label>{tl("hoursSource")}</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={!copyStaffId ? "default" : "outline"}
                      onClick={() => setCopyStaffId("")}
                    >
                      {tl("hoursSalon")}
                    </Button>
                    {staffOptions.map((s) => (
                      <Button
                        key={s.id}
                        type="button"
                        size="sm"
                        variant={copyStaffId === s.id ? "default" : "outline"}
                        onClick={() => setCopyStaffId(s.id)}
                      >
                        {tl("hoursCopyFrom", { name: s.name })}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{tl("startDateOptional")}</Label>
                  <Input type="date" value={bookableFrom} onChange={(e) => setBookableFrom(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={timeClock} onCheckedChange={setTimeClock} />
                  <Label>{tl("timeClock")}</Label>
                </div>
              </div>
            ) : null}
          </>
        )}

        <DialogFooter className="gap-2">
          {ready ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {tl("done")}
            </Button>
          ) : (
            <>
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  {tl("back")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {tl("cancel")}
                </Button>
              )}
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={() => {
                    if (step === 0) {
                      if (!name.trim() || !email.trim()) {
                        toast.error(tl("nameEmailRequired"));
                        return;
                      }
                      if (phone.trim() && !isCompleteE164(phone.trim())) {
                        toast.error(tl("invalidPhone"));
                        return;
                      }
                    }
                    if (step === 2 && selectedLocationIds.length === 0 && locationIds.length > 0) {
                      toast.error(tl("selectBranch"));
                      return;
                    }
                    setStep((s) => s + 1);
                  }}
                >
                  {tl("next")}
                </Button>
              ) : (
                <Button type="button" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? tl("saving") : tl("addAndInvite")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
