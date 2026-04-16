import { Button, Heading, Hr, Section, Text } from '@react-email/components';

import { EmailLayout } from './_layout';

export interface WeeklyProgressProps {
  name: string;
  weekStart: string;
  weekEnd: string;
  lessonsCompleted: number;
  minutesSpent: number;
  currentStreak: number;
  dashboardUrl: string;
}

export function WeeklyProgress({
  name,
  weekStart,
  weekEnd,
  lessonsCompleted,
  minutesSpent,
  currentStreak,
  dashboardUrl,
}: WeeklyProgressProps) {
  return (
    <EmailLayout preview={`Báo cáo tuần: ${lessonsCompleted} bài giảng hoàn thành`}>
      <Heading as="h1" style={{ fontSize: '24px', color: '#2563EB', marginTop: 0 }}>
        Báo cáo tiến độ tuần
      </Heading>
      <Text style={{ color: '#475569', fontSize: '15px' }}>
        Chào {name}, đây là tổng kết tuần học của bạn ({weekStart} → {weekEnd}):
      </Text>

      {/* Stats row */}
      <Section style={{ marginTop: '24px' }}>
        <table
          cellPadding={0}
          cellSpacing={0}
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <tr>
            <td style={statCell}>
              <Text style={statValue}>{lessonsCompleted}</Text>
              <Text style={statLabel}>Bài giảng</Text>
            </td>
            <td style={statCell}>
              <Text style={statValue}>{minutesSpent}</Text>
              <Text style={statLabel}>Phút học</Text>
            </td>
            <td style={statCell}>
              <Text style={statValue}>🔥 {currentStreak}</Text>
              <Text style={statLabel}>Ngày liên tiếp</Text>
            </td>
          </tr>
        </table>
      </Section>

      <Hr
        style={{
          border: 'none',
          borderTop: '1px solid #E2E8F0',
          margin: '24px 0',
        }}
      />

      <Text
        style={{
          color: '#475569',
          fontSize: '14px',
          lineHeight: '1.6',
          textAlign: 'center',
        }}
      >
        Tiếp tục duy trì nhịp độ học tập đều đặn để giữ vững chuỗi ngày hoạt động và tối đa hoá hiệu
        quả tiếp thu!
      </Text>

      <Section style={{ textAlign: 'center', marginTop: '16px' }}>
        <Button
          href={dashboardUrl}
          style={{
            display: 'inline-block',
            backgroundColor: '#2563EB',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          Xem chi tiết trên Dashboard
        </Button>
      </Section>
    </EmailLayout>
  );
}

const statCell: React.CSSProperties = {
  width: '33.33%',
  textAlign: 'center',
  padding: '16px 8px',
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
};
const statValue: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  color: '#2563EB',
  margin: 0,
  lineHeight: 1,
};
const statLabel: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
  marginTop: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};
