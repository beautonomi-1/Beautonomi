/**
 * Generate calendar event URLs/ICS for Add to Calendar functionality
 */

export interface CalendarEvent {
  title: string;
  description?: string;
  location: string;
  start: Date;
  end: Date;
}

function formatDateForICS(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeICS(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function generateICSBlob(event: CalendarEvent): Blob {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beautonomi//Booking//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatDateForICS(event.start)}`,
    `DTEND:${formatDateForICS(event.end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `LOCATION:${escapeICS(event.location)}`,
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

export function getGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatDateForICS(event.start).replace("Z", "")}/${formatDateForICS(event.end).replace("Z", "")}`,
    location: event.location,
    ...(event.description && { details: event.description }),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function getOutlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    body: event.description || "",
    location: event.location,
  });
  return `https://outlook.live.com/owa/0/?${params.toString()}`;
}

export function downloadICS(event: CalendarEvent, filename = "booking.ics"): void {
  const ics = generateICSBlob(event);
  const url = URL.createObjectURL(ics);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
