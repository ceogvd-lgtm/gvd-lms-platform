import { Button, Heading, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface ResetPasswordProps {
  name: string;
  link: string;
}

export function ResetPassword({ name, link }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Đặt lại mật khẩu GVD next-gen LMS">
      <Heading as="h1" style={{ fontSize: '24px', color: '#2563EB', marginTop: 0 }}>
        Đặt lại mật khẩu
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>Chào {name},</Text>
      <Text style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn nút bên dưới để tạo
        mật khẩu mới. Liên kết có hiệu lực trong <strong>1 giờ</strong>.
      </Text>
      <Button
        href={link}
        style={{
          display: 'inline-block',
          backgroundColor: '#2563EB',
          color: '#ffffff',
          padding: '14px 32px',
          borderRadius: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          marginTop: '16px',
        }}
      >
        Đặt lại mật khẩu
      </Button>
      <Text style={{ fontSize: '12px', color: '#94A3B8', marginTop: '24px' }}>
        Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại của bạn vẫn
        nguyên vẹn.
      </Text>
    </EmailLayout>
  );
}
