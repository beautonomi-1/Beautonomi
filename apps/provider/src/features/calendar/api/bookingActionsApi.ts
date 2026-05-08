/** Route segments for booking lifecycle (same as legacy calendar mutations). */
export const bookingActionPaths = {
  completeService: (id: string) => `/api/provider/bookings/${id}/complete-service`,
  startService: (id: string) => `/api/provider/bookings/${id}/start-service`,
  patchBooking: (id: string) => `/api/provider/bookings/${id}`,
  checkAvailability: `/api/provider/bookings/check-availability`,
} as const;
