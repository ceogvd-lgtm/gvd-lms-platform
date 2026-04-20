'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Stepper } from '@/components/instructor/stepper';
import { ApiError, uploadApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  chaptersApi,
  coursesApi,
  departmentsApi,
  lessonsApi,
  subjectsApi,
  type LessonType,
} from '@/lib/curriculum';

// The old wizard shipped a 4th "Cài đặt" step that was a pure placeholder
// for an advanced-settings feature that never got specced. Removed so the
// wizard is 3 meaningful steps end-to-end. If course-level settings come
// back they should live on a dedicated post-creation page
// (`/instructor/courses/:id/settings`) rather than inside the wizard.
const STEPS = ['Thông tin cơ bản', 'Cấu trúc bài học', 'Xem trước & gửi'];

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds — per Phase 10 spec

interface DraftChapter {
  id: string;
  title: string;
  lessons: DraftLesson[];
}

interface DraftLesson {
  id: string;
  title: string;
  type: LessonType;
}

export default function CreateCoursePage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [step, setStep] = useState(0);

  // ---------- Step 1 form state ----------
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [uploading, setUploading] = useState(false);

  // ---------- Step 2 structure ----------
  const [chapters, setChapters] = useState<DraftChapter[]>([]);

  // ---------- Created course id (after step 1 submit) ----------
  const [courseId, setCourseId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  // Cascading filter for ngành/môn
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list(),
    staleTime: 60 * 60 * 1000,
  });
  const subjects = useQuery({
    queryKey: ['subjects', departmentId],
    queryFn: () => subjectsApi.list(departmentId || undefined),
    enabled: !!departmentId,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-save: debounce 30s on Step 1 fields once a course exists.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = true;
  }, [title, description, thumbnailUrl, subjectId]);

  useEffect(() => {
    if (!courseId) return;
    const timer = setInterval(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setAutoSaving(true);
      try {
        await coursesApi.update(
          courseId,
          {
            title: title || undefined,
            description: description || undefined,
            subjectId: subjectId || undefined,
          },
          accessToken!,
        );
        if (thumbnailUrl) {
          // thumbnail update if provided
          await coursesApi.update(courseId, { thumbnailUrl } as never, accessToken!);
        }
        setSavedAt(new Date());
      } catch (err) {
        // Silently log — auto-save shouldn't toast on every retry. Manual
        // saves still surface errors.
        // eslint-disable-next-line no-console
        console.warn('[auto-save]', err);
      } finally {
        setAutoSaving(false);
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [courseId, accessToken, title, description, thumbnailUrl, subjectId]);

  // ---------- Step navigation ----------
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!title.trim() || title.trim().length < 2) return 'Tên khoá học cần ít nhất 2 ký tự';
      if (!subjectId) return 'Chọn môn học';
      return null;
    }
    if (s === 1) {
      if (chapters.length === 0) return 'Thêm ít nhất 1 chương';
      const emptyChapter = chapters.find((c) => c.lessons.length === 0);
      if (emptyChapter) return `Chương "${emptyChapter.title}" chưa có bài giảng`;
      return null;
    }
    return null;
  };

  const handleNext = async () => {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    if (step === 0 && !courseId) {
      // Persist initial course on first Next from step 1
      try {
        const created = await coursesApi.create(
          { subjectId, title: title.trim(), description: description || undefined },
          accessToken!,
        );
        // Patch thumbnail separately if provided (create DTO doesn't accept it).
        if (thumbnailUrl) {
          await coursesApi.update(created.id, { thumbnailUrl } as never, accessToken!);
        }
        setCourseId(created.id);
        setSavedAt(new Date());
        toast.success('Đã tạo bản nháp khoá học');
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Tạo khoá học thất bại';
        toast.error(msg);
        return;
      }
    }
    if (step === 1 && courseId) {
      // Persist all chapter+lesson order: just iterate and call reorder
      // for each. Backend Phase 08 reorder is N+1 transactional, fine for
      // a typical wizard (<20 chapters / 100 lessons).
      try {
        for (let i = 0; i < chapters.length; i += 1) {
          const c = chapters[i]!;
          await chaptersApi.reorder(c.id, i, accessToken!);
          for (let j = 0; j < c.lessons.length; j += 1) {
            const l = c.lessons[j]!;
            await lessonsApi.reorder(l.id, j, accessToken!);
          }
        }
        setSavedAt(new Date());
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Lưu thứ tự thất bại';
        toast.error(msg);
        return;
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  // ---------- Final step actions (preview) ----------
  const handleSubmitForReview = async () => {
    if (!courseId) return;
    try {
      await coursesApi.updateStatus(courseId, 'SUBMIT', accessToken!);
      toast.success('Đã gửi khoá học cho admin duyệt');
      router.push('/instructor/courses');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gửi duyệt thất bại';
      toast.error(msg);
    }
  };

  const handleSaveDraft = () => {
    toast.success('Đã lưu bản nháp');
    router.push('/instructor/courses');
  };

  // ---------- Step 1 thumbnail upload ----------
  const handleThumbnailUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadApi.thumbnail(file, accessToken!);
      setThumbnailUrl(result.fileUrl);
      toast.success('Đã upload thumbnail');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Upload thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  // ---------- Step 2 chapter + lesson management ----------
  const addChapter = async () => {
    if (!courseId) {
      toast.error('Cần điền thông tin cơ bản trước khi thêm chương');
      return;
    }
    const titleNew = window.prompt('Tên chương:');
    if (!titleNew?.trim()) return;
    try {
      const created = await chaptersApi.create(courseId, { title: titleNew.trim() }, accessToken!);
      setChapters((prev) => [...prev, { id: created.id, title: created.title, lessons: [] }]);
      setSavedAt(new Date());
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Tạo chương thất bại';
      toast.error(msg);
    }
  };

  const addLesson = async (chapterId: string) => {
    const titleNew = window.prompt('Tên bài giảng:');
    if (!titleNew?.trim()) return;
    const type = window.confirm('OK = Lý thuyết, Cancel = Thực hành ảo') ? 'THEORY' : 'PRACTICE';
    try {
      const created = await lessonsApi.createInChapter(
        chapterId,
        { title: titleNew.trim(), type: type as LessonType },
        accessToken!,
      );
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                lessons: [
                  ...c.lessons,
                  { id: created.id, title: created.title, type: created.type },
                ],
              }
            : c,
        ),
      );
      setSavedAt(new Date());
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Tạo bài giảng thất bại';
      toast.error(msg);
    }
  };

  // ---------- DnD ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleChapterDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setChapters((prev) => {
      const oldIdx = prev.findIndex((c) => c.id === active.id);
      const newIdx = prev.findIndex((c) => c.id === over.id);
      return oldIdx >= 0 && newIdx >= 0 ? arrayMove(prev, oldIdx, newIdx) : prev;
    });
  };

  const handleLessonDragEnd = (chapterId: string, e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setChapters((prev) =>
      prev.map((c) => {
        if (c.id !== chapterId) return c;
        const oldIdx = c.lessons.findIndex((l) => l.id === active.id);
        const newIdx = c.lessons.findIndex((l) => l.id === over.id);
        return oldIdx >= 0 && newIdx >= 0
          ? { ...c, lessons: arrayMove(c.lessons, oldIdx, newIdx) }
          : c;
      }),
    );
  };

  // ---------- Phase 18 Rename / Delete / Move handlers ----------
  // Mirror của /courses/[id]/edit để wizard /new cũng có đủ bộ
  // sửa/xoá/chuyển chapter & lesson. Course mới luôn DRAFT nên canDelete=true.
  const handleRenameChapter = async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      toast.error('Tên chương không được để trống');
      return;
    }
    const prev = chapters;
    setChapters((p) => p.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    try {
      await chaptersApi.update(id, { title: trimmed }, accessToken!);
      toast.success('Đã cập nhật tên chương');
    } catch (err) {
      setChapters(prev);
      toast.error(err instanceof ApiError ? err.message : 'Đổi tên thất bại');
    }
  };

  const handleDeleteChapter = async (chapter: DraftChapter) => {
    const lessonCount = chapter.lessons.length;
    if (
      !confirm(
        `Xoá chương "${chapter.title}"?\n\n` +
          (lessonCount > 0 ? `Tất cả ${lessonCount} bài học trong chương sẽ bị xoá theo.\n` : '') +
          'Không thể hoàn tác.',
      )
    ) {
      return;
    }
    const prev = chapters;
    setChapters((p) => p.filter((c) => c.id !== chapter.id));
    try {
      await chaptersApi.remove(chapter.id, accessToken!);
      toast.success('Đã xoá chương');
    } catch (err) {
      setChapters(prev);
      toast.error(err instanceof ApiError ? err.message : 'Xoá thất bại');
    }
  };

  const handleRenameLesson = async (chapterId: string, lessonId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      toast.error('Tên bài không được để trống');
      return;
    }
    const prev = chapters;
    setChapters((p) =>
      p.map((c) =>
        c.id !== chapterId
          ? c
          : {
              ...c,
              lessons: c.lessons.map((l) => (l.id === lessonId ? { ...l, title: trimmed } : l)),
            },
      ),
    );
    try {
      await lessonsApi.update(lessonId, { title: trimmed }, accessToken!);
      toast.success('Đã cập nhật tên bài giảng');
    } catch (err) {
      setChapters(prev);
      toast.error(err instanceof ApiError ? err.message : 'Đổi tên thất bại');
    }
  };

  const handleDeleteLesson = async (chapterId: string, lesson: DraftLesson) => {
    if (
      !confirm(
        `Xoá bài giảng "${lesson.title}"?\n\n` +
          'Toàn bộ nội dung (video, quiz, tài liệu) sẽ bị xoá theo.\nKhông thể hoàn tác.',
      )
    ) {
      return;
    }
    const prev = chapters;
    setChapters((p) =>
      p.map((c) =>
        c.id !== chapterId ? c : { ...c, lessons: c.lessons.filter((l) => l.id !== lesson.id) },
      ),
    );
    try {
      await lessonsApi.remove(lesson.id, accessToken!);
      toast.success('Đã xoá bài giảng');
    } catch (err) {
      setChapters(prev);
      toast.error(err instanceof ApiError ? err.message : 'Xoá thất bại');
    }
  };

  const handleMoveLesson = async (
    fromChapterId: string,
    lesson: DraftLesson,
    toChapterId: string,
  ) => {
    if (fromChapterId === toChapterId) return;
    const target = chapters.find((c) => c.id === toChapterId);
    if (!target) return;
    if (
      !confirm(
        `Chuyển bài giảng "${lesson.title}" sang chương "${target.title}"?\n\n` +
          'Bài sẽ được đặt ở cuối chương đích.',
      )
    ) {
      return;
    }
    const prev = chapters;
    setChapters((p) =>
      p.map((c) => {
        if (c.id === fromChapterId)
          return { ...c, lessons: c.lessons.filter((l) => l.id !== lesson.id) };
        if (c.id === toChapterId) return { ...c, lessons: [...c.lessons, lesson] };
        return c;
      }),
    );
    try {
      await lessonsApi.move(lesson.id, toChapterId, accessToken!);
      toast.success(`Đã chuyển "${lesson.title}" sang chương "${target.title}"`);
    } catch (err) {
      setChapters(prev);
      toast.error(err instanceof ApiError ? err.message : 'Chuyển chương thất bại');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tạo khoá học mới</h1>
          <p className="mt-1 text-sm text-muted">
            Wizard 4 bước. Auto-save mỗi 30 giây sau khi tạo bản nháp.
          </p>
        </div>
        <div className="text-xs text-muted">
          {autoSaving
            ? 'Đang lưu…'
            : savedAt
              ? `Đã lưu lúc ${savedAt.toLocaleTimeString('vi-VN')}`
              : 'Chưa lưu'}
        </div>
      </header>

      <Stepper steps={STEPS} current={step} />

      <Card>
        <CardContent className="p-6">
          {step === 0 && (
            <Step1Info
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              thumbnailUrl={thumbnailUrl}
              uploading={uploading}
              onUpload={handleThumbnailUpload}
              departmentId={departmentId}
              setDepartmentId={(v) => {
                setDepartmentId(v);
                setSubjectId('');
              }}
              subjectId={subjectId}
              setSubjectId={setSubjectId}
              departments={departments.data ?? []}
              subjects={subjects.data ?? []}
            />
          )}

          {step === 1 && (
            <Step2Structure
              chapters={chapters}
              onAddChapter={addChapter}
              onAddLesson={addLesson}
              onChapterDragEnd={handleChapterDragEnd}
              onLessonDragEnd={handleLessonDragEnd}
              onRenameChapter={handleRenameChapter}
              onDeleteChapter={handleDeleteChapter}
              onRenameLesson={handleRenameLesson}
              onDeleteLesson={handleDeleteLesson}
              onMoveLesson={handleMoveLesson}
              sensors={sensors}
            />
          )}

          {step === 2 && (
            <Step4Preview
              title={title}
              description={description}
              thumbnailUrl={thumbnailUrl}
              chapters={chapters}
            />
          )}
        </CardContent>
      </Card>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext}>
            Tiếp theo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveDraft}>
              <Save className="h-4 w-4" />
              Lưu nháp
            </Button>
            <Button variant="outline" onClick={handleSubmitForReview}>
              <Send className="h-4 w-4" />
              Gửi duyệt Admin
            </Button>
            {/*
              After the wizard has persisted the skeleton we jump straight
              to the first lesson's editor so the instructor can upload
              content (SCORM / Video / PPT / WebGL) without manually
              hunting the lesson id via the courses list. Disabled when
              the draft still has 0 lessons.
            */}
            <Button
              onClick={() => {
                const firstLessonId = chapters[0]?.lessons[0]?.id;
                if (!firstLessonId) {
                  toast.error('Hãy thêm ít nhất 1 bài giảng ở bước 2 trước');
                  return;
                }
                router.push(`/instructor/lessons/${firstLessonId}/edit`);
              }}
              disabled={!chapters[0]?.lessons[0]?.id}
            >
              <Upload className="h-4 w-4" />
              Upload nội dung
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Step 1
// =====================================================
function Step1Info({
  title,
  setTitle,
  description,
  setDescription,
  thumbnailUrl,
  uploading,
  onUpload,
  departmentId,
  setDepartmentId,
  subjectId,
  setSubjectId,
  departments,
  subjects,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  thumbnailUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  departmentId: string;
  setDepartmentId: (v: string) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  departments: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="course-title" className="mb-1.5 block text-sm font-medium">
          Tên khoá học <span className="text-red-500">*</span>
        </label>
        <input
          id="course-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: An toàn lao động cơ bản"
          maxLength={200}
          className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="course-desc" className="mb-1.5 block text-sm font-medium">
          Mô tả ngắn
        </label>
        <textarea
          id="course-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Mô tả nội dung khoá học, đối tượng học viên…"
          className="w-full rounded-button border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="thumbnail" className="mb-1.5 block text-sm font-medium">
          Thumbnail
        </label>
        <div className="flex items-center gap-3">
          {thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="h-20 w-32 shrink-0 rounded object-cover" />
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-button border border-dashed border-border px-4 py-2 text-sm hover:border-primary">
            <Upload className="h-4 w-4" />
            {uploading ? 'Đang upload…' : thumbnailUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
            <input
              id="thumbnail"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="department" className="mb-1.5 block text-sm font-medium">
            Ngành học
          </label>
          <select
            id="department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
          >
            <option value="">— Chọn ngành —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
            Môn học <span className="text-red-500">*</span>
          </label>
          <select
            id="subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!departmentId}
            className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 disabled:opacity-50"
          >
            <option value="">— Chọn môn —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        Empty state guard: khi ngành đã chọn nhưng dropdown môn rỗng, instructor
        trước đây bị kẹt im lặng — không biết lý do. Hiển thị warning màu vàng
        + hướng dẫn liên hệ admin thay vì để họ đoán (xem CONTEXT.md Phase 18).
        Instructor không được tạo Subject (quyền ADMIN+) nên không thể tự sửa.
      */}
      {departmentId && subjects.length === 0 && (
        <div className="flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700/50 dark:bg-amber-900/20">
          <span className="mt-0.5 text-base leading-none">⚠️</span>
          <div className="flex-1 text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Ngành này chưa có môn học nào</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300/90">
              Bạn không thể tạo khoá học nếu ngành chưa có môn. Vui lòng liên hệ{' '}
              <span className="font-semibold">Quản trị viên</span> để tạo môn học trước, hoặc chọn
              ngành khác đã có môn.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// Step 2 — drag-drop
// =====================================================
function Step2Structure({
  chapters,
  onAddChapter,
  onAddLesson,
  onChapterDragEnd,
  onLessonDragEnd,
  onRenameChapter,
  onDeleteChapter,
  onRenameLesson,
  onDeleteLesson,
  onMoveLesson,
  sensors,
}: {
  chapters: DraftChapter[];
  onAddChapter: () => void;
  onAddLesson: (chapterId: string) => void;
  onChapterDragEnd: (e: DragEndEvent) => void;
  onLessonDragEnd: (chapterId: string, e: DragEndEvent) => void;
  onRenameChapter: (id: string, newTitle: string) => Promise<void>;
  onDeleteChapter: (chapter: DraftChapter) => Promise<void>;
  onRenameLesson: (chapterId: string, lessonId: string, newTitle: string) => Promise<void>;
  onDeleteLesson: (chapterId: string, lesson: DraftLesson) => Promise<void>;
  onMoveLesson: (fromChapterId: string, lesson: DraftLesson, toChapterId: string) => Promise<void>;
  sensors: ReturnType<typeof useSensors>;
}) {
  const chapterIds = useMemo(() => chapters.map((c) => c.id), [chapters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Kéo-thả để sắp xếp lại thứ tự. Mỗi chương cần ít nhất 1 bài giảng.
          <span className="ml-1 text-xs italic">Hover vào chương/bài để sửa tên hoặc xoá.</span>
        </p>
        <Button variant="outline" onClick={onAddChapter}>
          <Plus className="h-4 w-4" />
          Thêm chương
        </Button>
      </div>

      {chapters.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-12 text-center">
          <p className="text-sm text-muted">Chưa có chương nào.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onChapterDragEnd}
        >
          <SortableContext items={chapterIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {chapters.map((ch, idx) => (
                <SortableChapter
                  key={ch.id}
                  chapter={ch}
                  index={idx}
                  allChapters={chapters}
                  onAddLesson={() => onAddLesson(ch.id)}
                  onLessonDragEnd={(e) => onLessonDragEnd(ch.id, e)}
                  onRename={(newTitle) => onRenameChapter(ch.id, newTitle)}
                  onDelete={() => onDeleteChapter(ch)}
                  onRenameLesson={(lessonId, newTitle) => onRenameLesson(ch.id, lessonId, newTitle)}
                  onDeleteLesson={(lesson) => onDeleteLesson(ch.id, lesson)}
                  onMoveLesson={(lesson, toChapterId) => onMoveLesson(ch.id, lesson, toChapterId)}
                  sensors={sensors}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableChapter({
  chapter,
  index,
  allChapters,
  onAddLesson,
  onLessonDragEnd,
  onRename,
  onDelete,
  onRenameLesson,
  onDeleteLesson,
  onMoveLesson,
  sensors,
}: {
  chapter: DraftChapter;
  index: number;
  allChapters: DraftChapter[];
  onAddLesson: () => void;
  onLessonDragEnd: (e: DragEndEvent) => void;
  onRename: (newTitle: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRenameLesson: (lessonId: string, newTitle: string) => Promise<void>;
  onDeleteLesson: (lesson: DraftLesson) => Promise<void>;
  onMoveLesson: (lesson: DraftLesson, toChapterId: string) => Promise<void>;
  sensors: ReturnType<typeof useSensors>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const lessonIds = useMemo(() => chapter.lessons.map((l) => l.id), [chapter.lessons]);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(chapter.title);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setEditValue(chapter.title);
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setEditValue(chapter.title);
    setIsEditing(false);
  };
  const saveEdit = async () => {
    if (editValue.trim() === chapter.title || !editValue.trim()) {
      setIsEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(editValue);
    } finally {
      setBusy(false);
      setIsEditing(false);
    }
  };
  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-card border border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Kéo để sắp xếp chương"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-xs font-mono text-muted">#{index + 1}</span>
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            ref={(el) => {
              if (el && document.activeElement !== el) el.focus();
            }}
            disabled={busy}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void saveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="flex-1 rounded border border-primary bg-background px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <h4 className="flex-1 text-sm font-semibold">{chapter.title}</h4>
        )}
        <div
          className={
            'flex items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 ' +
            (isEditing ? 'md:opacity-100' : '')
          }
        >
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                title="Lưu (Enter)"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 disabled:opacity-50"
                title="Huỷ (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startEdit}
                disabled={busy}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                title="Sửa tên chương"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                title="Xoá chương"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onAddLesson}>
          <Plus className="h-3.5 w-3.5" />
          Thêm bài
        </Button>
      </div>
      <div className="p-3">
        {chapter.lessons.length === 0 ? (
          <p className="py-3 text-center text-xs italic text-muted">Chưa có bài giảng nào</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onLessonDragEnd}
          >
            <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {chapter.lessons.map((l, lidx) => (
                  <SortableLesson
                    key={l.id}
                    lesson={l}
                    index={lidx}
                    currentChapterId={chapter.id}
                    allChapters={allChapters}
                    onRename={(newTitle) => onRenameLesson(l.id, newTitle)}
                    onDelete={() => onDeleteLesson(l)}
                    onMove={(toChapterId) => onMoveLesson(l, toChapterId)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableLesson({
  lesson,
  index,
  currentChapterId,
  allChapters,
  onRename,
  onDelete,
  onMove,
}: {
  lesson: DraftLesson;
  index: number;
  currentChapterId: string;
  allChapters: DraftChapter[];
  onRename: (newTitle: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onMove: (toChapterId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(lesson.title);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setEditValue(lesson.title);
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setEditValue(lesson.title);
    setIsEditing(false);
  };
  const saveEdit = async () => {
    if (editValue.trim() === lesson.title || !editValue.trim()) {
      setIsEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(editValue);
    } finally {
      setBusy(false);
      setIsEditing(false);
    }
  };
  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group/lesson flex items-center gap-2 rounded border border-transparent px-2 py-1.5 hover:border-border hover:bg-surface-2/40"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted hover:text-foreground active:cursor-grabbing"
        aria-label="Kéo để sắp xếp bài"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="text-xs font-mono text-muted">{index + 1}.</span>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          ref={(el) => {
            if (el && document.activeElement !== el) el.focus();
          }}
          disabled={busy}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void saveEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          className="flex-1 rounded border border-primary bg-background px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <span className="flex-1 text-sm">{lesson.title}</span>
      )}
      <div
        className={
          'flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/lesson:opacity-100 ' +
          (isEditing ? 'md:opacity-100' : '')
        }
      >
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
              title="Lưu"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={busy}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 disabled:opacity-50"
              title="Huỷ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startEdit}
              disabled={busy}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              title="Sửa tên bài"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {allChapters.length > 1 && (
              <span className="relative inline-flex">
                <span
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-amber-500/10 hover:text-amber-600"
                  title="Chuyển sang chương khác"
                >
                  <ArrowRightLeft className="h-3 w-3 pointer-events-none" />
                </span>
                <select
                  value={currentChapterId}
                  disabled={busy}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target && target !== currentChapterId) void onMove(target);
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="Chuyển sang chương khác"
                >
                  <option value={currentChapterId} disabled>
                    Chuyển sang…
                  </option>
                  {allChapters
                    .filter((c) => c.id !== currentChapterId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{allChapters.findIndex((x) => x.id === c.id) + 1} — {c.title}
                      </option>
                    ))}
                </select>
              </span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
              title="Xoá bài giảng"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      <span
        className={
          'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
          (lesson.type === 'THEORY'
            ? 'bg-primary/10 text-primary'
            : 'bg-secondary/10 text-secondary')
        }
      >
        {lesson.type === 'THEORY' ? 'Lý thuyết' : 'Thực hành'}
      </span>
    </li>
  );
}

// =====================================================
// Step 3 — preview (was Step 4 before the placeholder "Cài đặt" got cut)
// =====================================================
function Step4Preview({
  title,
  description,
  thumbnailUrl,
  chapters,
}: {
  title: string;
  description: string;
  thumbnailUrl: string;
  chapters: DraftChapter[];
}) {
  const totalLessons = chapters.reduce((sum, c) => sum + c.lessons.length, 0);
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex gap-4">
          {thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="h-32 w-48 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">{title || '(Chưa có tên)'}</h3>
            <p className="mt-1 text-sm text-muted">{description || '(Chưa có mô tả)'}</p>
            <div className="mt-3 flex gap-3 text-xs text-muted">
              <span>{chapters.length} chương</span>
              <span>·</span>
              <span>{totalLessons} bài giảng</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Cấu trúc bài học</h4>
        <ol className="space-y-2">
          {chapters.map((c, i) => (
            <li key={c.id} className="rounded-card border border-border bg-surface p-3">
              <div className="font-medium">
                Chương {i + 1}: {c.title}
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {c.lessons.map((l) => (
                  <li key={l.id}>
                    {l.title} <span className="text-xs">({l.type === 'THEORY' ? 'LT' : 'TH'})</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
