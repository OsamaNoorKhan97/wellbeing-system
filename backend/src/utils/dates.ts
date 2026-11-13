/** "Mon, 16 Nov 2026" and "2:30 PM" in the organization's time zone, for notification text. */
export function formatMeetingTime(date: Date, timeZone: string): { date: string; time: string } {
  return {
    date: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date),
  };
}
