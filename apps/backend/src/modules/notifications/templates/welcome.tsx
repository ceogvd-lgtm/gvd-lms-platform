import { Button, Heading, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface WelcomeProps {
  name: string;
  dashboardUrl: string;
}

export function Welcome({ name, dashboardUrl }: WelcomeProps) {
  return (
    <EmailLayout preview={`Chào mừng ${name} đến với GVD next-gen`}>
      <Heading as="h1" style={{ fontSize: '26px', color: '#2563EB', marginTop: 0 }}>
        Chào mừng đến với GVD next-gen! 🎉
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>Chào {name},</Text>
      <Text style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
        Tài khoản của bạn đã được xác thực thành công. Bạn đã sẵn sàng khám phá hàng trăm khoá học
        thực hành kỹ thuật công nghiệp với các mô phỏng 3D sống động và AI hỗ trợ học tập cá nhân
        hoá.
      </Text>

      <Text
        style={{
          color: '#020817',
          fontSize: '14px',
          fontWeight: 600,
          marginTop: '24px',
          marginBottom: '8px',
        }}
      >
        Gợi ý bắt đầu:
      </Text>
      <Text style={{ color: '#475569', fontSize: '14px', lineHeight: '1.8', margin: 0 }}>
        · Khám phá các khoá học theo ngành nghề
        <br />· Hoàn thành bài đánh giá đầu vào để nhận lộ trình học cá nhân
        <br />· Tham gia cộng đồng học viên kỹ thuật
      </Text>

      <Button
        href={dashboardUrl}
        style={{
          display: 'inline-block',
          backgroundColor: '#2563EB',
          color: '#ffffff',
          padding: '14px 32px',
          borderRadius: '12px',
          fontWeight: 600,
          textDecoration: 'none',
          marginTop: '24px',
        }}
      >
        Vào Dashboard
      </Button>
    </EmailLayout>
  );
}
