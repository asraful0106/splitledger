import { env } from "../../env";
import type { MailContent } from "./verify-email";

export function resetPasswordTemplate(token: string): MailContent {
  const link = `${env.APP_WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;

  return {
    subject: "Reset your SplitLedger password",
    text: `Reset your password by opening this link:\n${link}\n\nThis link expires in 30 minutes and can be used once.`,
    html: `<p>Reset your password by clicking the link below.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes and can be used once.</p>`,
  };
}
