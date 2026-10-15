/** Sportsdesk's calendar follows Eastern Time, including after-midnight UTC games. */
export function slateDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date(value));
}
