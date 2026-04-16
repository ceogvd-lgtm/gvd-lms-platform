import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

/**
 * Low-level SMTP transport wrapper.
 *
 * Historically this class also held the inline HTML templates for
 * verify-email + OTP. In Phase 07 those moved to React Email components
 * under `modules/notifications/templates/` and are invoked through the
 * BullMQ-backed `EmailService`. MailService is now a thin nodemailer shim
 * exposing just `sendRaw(to, subject, html)`.
 *
 * The old `sendVerifyEmail` / `send2FACode` methods are kept as
 * back-compat wrappers so any legacy caller keeps working — but new code
 * should always go through `EmailService.enqueue()` so the send is queued,
 * retried, and rate-limited.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;
  private from!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.from = this.config.get<string>('SMTP_FROM') ?? 'GVD next-gen <no-reply@gvd.local>';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  /**
   * Send an email with pre-rendered HTML. Called by the EmailProcessor after
   * it has rendered the React Email template.
   */
  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to} — ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}
