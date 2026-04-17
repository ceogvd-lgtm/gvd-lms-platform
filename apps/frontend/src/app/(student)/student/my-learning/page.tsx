'use client';

import { Badge, Button, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Lock,
  Play,
  PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { studentsApi, type MyLearningNode } from '@/lib/students';

/**
 * /student/my-learning — hierarchical learning tree with lock logic.
 *
 * Ngành → Môn → Khoá học → Chương → Bài học
 *
 * Lock rule is server-computed (see StudentsService.getMyLearning): a
 * lesson is LOCKED if and only if the PREVIOUS lesson in the course
 * hasn't been COMPLETED. We just render what the API says.
 */
export default function MyLearningPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['student-my-learning'],
    queryFn: () => studentsApi.myLearning(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Lộ trình học tập</h1>
        <p className="mt-1 text-sm text-muted">
          Cây học đầy đủ — hoàn thành bài trước để mở khoá bài sau.
        </p>
      </header>

      {query.isLoading && <LoadingState />}

      {query.isError && (
        <Card className="border-error/30 bg-error/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-semibold text-error">Không tải được lộ trình</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <p className="text-base font-semibold text-foreground">
              Bạn chưa được enroll khoá học nào
            </p>
            <p className="mt-2 text-sm text-muted">
              Liên hệ Quản trị viên để được thêm vào một khoá học.
            </p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length > 0 && (
        <div className="space-y-4">
          {query.data.map((node) => (
            <DepartmentNode key={node.department.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Department → Subject → Course collapsible tree
// =====================================================

function DepartmentNode({ node }: { node: MyLearningNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 border-b border-border bg-surface-2/30 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="flex-1 text-base font-bold text-foreground">{node.department.name}</span>
        <span className="text-xs text-muted">{node.subjects.length} môn</span>
      </button>
      {open && (
        <div className="divide-y divide-border">
          {node.subjects.map((s) => (
            <SubjectNode key={s.id} subject={s} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SubjectNode({ subject }: { subject: MyLearningNode['subjects'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/30"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="flex-1 text-sm font-semibold text-foreground">{subject.name}</span>
        <Badge tone="info">Điểm TB: {subject.avgScore}%</Badge>
        <span className="text-xs text-muted">{subject.courses.length} khoá</span>
      </button>
      {open && (
        <div className="divide-y divide-border bg-surface-2/10">
          {subject.courses.map((c) => (
            <CourseNode key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseNode({ course }: { course: MyLearningNode['subjects'][number]['courses'][number] }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-surface-2/40"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{course.title}</p>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
              <div
                className={
                  'h-full rounded-full transition-all duration-500 ' +
                  (course.progressPercent === 100 ? 'bg-success' : 'bg-primary')
                }
                style={{ width: `${Math.max(2, course.progressPercent)}%` }}
              />
            </div>
            <span className="text-xs text-muted">{course.progressPercent}%</span>
          </div>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-border bg-surface-2/5">
          {course.chapters.map((ch) => (
            <div key={ch.id} className="px-8 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {ch.title}
              </p>
              <ul className="space-y-1">
                {ch.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
}: {
  lesson: MyLearningNode['subjects'][number]['courses'][number]['chapters'][number]['lessons'][number];
}) {
  const status = lesson.status;
  const isLocked = lesson.isLocked;

  const StatusIcon =
    status === 'COMPLETED' ? CheckCircle2 : status === 'IN_PROGRESS' ? PlayCircle : Circle;
  const statusTone =
    status === 'COMPLETED'
      ? 'text-success'
      : status === 'IN_PROGRESS'
        ? 'text-primary'
        : 'text-muted';

  return (
    <li
      className={
        'flex items-center gap-3 rounded px-2 py-1.5 transition-colors ' +
        (isLocked ? 'opacity-50' : 'hover:bg-surface-2/60')
      }
      title={isLocked ? 'Hoàn thành bài trước để mở khoá' : undefined}
    >
      {isLocked ? (
        <Lock className="h-4 w-4 text-muted" />
      ) : (
        <StatusIcon className={`h-4 w-4 ${statusTone}`} />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{lesson.title}</span>
      {lesson.type === 'PRACTICE' && (
        <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
          TH
        </span>
      )}
      {lesson.score !== null && (
        <Badge tone={lesson.score >= 70 ? 'success' : 'warning'}>{lesson.score}%</Badge>
      )}
      <span className="flex items-center gap-1 text-xs text-muted">
        <Clock className="h-3 w-3" />
        {lesson.estimatedMinutes}p
      </span>
      {isLocked ? (
        <span className="text-xs text-muted">Đã khoá</span>
      ) : (
        <Button asChild size="sm" variant={status === 'COMPLETED' ? 'ghost' : 'default'}>
          <Link href={`/student/lessons/${lesson.id}`}>
            <Play className="h-3 w-3" />
            {status === 'COMPLETED' ? 'Xem lại' : status === 'IN_PROGRESS' ? 'Tiếp tục' : 'Học'}
          </Link>
        </Button>
      )}
    </li>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-card bg-surface-2" />
      ))}
    </div>
  );
}
