'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Flame, Users } from 'lucide-react';

import { ActivityFeed } from '@/components/admin/activity-feed';
import { AlertsPanel } from '@/components/admin/alerts-panel';
import { BarChartCard } from '@/components/admin/charts/bar-chart-card';
import { KpiCard } from '@/components/admin/charts/kpi-card';
import { LineChartCard } from '@/components/admin/charts/line-chart-card';
import { PieChartCard } from '@/components/admin/charts/pie-chart-card';
import { adminDashboardApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

// Cache dashboard data for 60s — the admin will usually navigate and come back
// several times in a session, so avoid re-fetching on every mount.
const STALE_TIME = 60 * 1000;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: '#F59E0B',
  ADMIN: '#3B82F6',
  INSTRUCTOR: '#10B981',
  STUDENT: '#6B7280',
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  INSTRUCTOR: 'Giảng viên',
  STUDENT: 'Học viên',
};

export default function AdminDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const enabled = !!accessToken;

  const kpi = useQuery({
    queryKey: ['admin-dashboard', 'kpi'],
    queryFn: () => adminDashboardApi.getKpi(accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const registrations = useQuery({
    queryKey: ['admin-dashboard', 'registrations', 12],
    queryFn: () => adminDashboardApi.getRegistrations(12, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const topCourses = useQuery({
    queryKey: ['admin-dashboard', 'top-courses', 10],
    queryFn: () => adminDashboardApi.getTopCourses(10, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const roleDist = useQuery({
    queryKey: ['admin-dashboard', 'role-distribution'],
    queryFn: () => adminDashboardApi.getRoleDistribution(accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const activityFeed = useQuery({
    queryKey: ['admin-dashboard', 'activity-feed', 20],
    queryFn: () => adminDashboardApi.getActivityFeed(20, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const alerts = useQuery({
    queryKey: ['admin-dashboard', 'alerts'],
    queryFn: () => adminDashboardApi.getAlerts(accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tổng quan hệ thống</h1>
        <p className="mt-1 text-sm text-muted">
          KPI, biểu đồ và hoạt động mới nhất. Dữ liệu được làm mới mỗi phút.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Tổng người dùng"
          value={kpi.data?.totalUsers.value ?? 0}
          deltaPct={kpi.data?.totalUsers.deltaPct}
          color="primary"
          loading={kpi.isLoading}
        />
        <KpiCard
          icon={Flame}
          label="Hoạt động hôm nay"
          value={kpi.data?.activeToday.value ?? 0}
          deltaPct={kpi.data?.activeToday.deltaPct}
          color="success"
          loading={kpi.isLoading}
        />
        <KpiCard
          icon={BookOpen}
          label="Khoá học"
          value={kpi.data?.totalCourses.value ?? 0}
          deltaPct={kpi.data?.totalCourses.deltaPct}
          color="secondary"
          loading={kpi.isLoading}
        />
        <KpiCard
          icon={Award}
          label="Chứng chỉ đã cấp"
          value={kpi.data?.certificatesIssued.value ?? 0}
          deltaPct={kpi.data?.certificatesIssued.deltaPct}
          color="warning"
          loading={kpi.isLoading}
        />
      </div>

      {/* Line chart — full width */}
      <LineChartCard
        title="Người dùng đăng ký mới"
        description="12 tháng gần nhất"
        data={
          registrations.data?.points.map((p) => ({
            label: p.month,
            value: p.count,
          })) ?? []
        }
        loading={registrations.isLoading}
        valueLabel="Đăng ký mới"
      />

      {/* Bar chart + Pie chart row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BarChartCard
            title="Top 10 khoá học"
            description="Theo số học viên đăng ký"
            data={
              topCourses.data?.courses.map((c) => ({
                label: c.title,
                value: c.enrollmentCount,
              })) ?? []
            }
            loading={topCourses.isLoading}
            valueLabel="Học viên"
          />
        </div>
        <PieChartCard
          title="Phân bổ theo vai trò"
          description="Tỷ lệ người dùng"
          data={
            roleDist.data?.slices.map((s) => ({
              label: ROLE_LABELS[s.role] ?? s.role,
              value: s.count,
              color: ROLE_COLORS[s.role],
            })) ?? []
          }
          loading={roleDist.isLoading}
        />
      </div>

      {/* Activity + Alerts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityFeed items={activityFeed.data?.items ?? []} loading={activityFeed.isLoading} />
        </div>
        <AlertsPanel data={alerts.data} loading={alerts.isLoading} />
      </div>
    </div>
  );
}
