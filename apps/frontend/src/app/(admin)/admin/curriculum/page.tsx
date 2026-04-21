'use client';

import { Breadcrumb, Button, Skeleton, toast } from '@lms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Book,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Layers,
  List,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { CourseStatusBadge } from '@/components/curriculum/course-status-badge';
import { EditPanel } from '@/components/curriculum/edit-panel';
import {
  ChapterForm,
  CourseForm,
  DepartmentForm,
  LessonForm,
  SubjectForm,
} from '@/components/curriculum/node-forms';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  chaptersApi,
  coursesApi,
  departmentsApi,
  lessonsApi,
  subjectsApi,
  type Chapter,
  type Course,
  type CourseDetail,
  type Department,
  type Lesson,
  type Subject,
} from '@/lib/curriculum';

/* ============================================================
 * Panel state — lightweight discriminated union to drive the
 * right-side slide-in editor. Reset to null to close.
 * ============================================================ */
type PanelState =
  | { kind: 'department-new' }
  | { kind: 'department-edit'; item: Department }
  | { kind: 'subject-new'; departmentId: string }
  | { kind: 'subject-edit'; item: Subject }
  | { kind: 'course-new'; subjectId: string }
  | { kind: 'course-edit'; item: Course }
  | { kind: 'chapter-new'; courseId: string }
  | { kind: 'chapter-edit'; item: Chapter }
  | { kind: 'lesson-new'; chapterId: string }
  | { kind: 'lesson-edit'; item: Lesson }
  | null;

/* ============================================================
 * Page
 * ============================================================ */
