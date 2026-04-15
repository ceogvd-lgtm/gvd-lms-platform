import { Button, Heading, Section, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface CertificateProps {
  name: string;
  courseName: string;
  certificateUrl: string;
  issuedAt: string;
}

export function Certificate({ name, courseName, certificateUrl, issuedAt }: CertificateProps) {
  return (
    <EmailLayout preview={`Chứng chỉ "${courseName}" đã được cấp`}>
      <Section style={{ textAlign: 'center' }}>
        <Text style={{ fontSize: '48px', margin: 0 }}>🏆</Text>
      </Section>
      <Heading
        as="h1"
        style={{
          fontSize: '26px',
          color: '#2563EB',
          textAlign: 'center',
          marginTop: '8px',
          marginBottom: '8px',
        }}
      >
        Chúc mừng! Bạn đã nhận chứng chỉ
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px', textAlign: 'center', lineHeight: '1.6' }}>
        Chào {name}, chúc mừng bạn đã hoàn thành xuất sắc khoá học và đạt chứng chỉ:
      </Text>

      <Section
        style={{
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '16px',
          padding: '24px',
          margin: '24px 0',
          textAlign: 'center',
        }}
      >
        <Text
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#1E40AF',
            margin: 0,
          }}
        >
          {courseName}
        </Text>
        <Text style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
          Ngày cấp: {issuedAt}
        </Text>
      </Section>

      <Section style={{ textAlign: 'center' }}>
        <Button
          href={certificateUrl}
          style={{
            display: 'inline-block',
            backgroundColor: '#2563EB',
            color: '#ffffff',
            padding: '14px 32px',
            borderRadius: '12px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Xem chứng chỉ
        </Button>
      </Section>

      <Text
        style={{
          fontSize: '12px',
          color: '#94A3B8',
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        Chứng chỉ đã được đính kèm dưới dạng PDF. Bạn có thể tải về và chia sẻ lên LinkedIn.
      </Text>
    </EmailLayout>
  );
}
