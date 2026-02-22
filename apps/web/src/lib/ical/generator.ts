/**
 * iCal Generator
 * Generates iCal (.ics) files for calendar export
 */

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  created?: Date;
  lastModified?: Date;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  organizer?: {
    name: string;
    email: string;
  };
  attendee?: {
    name: string;
    email: string;
  };
}

/**
 * Escape text for iCal format
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format date for iCal (UTC format: YYYYMMDDTHHMMSSZ)
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generate iCal file content
 */
export function generateICal(events: CalendarEvent[]): string {
  const lines: string[] = [];

  // iCal header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Beautonomi//Booking Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  // Add each event
  for (const event of events) {
    lines.push('BEGIN:VEVENT');

    // UID (required)
    lines.push(`UID:${event.uid}`);

    // Summary (title)
    lines.push(`SUMMARY:${escapeText(event.summary)}`);

    // Description
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }

    // Location
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }

    // Start time (UTC)
    lines.push(`DTSTART:${formatDate(event.start)}`);

    // End time (UTC)
    lines.push(`DTEND:${formatDate(event.end)}`);

    // Created
    if (event.created) {
      lines.push(`DTSTAMP:${formatDate(event.created)}`);
    } else {
      lines.push(`DTSTAMP:${formatDate(new Date())}`);
    }

    // Last modified
    if (event.lastModified) {
      lines.push(`LAST-MODIFIED:${formatDate(event.lastModified)}`);
    }

    // Status
    if (event.status) {
      lines.push(`STATUS:${event.status}`);
    }

    // Organizer
    if (event.organizer) {
      lines.push(`ORGANIZER;CN=${escapeText(event.organizer.name)}:MAILTO:${event.organizer.email}`);
    }

    // Attendee
    if (event.attendee) {
      lines.push(`ATTENDEE;CN=${escapeText(event.attendee.name)}:MAILTO:${event.attendee.email}`);
    }

    lines.push('END:VEVENT');
  }

  // iCal footer
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate iCal file for staff appointments
 * Only includes appointments, not time blocks
 */
export function generateStaffCalendar(
  appointments: Array<{
    id: string;
    booking_number: string;
    scheduled_at: string;
    duration_minutes: number;
    customer_name?: string;
    customer_email?: string;
    service_title?: string;
    location_name?: string;
    location_address?: string;
    provider_name?: string;
    status: string;
  }>,
  staffName: string,
  staffEmail: string
): string {
  const events: CalendarEvent[] = appointments
    .filter((apt) => apt.status !== 'cancelled')
    .map((apt) => {
      const start = new Date(apt.scheduled_at);
      const end = new Date(start.getTime() + apt.duration_minutes * 60000);

      const summary = apt.service_title || 'Appointment';
      const description = [
        `Booking #${apt.booking_number}`,
        apt.customer_name ? `Client: ${apt.customer_name}` : null,
        apt.service_title ? `Service: ${apt.service_title}` : null,
      ]
        .filter(Boolean)
        .join('\\n');

      const location = apt.location_name
        ? `${apt.location_name}${apt.location_address ? ` - ${apt.location_address}` : ''}`
        : apt.location_address || undefined;

      return {
        uid: `beautonomi-${apt.id}@beautonomi.com`,
        summary,
        description,
        location,
        start,
        end,
        created: new Date(),
        lastModified: new Date(),
        status: apt.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
        organizer: {
          name: apt.provider_name || 'Beautonomi',
          email: staffEmail,
        },
        attendee: apt.customer_email
          ? {
              name: apt.customer_name || 'Client',
              email: apt.customer_email,
            }
          : undefined,
      };
    });

  return generateICal(events);
}
