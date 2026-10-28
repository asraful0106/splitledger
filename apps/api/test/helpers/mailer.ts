import { setMailer, type MailMessage, type Mailer } from "../../src/mail/mailer";

export const sentMessages: MailMessage[] = [];

const captureMailer: Mailer = {
  async send(message: MailMessage): Promise<void> {
    sentMessages.push(message);
  },
};

export function installFakeMailer(): void {
  setMailer(captureMailer);
}

export function clearMailbox(): void {
  sentMessages.length = 0;
}

export function lastMailTo(email: string): MailMessage | undefined {
  for (let index = sentMessages.length - 1; index >= 0; index -= 1) {
    const message = sentMessages[index];
    if (message && message.to === email) {
      return message;
    }
  }
  return undefined;
}

export function extractToken(message: MailMessage): string {
  const match = /[?&]token=([^&\s"<]+)/.exec(`${message.text}\n${message.html}`);
  const encoded = match?.[1];
  if (!encoded) {
    throw new Error("Token not found in email");
  }
  return decodeURIComponent(encoded);
}
