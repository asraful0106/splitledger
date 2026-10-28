import { env } from "../../env";

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export function verifyEmailTemplate(token: string): MailContent {
  const link = `${env.APP_WEB_URL}/verify-email?token=${encodeURIComponent(token)}`;

  return {
    subject: "Verify your SplitLedger email",
    text: `Confirm your email address by opening this link:\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Confirm your email address by clicking the link below.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  };
}
