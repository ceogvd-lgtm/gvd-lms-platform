import { Button, Heading, Section, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface CourseEnrolledProps {
  name: string;
  courseName: string;
  instructorName: string;
  courseUrl: string;
  estimatedHours?: number;
}

export function CourseEnrolled({
  name,
  courseName,
  instructorName,
  courseUrl,
  estimatedHours,
}: CourseEnrolledProps) {
  return (
    <EmailLayout preview={`Bạn đã được enroll vào "${courseName}"`}>
      <Heading as="h1" style={{ fontSize: '24px', color: '#2563EB', marginTop: 0 }}>
        Enroll thành công! 📚
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>Chào {name},</Text>
      <Text style={{ color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
        Chúc mừng! Bạn đã được ghi danh vào khoá học sau:
      </Text>

      <Section
        style={{
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '16px',
          padding: '20px',
          margin: '20px 0',
        }}
      >
        <Text
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1E40AF',
            margin: 0,
          }}
        >
          {courseName}
        </Text>
        <Text style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>
          Giảng viên: <strong>{instructorName}</strong>
          {estimatedHours !== undefined && (
            <>
              {' · '}Thời lượng dự kiến: <strong>{estimatedHours} giờ</strong>
            </>
          )}
        </Text>
      </Section>

      <Text style={{ color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
        Bạn có thể bắt đầu học ngay. Lộ trình học được thiết kế theo các mô-đun lý thuyết kết hợp
        bài thực hành mô phỏng 3D.
      </Text>

      <Section style={{ textAlign: 'center', marginTop: '20px' }}>
        <Button
          href={courseUrl}
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
          Bắt đầu học
        </Button>
      </Section>
    </EmailLayout>
  );
}
