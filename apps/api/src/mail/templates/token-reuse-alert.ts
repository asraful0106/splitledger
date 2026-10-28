import type { MailContent } from "./verify-email";

export function tokenReuseAlertTemplate(): MailContent {
  return {
    subject: "Security alert: suspicious sign-in activity",
    text: "We detected a reused session token and signed out all of your sessions as a precaution. If this was not you, reset your password immediately.",
    html: "<p>We detected a reused session token and signed out all of your sessions as a precaution.</p><p>If this was not you, reset your password immediately.</p>",
  };
}
