import { IsEmail, IsIn, IsObject } from 'class-validator';

const TEMPLATE_NAMES = [
  'verify-email',
  'otp-2fa',
  'reset-password',
  'welcome',
  'certificate',
  'weekly-progress',
  'at-risk-alert',
  'course-enrolled',
] as const;

export class SendEmailDto {
  @IsEmail()
  to!: string;

  @IsIn(TEMPLATE_NAMES, {
    message: `template must be one of: ${TEMPLATE_NAMES.join(', ')}`,
  })
  template!: (typeof TEMPLATE_NAMES)[number];

  /**
   * Template-specific props. Runtime validation against the template's props
   * interface happens inside the processor — this DTO only enforces shape.
   */
  @IsObject()
  props!: Record<string, unknown>;
}