export default function CurriculumPage() {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [panel, setPanel] = useState<PanelState>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---- Queries ----
  const depsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list(true),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['chapters'] });
  };

  // ---- Submit handlers wired into the panel forms ----
  const [submitting, setSubmitting] = useState(false);

  const run = async <T,>(fn: () => Promise<T>, successMsg: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      await fn();
      toast.success(successMsg);
      setPanel(null);
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Delete helpers ----
  const deleteDept = async (d: Department) => {
    if (!confirm(`Xoá ngành "${d.name}"?`)) return;
    try {
      await departmentsApi.remove(d.id, token!);
      toast.success('Đã xoá ngành');
      invalidateAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteSubject = async (s: Subject) => {
    if (
      !confirm(
        `Xoá môn học "${s.name}"?\n\nHành động này không thể hoàn tác qua UI (cần DB trực tiếp).`,
      )
    )
      return;
    try {
      await subjectsApi.remove(s.id, token!);
      toast.success('Đã xoá môn học');
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const deleteCourse = async (c: Course) => {
    if (
      !confirm(
        `Xoá khoá học "${c.title}"?\n\nKhoá học + tất cả chương/bài giảng bên trong sẽ bị soft-delete. Hành động ghi audit log.`,
      )
    )
      return;
    try {
      await coursesApi.remove(c.id, token!);
      toast.success('Đã xoá khoá học');
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const deleteChapter = async (ch: Chapter) => {
    if (!confirm(`Xoá chương "${ch.title}"?\n\nTất cả bài giảng trong chương cũng bị xoá theo.`))
      return;
    try {
      await chaptersApi.remove(ch.id, token!);
      toast.success('Đã xoá chương');
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const deleteLesson = async (l: Lesson) => {
    if (!confirm(`Xoá bài giảng "${l.title}"?\n\nHành động này soft-delete + ghi audit log.`))
      return;
    try {
      await lessonsApi.remove(l.id, token!);
      toast.success('Đã xoá bài giảng');
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/admin/users' }, { label: 'Curriculum' }]} />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý cấu trúc</h1>
          <p className="mt-1 text-sm text-muted">
            Ngành → Môn → Khoá học → Chương → Bài giảng. Click node để sửa, ấn{' '}
            <Plus className="inline h-3 w-3" /> để thêm con.
          </p>
        </div>
        <Button onClick={() => setPanel({ kind: 'department-new' })}>
          <Plus className="h-4 w-4" />
          Thêm ngành
        </Button>
      </div>

      {depsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : depsQuery.data?.length === 0 ? (
        <div className="rounded-card border border-dashed border-border p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-sm font-medium text-foreground">Chưa có ngành học nào</p>
          <p className="mt-1 text-xs text-muted">Bắt đầu bằng cách thêm ngành đầu tiên.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {depsQuery.data?.map((dept) => (
            <DepartmentNode
              key={dept.id}
              dept={dept}
              expanded={expanded}
              toggle={toggle}
              setPanel={setPanel}
              onDelete={deleteDept}
              onDeleteSubject={deleteSubject}
              onDeleteCourse={deleteCourse}
              onDeleteChapter={deleteChapter}
              onDeleteLesson={deleteLesson}
            />
          ))}
        </ul>
      )}

      {/* Right slide-in panel */}
      <EditPanel open={panel !== null} onClose={() => setPanel(null)} title={panelTitle(panel)}>
        {panel?.kind === 'department-new' && (
          <DepartmentForm
            onSubmit={async (data) => {
              await run(() => departmentsApi.create(data, token!), 'Đã tạo ngành');
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'department-edit' && (
          <DepartmentForm
            initial={panel.item}
            onSubmit={async (data) => {
              await run(
                () =>
                  departmentsApi.update(
                    panel.item.id,
                    { name: data.name, description: data.description },
                    token!,
                  ),
                'Đã cập nhật ngành',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'subject-new' && (
          <SubjectForm
            departmentId={panel.departmentId}
            onSubmit={async (data) => {
              await run(() => subjectsApi.create(data, token!), 'Đã tạo môn học');
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'subject-edit' && (
          <SubjectForm
            departmentId={panel.item.departmentId}
            initial={panel.item}
            onSubmit={async (data) => {
              await run(
                () =>
                  subjectsApi.update(
                    panel.item.id,
                    { name: data.name, description: data.description },
                    token!,
                  ),
                'Đã cập nhật môn học',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'course-new' && (
          <CourseForm
            subjectId={panel.subjectId}
            onSubmit={async (data) => {
              await run(() => coursesApi.create(data, token!), 'Đã tạo khoá học (DRAFT)');
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'course-edit' && (
          <CourseForm
            subjectId={panel.item.subjectId}
            initial={panel.item}
            onSubmit={async (data) => {
              await run(
                () =>
                  coursesApi.update(
                    panel.item.id,
                    { title: data.title, description: data.description },
                    token!,
                  ),
                'Đã cập nhật khoá học',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'chapter-new' && (
          <ChapterForm
            onSubmit={async (data) => {
              await run(() => chaptersApi.create(panel.courseId, data, token!), 'Đã tạo chương');
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'chapter-edit' && (
          <ChapterForm
            initial={panel.item}
            onSubmit={async (data) => {
              await run(
                () => chaptersApi.update(panel.item.id, data, token!),
                'Đã cập nhật chương',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'lesson-new' && (
          <LessonForm
            onSubmit={async (data) => {
              await run(
                () => lessonsApi.createInChapter(panel.chapterId, data, token!),
                'Đã tạo bài giảng',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'lesson-edit' && (
          <LessonForm
            initial={panel.item}
            onSubmit={async (data) => {
              await run(
                () => lessonsApi.update(panel.item.id, { title: data.title }, token!),
                'Đã cập nhật bài giảng',
              );
            }}
            submitting={submitting}
            onCancel={() => setPanel(null)}
          />
        )}
      </EditPanel>
    </div>
  );
}

function panelTitle(p: PanelState): string {
  if (!p) return '';
  switch (p.kind) {
    case 'department-new':
      return 'Thêm ngành học';
    case 'department-edit':
      return 'Sửa ngành học';
    case 'subject-new':
      return 'Thêm môn học';
    case 'subject-edit':
      return 'Sửa môn học';
    case 'course-new':
      return 'Thêm khoá học';
    case 'course-edit':
      return 'Sửa khoá học';
    case 'chapter-new':
      return 'Thêm chương';
    case 'chapter-edit':
      return 'Sửa chương';
    case 'lesson-new':
      return 'Thêm bài giảng';
    case 'lesson-edit':
      return 'Sửa bài giảng';
  }
}

/* ============================================================
 * Department node — fetches subjects lazily when expanded
 * ============================================================ */
function DepartmentNode({
  dept,
  expanded,
  toggle,
  setPanel,
  onDelete,
  onDeleteSubject,
  onDeleteCourse,
  onDeleteChapter,
  onDeleteLesson,
}: {
  dept: Department;
  expanded: Set<string>;
  toggle: (key: string) => void;
  setPanel: (p: PanelState) => void;
  onDelete: (d: Department) => void;
  onDeleteSubject: (s: Subject) => void;
  onDeleteCourse: (c: Course) => void;
  onDeleteChapter: (ch: Chapter) => void;
  onDeleteLesson: (l: Lesson) => void;
}) {
  const key = `dept:${dept.id}`;
  const open = expanded.has(key);

  const subjectsQuery = useQuery({
    queryKey: ['subjects', dept.id],
    queryFn: () => subjectsApi.list(dept.id),
    enabled: open,
  });

  return (
    <li className="rounded-card border border-border bg-surface">
      <NodeHeader
        icon={<Building2 className="h-4 w-4" />}
        open={open}
        onToggle={() => toggle(key)}
        label={dept.name}
        meta={
          <>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">
              {dept.code}
            </code>
            <span className="text-xs text-muted">{dept._count?.subjects ?? 0} môn</span>
          </>
        }
        actions={[
          {
            icon: Plus,
            label: 'Thêm môn học',
            onClick: () => setPanel({ kind: 'subject-new', departmentId: dept.id }),
          },
          {
            icon: Pencil,
            label: 'Sửa',
            onClick: () => setPanel({ kind: 'department-edit', item: dept }),
          },
          {
            icon: Trash2,
            label: 'Xoá',
            destructive: true,
            onClick: () => onDelete(dept),
          },
        ]}
      />
      {open && (
        <div className="border-t border-border pl-10 pr-4 py-2">
          {subjectsQuery.isLoading && <Skeleton className="h-8 w-full my-1" />}
          {/*
            Empty-state với CTA button — icon `+` trong NodeHeader actions
            nhỏ và dễ bỏ qua (đặc biệt trên mobile / khi nhiều node). Hiển
            thị nút rõ ràng ở đây giúp admin mới biết chắc nơi thêm môn.
          */}
          {subjectsQuery.data?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs italic text-muted">Chưa có môn học nào</p>
              <button
                type="button"
                onClick={() => setPanel({ kind: 'subject-new', departmentId: dept.id })}
                className="inline-flex items-center gap-1.5 rounded-button bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm môn học đầu tiên
              </button>
            </div>
          )}
          <ul className="space-y-1">
            {subjectsQuery.data?.map((s) => (
              <SubjectNode
                key={s.id}
                subject={s}
                expanded={expanded}
                toggle={toggle}
                setPanel={setPanel}
                onDelete={onDeleteSubject}
                onDeleteCourse={onDeleteCourse}
                onDeleteChapter={onDeleteChapter}
                onDeleteLesson={onDeleteLesson}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ============================================================
 * Subject node
 * ============================================================ */
function SubjectNode({
  subject,
  expanded,
  toggle,
  setPanel,
  onDelete,
  onDeleteCourse,
  onDeleteChapter,
  onDeleteLesson,
}: {
  subject: Subject;
  expanded: Set<string>;
  toggle: (key: string) => void;
  setPanel: (p: PanelState) => void;
  onDelete: (s: Subject) => void;
  onDeleteCourse: (c: Course) => void;
  onDeleteChapter: (ch: Chapter) => void;
  onDeleteLesson: (l: Lesson) => void;
}) {
  const token = useAuthStore((s) => s.accessToken);
  const key = `subj:${subject.id}`;
  const open = expanded.has(key);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'subject', subject.id],
    queryFn: () => coursesApi.list({ subjectId: subject.id, limit: 100 }, token!),
    enabled: open && !!token,
  });

  return (
    <li>
      <NodeHeader
        icon={<Book className="h-4 w-4" />}
        open={open}
        onToggle={() => toggle(key)}
        label={subject.name}
        meta={
          <>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">
              {subject.code}
            </code>
            <span className="text-xs text-muted">{subject._count?.courses ?? 0} khoá</span>
          </>
        }
        actions={[
          {
            icon: Plus,
            label: 'Thêm khoá học',
            onClick: () => setPanel({ kind: 'course-new', subjectId: subject.id }),
          },
          {
            icon: Pencil,
            label: 'Sửa',
            onClick: () => setPanel({ kind: 'subject-edit', item: subject }),
          },
          {
            icon: Trash2,
            label: 'Xoá',
            destructive: true,
            onClick: () => onDelete(subject),
          },
        ]}
      />
      {open && (
        <div className="pl-8 py-1">
          {coursesQuery.isLoading && <Skeleton className="h-8 w-full my-1" />}
          {/* Empty-state CTA — cùng lý do với DepartmentNode empty state */}
          {coursesQuery.data?.data.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-3">
              <p className="text-xs italic text-muted">Chưa có khoá học</p>
              <button
                type="button"
                onClick={() => setPanel({ kind: 'course-new', subjectId: subject.id })}
                className="inline-flex items-center gap-1.5 rounded-button bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm khoá học đầu tiên
              </button>
            </div>
          )}
          <ul className="space-y-1">
            {coursesQuery.data?.data.map((c) => (
              <CourseNode
                key={c.id}
                course={c}
                expanded={expanded}
                toggle={toggle}
                setPanel={setPanel}
                onDelete={onDeleteCourse}
                onDeleteChapter={onDeleteChapter}
                onDeleteLesson={onDeleteLesson}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ============================================================
 * Course node — fetches its chapter/lesson tree when expanded
 * ============================================================ */
function CourseNode({
  course,
  expanded,
  toggle,
  setPanel,
  onDelete,
  onDeleteChapter,
  onDeleteLesson,
}: {
  course: Course;
  expanded: Set<string>;
  toggle: (key: string) => void;
  setPanel: (p: PanelState) => void;
  onDelete: (c: Course) => void;
  onDeleteChapter: (ch: Chapter) => void;
  onDeleteLesson: (l: Lesson) => void;
}) {
  const token = useAuthStore((s) => s.accessToken);
  const key = `course:${course.id}`;
  const open = expanded.has(key);

  const detailQuery = useQuery({
    queryKey: ['course-detail', course.id],
    queryFn: () => coursesApi.findOne(course.id, token!),
    enabled: open && !!token,
  });

  return (
    <li>
      <NodeHeader
        icon={<Layers className="h-4 w-4" />}
        open={open}
        onToggle={() => toggle(key)}
        label={course.title}
        meta={
          <>
            <CourseStatusBadge status={course.status} />
            <span className="text-xs text-muted">{course._count?.chapters ?? 0} chương</span>
          </>
        }
        actions={[
          {
            icon: Plus,
            label: 'Thêm chương',
            onClick: () => setPanel({ kind: 'chapter-new', courseId: course.id }),
          },
          {
            icon: Pencil,
            label: 'Sửa',
            onClick: () => setPanel({ kind: 'course-edit', item: course }),
          },
          {
            icon: Trash2,
            label: 'Xoá',
            destructive: true,
            onClick: () => onDelete(course),
          },
        ]}
      />
      {open && (
        <div className="pl-8 py-1">
          {detailQuery.isLoading && <Skeleton className="h-8 w-full my-1" />}
          {(detailQuery.data as CourseDetail)?.chapters?.length === 0 && (
            <p className="py-2 text-xs italic text-muted">Chưa có chương nào</p>
          )}
          <ul className="space-y-1">
            {(detailQuery.data as CourseDetail)?.chapters?.map((ch) => (
              <ChapterNode
                key={ch.id}
                chapter={ch}
                expanded={expanded}
                toggle={toggle}
                setPanel={setPanel}
                onDelete={onDeleteChapter}
                onDeleteLesson={onDeleteLesson}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ============================================================
 * Chapter node — lessons inline (no extra fetch, baked into course-detail)
 * ============================================================ */
function ChapterNode({
  chapter,
  expanded,
  toggle,
  setPanel,
  onDelete,
  onDeleteLesson,
}: {
  chapter: Chapter;
  expanded: Set<string>;
  toggle: (key: string) => void;
  setPanel: (p: PanelState) => void;
  onDelete: (ch: Chapter) => void;
  onDeleteLesson: (l: Lesson) => void;
}) {
  const key = `chap:${chapter.id}`;
  const open = expanded.has(key);

  return (
    <li>
      <NodeHeader
        icon={<List className="h-4 w-4" />}
        open={open}
        onToggle={() => toggle(key)}
        label={chapter.title}
        meta={<span className="text-xs text-muted">{chapter.lessons?.length ?? 0} bài</span>}
        actions={[
          {
            icon: Plus,
            label: 'Thêm bài',
            onClick: () => setPanel({ kind: 'lesson-new', chapterId: chapter.id }),
          },
          {
            icon: Pencil,
            label: 'Sửa',
            onClick: () => setPanel({ kind: 'chapter-edit', item: chapter }),
          },
          {
            icon: Trash2,
            label: 'Xoá',
            destructive: true,
            onClick: () => onDelete(chapter),
          },
        ]}
      />
      {open && (
        <ul className="pl-8 py-1 space-y-1">
          {chapter.lessons?.length === 0 && (
            <li className="py-2 text-xs italic text-muted">Chưa có bài giảng</li>
          )}
          {chapter.lessons?.map((l) => (
            <LessonNode key={l.id} lesson={l} setPanel={setPanel} onDelete={onDeleteLesson} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ============================================================
 * Lesson leaf
 * ============================================================ */
function LessonNode({
  lesson,
  setPanel,
  onDelete,
}: {
  lesson: Lesson;
  setPanel: (p: PanelState) => void;
  onDelete: (l: Lesson) => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-button px-3 py-2 hover:bg-surface-2">
      <FileText className="h-4 w-4 shrink-0 text-muted" />
      <span className="flex-1 text-sm text-foreground truncate">{lesson.title}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted">
        {lesson.type === 'THEORY' ? 'Lý thuyết' : 'Thực hành'}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setPanel({ kind: 'lesson-edit', item: lesson })}
          className="rounded-md p-1 text-muted hover:bg-surface hover:text-primary"
          aria-label="Sửa"
          title="Sửa"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(lesson)}
          className="rounded-md p-1 text-muted hover:bg-error/10 hover:text-error"
          aria-label="Xoá"
          title="Xoá"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/* ============================================================
 * NodeHeader — shared accordion row renderer
 * ============================================================ */
interface NodeAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function NodeHeader({
  icon,
  open,
  onToggle,
  label,
  meta,
  actions,
}: {
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  label: string;
  meta?: React.ReactNode;
  actions: NodeAction[];
}) {
  return (
    <div className="group flex items-center gap-2 rounded-button px-3 py-2.5 hover:bg-surface-2">
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"
        aria-label={open ? 'Thu gọn' : 'Mở rộng'}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <span className="shrink-0 text-muted">{icon}</span>
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 truncate text-left text-sm font-medium text-foreground"
      >
        {label}
      </button>
      <div className="flex items-center gap-2">{meta}</div>
      <div className="ml-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {actions.map((a, idx) => {
          const Icon = a.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={a.onClick}
              title={a.label}
              aria-label={a.label}
              className={
                'rounded-md p-1.5 transition-colors ' +
                (a.destructive
                  ? 'text-muted hover:bg-error/10 hover:text-error'
                  : 'text-muted hover:bg-surface hover:text-primary')
              }
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Silence unused-import warnings for icons used only as refs above
void ChevronUp;
