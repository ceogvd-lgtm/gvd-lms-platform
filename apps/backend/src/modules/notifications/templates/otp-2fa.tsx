import { Heading, Section, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface Otp2FAProps {
  name: string;
  otp: string;
}

export function Otp2FA({ name, otp }: Otp2FAProps) {
  return (
    <EmailLayout preview={`Mã xác thực 2 lớp của bạn: ${otp}`}>
      <Heading as="h1" style={{ fontSize: '24px', color: '#7C3AED', marginTop: 0 }}>
        Mã xác thực 2 lớp
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>
        Chào {name}, dưới đây là mã OTP của bạn:
      </Text>
      <Section
        style={{
          textAlign: 'center',
          backgroundColor: '#F5F3FF',
          border: '2px dashed #7C3AED',
          borderRadius: '16px',
          padding: '24px 32px',
          margin: '24px 0',
        }}
      >
        <Text
          style={{
            fontSize: '42px',
            fontWeight: 700,
            letterSpacing: '12px',
            color: '#1E40AF',
            margin: 0,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {otp}
        </Text>
      </Section>
      <Text style={{ color: '#475569', fontSize: '14px' }}>
        Mã có hiệu lực trong <strong>10 phút</strong>.
      </Text>
      <Text style={{ fontSize: '12px', color: '#94A3B8', marginTop: '16px' }}>
        Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email và đổi mật khẩu ngay lập tức.
      </Text>
    </EmailLayout>
  );
}
