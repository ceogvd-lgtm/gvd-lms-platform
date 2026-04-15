import { render } from '@react-email/render';
import type * as React from 'react';

import { AtRiskAlert, type AtRiskAlertProps } from './at-risk-alert';
import { Certificate, type CertificateProps } from './certificate';
import { CourseEnrolled, type CourseEnrolledProps } from './course-enrolled';
import { Otp2FA, type Otp2FAProps } from './otp-2fa';
import { ResetPassword, type ResetPasswordProps } from './reset-password';
import { VerifyEmail, type VerifyEmailProps } from './verify-email';
import { WeeklyProgress, type WeeklyProgressProps } from './weekly-progress';
import { Welcome, type WelcomeProps } from './welcome';

/**
 * Discriminated union of all email templates. The `template` key identifies
 * which component to render; `props` is typed accordingly.
 *
 * Adding a new template:
 *   1. Create the .tsx file next to the others with a typed Props interface
 *   2. Add a branch to this union + subjectFor() + the TEMPLATE_MAP below
 */
export type EmailTemplate =
  | { template: 'verify-email'; props: VerifyEmailProps }
  | { template: 'otp-2fa'; props: Otp2FAProps }
  | { template: 'reset-password'; props: ResetPasswordProps }
  | { template: 'welcome'; props: WelcomeProps }
  | { template: 'certificate'; props: CertificateProps }
  | { template: 'weekly-progress'; props: WeeklyProgressProps }
  | { template: 'at-risk-alert'; props: AtRiskAlertProps }
  | { template: 'course-enrolled'; props: CourseEnrolledProps };

export type EmailTemplateName = EmailTemplate['template'];

/**
 * Render the email to a plain HTML string via `@react-email/render`.
 * Internally uses `react-dom/server.renderToStaticMarkup`.
 */
export async function renderEmail(input: EmailTemplate): Promise<string> {
  // Each branch picks the correct component + typed props.
  let element: React.ReactElement;
  switch (input.template) {
    case 'verify-email':
      element = <VerifyEmail {...input.props} />;
      break;
    case 'otp-2fa':
      element = <Otp2FA {...input.props} />;
      break;
    case 'reset-password':
      element = <ResetPassword {...input.props} />;
      break;
    case 'welcome':
      element = <Welcome {...input.props} />;
      break;
    case 'certificate':
      element = <Certificate {...input.props} />;
      break;
    case 'weekly-progress':
      element = <WeeklyProgress {...input.props} />;
      break;
    case 'at-risk-alert':
      element = <AtRiskAlert {...input.props} />;
      break;
    case 'course-enrolled':
      element = <CourseEnrolled {...input.props} />;
      break;
    default: {
      const _exhaustive: never = input;
      throw new Error(`Unknown template: ${JSON.stringify(_exhaustive)}`);
    }
  }
  return render(element);
}

/** Vietnamese email subject per template. Matches the layout tone. */
export function subjectFor(template: EmailTemplateName): string {
  switch (template) {
    case 'verify-email':
      return 'Xác nhận tài khoản GVD next-gen';
    case 'otp-2fa':
      return 'Mã xác thực 2 lớp — GVD next-gen';
    case 'reset-password':
      return 'Đặt lại mật khẩu — GVD next-gen';
    case 'welcome':
      return 'Chào mừng đến với GVD next-gen!';
    case 'certificate':
      return 'Bạn đã nhận chứng chỉ mới 🏆';
    case 'weekly-progress':
      return 'Báo cáo tiến độ tuần — GVD next-gen';
    case 'at-risk-alert':
      return 'Chúng tôi nhớ bạn — đừng bỏ cuộc!';
    case 'course-enrolled':
      return 'Enroll khoá học thành công';
  }
}
