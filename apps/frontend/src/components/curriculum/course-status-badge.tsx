import { Badge } from '@lms/ui';

import type { CourseStatus } from '@/lib/curriculum';

const STATUS_MAP: Record<
  CourseStatus,
  { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'warning' },
  PUBLISHED: { label: 'Đã xuất bản', tone: 'success' },
  ARCHIVED: { label: 'Lưu trữ', tone: 'info' },
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const conf = STATUS_MAP[status];
  return <Badge tone={conf.tone}>{conf.label}</Badge>;
}
