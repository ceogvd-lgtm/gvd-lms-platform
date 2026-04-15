import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { MailService } from '../../common/mail/mail.service';
import { EMAIL_QUEUE } from '../../common/queue/queue.module';
import { RedisService } from '../../common/redis/redis.service';

import type { EnqueueEmailInput } from './email.service';
import { renderEmail, subjectFor } from './templates';

/**
 * Worker that processes the `email` queue.
 *
 * Flow per job:
 *   1. Rate-limit check — INCR `email:ratelimit:{yyyy-mm-dd-hh}`. If > 100,
 *      move job to delayed state (retry next hour). This is a GLOBAL cap,
 *      not per-recipient — defends against accidental mass-send loops.
 *   2. Render the React Email template to HTML via `renderEmail()`.
 *   3. Hand off to MailService for nodemailer transmission.
 *   4. BullMQ handles retry (3x exponential backoff) automatically on throw.
 */
const EMAIL_RATE_LIMIT_PER_HOUR = 100;

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<EnqueueEmailInput>): Promise<{ ok: true }> {
    const data = job.data;

    // --- 1. Rate limit ---
    await this.enforceRateLimit(job);

    // --- 2. Render React Email → HTML ---
    // `data` has shape `EmailTemplate & { to }`; pass the whole object to
    // renderEmail — it reads only `template` + `props` and ignores `to`.
    this.logger.log(
      `[${job.id}] Rendering template=${data.template} to=${data.to} (attempt ${job.attemptsMade + 1})`,
    );
    const html = await renderEmail(data);
    const subject = subjectFor(data.template);

    // --- 3. Send via nodemailer ---
    await this.mail.sendRaw(data.to, subject, html);

    this.logger.log(`[${job.id}] Sent OK — ${subject} → ${data.to}`);
    return { ok: true };
  }

  /**
   * Global hour bucket counter. If we've already sent 100 emails this hour,
   * throw so BullMQ schedules a retry — the exponential backoff will eventually
   * push the job into the next hour's bucket.
   */
  private async enforceRateLimit(job: Job<EnqueueEmailInput>): Promise<void> {
    const now = new Date();
    const bucket = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
    const key = `email:ratelimit:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      // First increment this hour — set TTL so the key auto-expires.
      await this.redis.expire(key, 3600);
    }
    if (count > EMAIL_RATE_LIMIT_PER_HOUR) {
      this.logger.warn(
        `[${job.id}] Rate limit hit (${count}/${EMAIL_RATE_LIMIT_PER_HOUR} this hour) — deferring`,
      );
      throw new Error(`Email rate limit ${EMAIL_RATE_LIMIT_PER_HOUR}/hour reached — retrying`);
    }
  }
}
