'use client';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { InstructorSidebar } from '@/components/instructor/instructor-sidebar';
import { useAuthStore } from '@/lib/auth-store';

import { AppSidebar } from './app-sidebar';

/**
 * Render đúng sidebar cho workspace của role khi user đang ở các trang
 * shared như `/profile`, `/account/settings`, `/dashboard` fallback.
 *
 * Lý do: AppSidebar dùng chung có các mục "Sắp có" (Khoá học / Bài giảng /
 * Tiến độ / Cài đặt) cho role không phải STUDENT — khi Admin/Instructor
 * truy cập /profile họ thấy sidebar không liên quan workspace của mình.
 *
 * Tất cả 3 sidebar cùng signature `{ collapsed?: boolean }` nên switch
 * component an toàn, không cần adapt props.
 */
export function RoleAwareSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return <AdminSidebar collapsed={collapsed} />;
  }
  if (role === 'INSTRUCTOR') {
    return <InstructorSidebar collapsed={collapsed} />;
  }
  // STUDENT + fallback khi role null (chưa hydrate xong)
  return <AppSidebar collapsed={collapsed} />;
}
