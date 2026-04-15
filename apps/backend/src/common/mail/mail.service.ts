import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

/**
 * Minimal transactional-mail service for Phase 03.
 *
 * Only two templates needed right now:
 *   1. verifyEmail — 24h link with click-through URL
 *   2. send2FA     — 6-digit OTP, 10min countdown
 *
 * Templates are inlined (tiny, only two of them). A BullMQ queue will wrap
 * this in a later phase; for now sends are fire-and-forget but awaited so we
 * surface SMTP errors to the caller.
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
    this.from = this.config.get<string>('SMTP_FROM') ?? 'LMS Platform <no-reply@lms.local>';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendVerifyEmail(to: string, name: string, link: string): Promise<void> {
    const html = verifyEmailTemplate(name, link);
    await this.send(to, 'Xác nhận tài khoản LMS Platform', html);
  }

  async send2FACode(to: string, name: string, otp: string): Promise<void> {
    const html = otpEmailTemplate(name, otp);
    await this.send(to, 'Mã xác thực 2 lớp — LMS Platform', html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to} — ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}

// ---------- Inline HTML templates ----------

function verifyEmailTemplate(name: string, link: string): string {
  return `
<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F5F9;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;padding:40px;">
            <tr><td style="text-align:center;">
              <h1 style="margin:0 0 8px;font-size:24px;color:#1E40AF;">Xác nhận email của bạn</h1>
              <p style="margin:0 0 24px;color:#475569;">Chào ${escape(name)},</p>
              <p style="margin:0 0 24px;color:#475569;line-height:1.6;">
                Cảm ơn bạn đã đăng ký LMS Platform. Vui lòng nhấn nút bên dưới để xác nhận địa chỉ email của bạn.
                Liên kết có hiệu lực trong <strong>24 giờ</strong>.
              </p>
              <a href="${link}" style="display:inline-block;background:#1E40AF;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;">Xác nhận tài khoản</a>
              <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;">Nếu nút không hoạt động, sao chép đường dẫn sau vào trình duyệt:<br/><span style="color:#1E40AF;word-break:break-all;">${link}</span></p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function otpEmailTemplate(name: string, otp: string): string {
  return `
<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F5F9;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;padding:40px;">
            <tr><td style="text-align:center;">
              <h1 style="margin:0 0 8px;font-size:24px;color:#7C3AED;">Mã xác thực 2 lớp</h1>
              <p style="margin:0 0 24px;color:#475569;">Chào ${escape(name)}, dưới đây là mã OTP của bạn:</p>
              <div style="display:inline-block;background:#F5F3FF;border:2px dashed #7C3AED;border-radius:16px;padding:20px 40px;margin:0 0 24px;">
                <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#1E40AF;">${otp}</span>
              </div>
              <p style="margin:0 0 8px;color:#475569;">Mã có hiệu lực trong <strong>10 phút</strong>.</p>
              <p style="margin:0;font-size:12px;color:#94A3B8;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
