import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { EMAIL_QUEUE } from '../../common/queue/queue.module';

import type { EmailTemplate } from './templates';

/**
 * Outbox-style email interface: every send enqueues a BullMQ job rather than
 * calling nodemailer directly. The processor (`email.processor.ts`) picks up
 * the job, renders the React Email template, enforces the global rate limit,
 * and finally calls MailService to actually transmit.
 *
 * Features per Phase 07 spec:
 *   - Queue: BullMQ `email` (registered in common/queue)
 *   - Retry: 3 attempts with exponential 2^n backoff (configured at queue level)
 *   - Rate limit: 100 emails/hour (enforced in processor via Redis counter)
 *   - No synchronous send — every caller must use this service
 */
/**
 * Union type: the discriminated `EmailTemplate` (template + props) plus
 * the recipient address. Written as a type alias (not interface) because
 * TypeScript doesn't allow `interface extends union`.
 */
export type EnqueueEmailInput = EmailTemplate & { to: string };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EnqueueEmailInput>) {}

  async enqueue(input: EnqueueEmailInput): Promise<{ jobId: string }> {
    const job = await this.queue.add(input.template, input);
    this.logger.log(`Queued email template=${input.template} to=${input.to} jobId=${job.id}`);
    return { jobId: String(job.id ?? '') };
  }

  // ---------- Convenience wrappers used by feature code ----------

  sendVerifyEmail(to: string, name: string, link: string) {
    return this.enqueue({
      to,
      template: 'verify-email',
      props: { name, link },
    });
  }

  send2FACode(to: string, name: string, otp: string) {
    return this.enqueue({
      to,
      template: 'otp-2fa',
      props: { name, otp },
    });
  }

  sendResetPassword(to: string, name: string, link: string) {
    return this.enqueue({
      to,
      template: 'reset-password',
      props: { name, link },
    });
  }

  sendWelcome(to: string, name: string, dashboardUrl: string) {
    return this.enqueue({
      to,
      template: 'welcome',
      props: { name, dashboardUrl },
    });
  }

  sendCertificate(
    to: string,
    name: string,
    courseName: string,
    certificateUrl: string,
    issuedAt: string,
  ) {
    return this.enqueue({
      to,
      template: 'certificate',
      props: { name, courseName, certificateUrl, issuedAt },
    });
  }

  sendWeeklyProgress(
    to: string,
    props: Extract<EmailTemplate, { template: 'weekly-progress' }>['props'],
  ) {
    return this.enqueue({ to, template: 'weekly-progress', props });
  }

  sendAtRiskAlert(
    to: string,
    props: Extract<EmailTemplate, { template: 'at-risk-alert' }>['props'],
  ) {
    return this.enqueue({ to, template: 'at-risk-alert', props });
  }

  sendCourseEnrolled(
    to: string,
    props: Extract<EmailTemplate, { template: 'course-enrolled' }>['props'],
  ) {
    return this.enqueue({ to, template: 'course-enrolled', props });
  }
}
