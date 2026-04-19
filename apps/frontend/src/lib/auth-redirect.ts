/**
 * Helper cho việc redirect sau đăng nhập theo vai trò.
 *
 * Dùng ở:
 * - `/login` — sau khi đăng nhập bằng email/password
 * - `/2fa` — sau khi verify OTP 2 bước
 * - `/callback` — sau khi Google OAuth thành công
 * - `/dashboard` — auto-redirect nếu user lỡ truy cập shared dashboard
 *
 * Mỗi role có workspace (sidebar + layout) riêng → điều hướng đúng
 * workspace ngay từ bước đăng nhập giúp UX mạch lạc và tránh user
 * nhìn thấy các mục "Sắp có" trên shared dashboard.
 */
export function homeForRole(role: string | null | undefined): string {
  switch (role) {
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return '/admin/dashboard';
    case 'INSTRUCTOR':
      return '/instructor/dashboard';
    case 'STUDENT':
      return '/student/dashboard';
    default:
      // Fallback — role lạ hoặc chưa có → shared dashboard (cố ý không
      // redirect tiếp để tránh loop vô hạn nếu role-dashboard cũng
      // redirect về đây).
      return '/dashboard';
  }
}
