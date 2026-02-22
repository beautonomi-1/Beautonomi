/**
 * Calendar Sync Service
 * Handles syncing appointments with external calendars
 */

import type { Appointment, CalendarSync, CalendarEvent } from "./types";

export class CalendarSyncService {
  /**
   * Sync a single appointment to a calendar
   */
  static async syncAppointmentToCalendar(
    appointment: Appointment,
    calendarSync: CalendarSync
  ): Promise<CalendarEvent> {
    if (calendarSync.provider === "google") {
      return this.syncToGoogleCalendar(appointment, calendarSync);
    } else if (calendarSync.provider === "apple") {
      return this.syncToAppleCalendar(appointment, calendarSync);
    } else if (calendarSync.provider === "outlook") {
      return this.syncToOutlookCalendar(appointment, calendarSync);
    }
    throw new Error(`Unsupported calendar provider: ${calendarSync.provider}`);
  }

  /**
   * Sync to Google Calendar
   */
  private static async syncToGoogleCalendar(
    appointment: Appointment,
    calendarSync: CalendarSync
  ): Promise<CalendarEvent> {
    const startDateTime = new Date(
      `${appointment.scheduled_date}T${appointment.scheduled_time}`
    ).toISOString();
    const endDateTime = new Date(
      new Date(startDateTime).getTime() + appointment.duration_minutes * 60000
    ).toISOString();

    const event = {
      summary: `${appointment.service_name} - ${appointment.client_name}`,
      description: `Appointment with ${appointment.client_name}\nService: ${appointment.service_name}\nReference: ${appointment.ref_number}`,
      start: {
        dateTime: startDateTime,
        timeZone: "Africa/Johannesburg", // Default to SA timezone
      },
      end: {
        dateTime: endDateTime,
        timeZone: "Africa/Johannesburg",
      },
      attendees: appointment.client_email
        ? [{ email: appointment.client_email }]
        : undefined,
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarSync.calendar_id}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${calendarSync.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Calendar API error: ${error.error?.message || "Unknown error"}`);
    }

    const googleEvent = await response.json();

    return {
      id: `event-${Date.now()}`,
      appointment_id: appointment.id,
      calendar_provider: "google",
      calendar_event_id: googleEvent.id,
      sync_status: "synced",
      last_sync_date: new Date().toISOString(),
    };
  }

  /**
   * Sync to Apple Calendar (iCal)
   * Apple Calendar uses iCal subscription, so we generate an iCal file
   */
  private static async syncToAppleCalendar(
    appointment: Appointment,
    _calendarSync: CalendarSync
  ): Promise<CalendarEvent> {
    // Apple Calendar uses iCal subscription
    // In production, you would generate an iCal feed URL
    // For now, return a mock event
    return {
      id: `event-${Date.now()}`,
      appointment_id: appointment.id,
      calendar_provider: "apple",
      calendar_event_id: `ical-${appointment.id}`,
      sync_status: "synced",
      last_sync_date: new Date().toISOString(),
    };
  }

  /**
   * Sync to Microsoft Outlook Calendar
   */
  private static async syncToOutlookCalendar(
    appointment: Appointment,
    calendarSync: CalendarSync
  ): Promise<CalendarEvent> {
    const startDateTime = new Date(
      `${appointment.scheduled_date}T${appointment.scheduled_time}`
    ).toISOString();
    const endDateTime = new Date(
      new Date(startDateTime).getTime() + appointment.duration_minutes * 60000
    ).toISOString();

    const event = {
      subject: `${appointment.service_name} - ${appointment.client_name}`,
      body: {
        contentType: "HTML",
        content: `<p>Appointment with ${appointment.client_name}<br>Service: ${appointment.service_name}<br>Reference: ${appointment.ref_number}</p>`,
      },
      start: {
        dateTime: startDateTime,
        timeZone: "South Africa Standard Time",
      },
      end: {
        dateTime: endDateTime,
        timeZone: "South Africa Standard Time",
      },
      attendees: appointment.client_email
        ? [
            {
              emailAddress: {
                address: appointment.client_email,
                name: appointment.client_name,
              },
              type: "required",
            },
          ]
        : undefined,
    };

    const response = await fetch("https://graph.microsoft.com/v1.0/me/calendar/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${calendarSync.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Outlook API error: ${error.error?.message || "Unknown error"}`);
    }

    const outlookEvent = await response.json();

    return {
      id: `event-${Date.now()}`,
      appointment_id: appointment.id,
      calendar_provider: "outlook",
      calendar_event_id: outlookEvent.id,
      sync_status: "synced",
      last_sync_date: new Date().toISOString(),
    };
  }

  /**
   * Generate iCal file content for Apple Calendar
   */
  static generateICalFile(appointments: Appointment[]): string {
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Beautonomi//Appointments//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    for (const appointment of appointments) {
      const start = new Date(
        `${appointment.scheduled_date}T${appointment.scheduled_time}`
      )
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0] + "Z";
      const end = new Date(
        new Date(start).getTime() + appointment.duration_minutes * 60000
      )
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0] + "Z";

      ical += `BEGIN:VEVENT
UID:${appointment.id}@beautonomi.com
DTSTAMP:${now}
DTSTART:${start}
DTEND:${end}
SUMMARY:${appointment.service_name} - ${appointment.client_name}
DESCRIPTION:Appointment with ${appointment.client_name}\\nService: ${appointment.service_name}\\nReference: ${appointment.ref_number}
STATUS:CONFIRMED
END:VEVENT
`;
    }

    ical += "END:VCALENDAR";

    return ical;
  }
}
