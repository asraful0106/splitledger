const dateTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
