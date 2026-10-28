import { env } from "../env";
import { logger } from "../logger";
import { getTransporter } from "./transport";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class SmtpMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

let mailer: Mailer = new SmtpMailer();

export function setMailer(next: Mailer): void {
  mailer = next;
}

export function getMailer(): Mailer {
  return mailer;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mailer.send(message);
      return;
    } catch (error) {
      if (attempt === attempts) {
        logger.error(
          { err: error, to: message.to, subject: message.subject },
          "mail send failed",
        );
        return;
      }
    }
  }
}
