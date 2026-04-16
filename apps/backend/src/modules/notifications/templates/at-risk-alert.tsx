import { Button, Heading, Section, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface AtRiskAlertProps {
  name: string;
  daysInactive: number;
  currentProgress: number;
  resumeUrl: string;
}

export function AtRiskAlert({ name, daysInactive, currentProgress, resumeUrl }: AtRiskAlertProps) {
  return (
    <EmailLayout preview={`Đã ${daysInactive} ngày bạn chưa quay lại học — đừng bỏ cuộc!`}>
      <Section style={{ textAlign: 'center' }}>
        <Text style={{ fontSize: '48px', margin: 0 }}>⏰</Text>
      </Section>
      <Heading
        as="h1"
        style={{
          fontSize: '24px',
          color: '#F59E0B',
          textAlign: 'center',
          marginTop: '8px',
        }}
      >
        Chúng tôi nhớ bạn!
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
        Chào {name}, đã <strong>{daysInactive} ngày</strong> bạn chưa quay lại học. Đừng để những nỗ
        lực trước đây bị lãng phí — bạn đã hoàn thành <strong>{currentProgress}%</strong> khoá học
        và chỉ còn một chặng đường ngắn để về đích.
      </Text>

      <Section
        style={{
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '16px',
          margin: '20px 0',
        }}
      >
        <Text
          style={{
            color: '#92400E',
            fontSize: '14px',
            margin: 0,
            lineHeight: '1.6',
          }}
        >
          💡 <strong>Gợi ý:</strong> Chỉ cần dành ra 15 phút mỗi ngày, bạn có thể duy trì nhịp học
          và tăng 40% tỉ lệ hoàn thành khoá học.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center' }}>
        <Button
          href={resumeUrl}
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
          Tiếp tục học ngay
        </Button>
      </Section>
    </EmailLayout>
  );
}
