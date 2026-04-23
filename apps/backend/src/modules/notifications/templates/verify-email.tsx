import { Button, Heading, Link, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface VerifyEmailProps {
  name: string;
  link: string;
}

export function VerifyEmail({ name, link }: VerifyEmailProps) {
  return (
    <EmailLayout preview={`Xác nhận tài khoản GVD next gen LMS của ${name}`}>
      <Heading as="h1" style={{ fontSize: '24px', color: '#2563EB', marginTop: 0 }}>
        Xác nhận email của bạn
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>Chào {name},</Text>
      <Text style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
        Cảm ơn bạn đã đăng ký <strong>GVD next gen LMS</strong>. Vui lòng nhấn nút bên dưới để xác
        nhận địa chỉ email. Liên kết có hiệu lực trong <strong>24 giờ</strong>.
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
          fontSize: '15px',
          textDecoration: 'none',
          marginTop: '16px',
        }}
      >
        Xác nhận tài khoản
      </Button>
      <Text style={{ fontSize: '12px', color: '#94A3B8', marginTop: '24px' }}>
        Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:
        <br />
        <Link href={link} style={{ color: '#2563EB', wordBreak: 'break-all' }}>
          {link}
        </Link>
      </Text>
    </EmailLayout>
  );
}
