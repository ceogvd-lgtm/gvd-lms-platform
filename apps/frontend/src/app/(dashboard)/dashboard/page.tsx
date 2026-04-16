'use client';

import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CircularProgress,
  Progress,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@lms/ui';
import { ArrowRight, Award, BookOpen, Sparkles, Users } from 'lucide-react';

const STATS = [
  { label: 'Khoá học', value: '12', icon: BookOpen, change: '+2 tuần này' },
  { label: 'Học viên', value: '348', icon: Users, change: '+12% tháng' },
  { label: 'Hoàn thành', value: '74%', icon: Award, change: '+5% tuần' },
  { label: 'Hoạt động', value: '8.4k', icon: Sparkles, change: 'real-time' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tổng quan' }]} />

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tổng quan</h1>
          <p className="mt-1 text-sm text-muted">
            Theo dõi tiến độ học tập, khoá học và hoạt động gần đây.
          </p>
        </div>
        <Button onClick={() => toast.success('Toast hoạt động!')}>
          Test toast <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} hover>
              <CardHeader className="!mb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted">{s.label}</CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-button bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{s.value}</p>
                <p className="mt-1 text-xs text-muted">{s.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs showcase */}
      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">Tiến độ</TabsTrigger>
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="loading">Loading state</TabsTrigger>
        </TabsList>

        <TabsContent value="progress">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tiến độ khoá học</CardTitle>
                <CardDescription>Cập nhật real-time</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted">An toàn lao động</span>
                    <span className="font-semibold">82%</span>
                  </div>
                  <Progress value={82} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted">PLC cơ bản</span>
                    <span className="font-semibold">45%</span>
                  </div>
                  <Progress value={45} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted">Robot công nghiệp</span>
                    <span className="font-semibold">12%</span>
                  </div>
                  <Progress value={12} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hoàn thành tổng</CardTitle>
                <CardDescription>Trên tất cả khoá đã enroll</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-around pt-2">
                <CircularProgress value={74} size={120} strokeWidth={10} />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="md" initials="NA" online />
                    <div>
                      <p className="text-sm font-semibold">Nguyễn An</p>
                      <p className="text-xs text-muted">Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Avatar size="md" initials="TB" />
                    <div>
                      <p className="text-sm font-semibold">Trần Bình</p>
                      <p className="text-xs text-muted">Offline</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="badges">
          <Card>
            <CardHeader>
              <CardTitle>Badge variants</CardTitle>
              <CardDescription>5 semantic colors + outline mode</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">Info</Badge>
                <Badge tone="success">Success</Badge>
                <Badge tone="warning">Warning</Badge>
                <Badge tone="error">Error</Badge>
                <Badge tone="neutral">Neutral</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="info" outline>
                  Info
                </Badge>
                <Badge tone="success" outline>
                  Success
                </Badge>
                <Badge tone="warning" outline>
                  Warning
                </Badge>
                <Badge tone="error" outline>
                  Error
                </Badge>
                <Badge tone="neutral" outline>
                  Neutral
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loading">
          <Card>
            <CardHeader>
              <CardTitle>Skeleton placeholder</CardTitle>
              <CardDescription>Shimmer animation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <div className="flex items-center gap-3 pt-2">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
