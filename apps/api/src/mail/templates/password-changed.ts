import type { MailContent } from "./verify-email";

export function passwordChangedTemplate(): MailContent {
  return {
    subject: "Your SplitLedger password was changed",
    text: "Your password was changed and all other sessions were signed out. If this was not you, reset your password immediately.",
    html: "<p>Your password was changed and all other sessions were signed out.</p><p>If this was not you, reset your password immediately.</p>",
  };
}
