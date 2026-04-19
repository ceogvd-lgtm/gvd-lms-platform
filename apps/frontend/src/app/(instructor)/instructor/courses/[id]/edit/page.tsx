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
import { Button, Card, CardContent, Skeleton } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Stepper } from '@/components/instructor/stepper';
import { ApiError, uploadApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { chaptersApi, coursesApi, lessonsApi, type LessonType } from '@/lib/curriculum';

/**
 * Phase 18 — Edit wizard 3 bước cho course đã tạo.
 *
 * Song song với `/instructor/courses/new` — cùng 3 bước, cùng DnD, cùng
 * auto-save, nhưng:
 *   - courseId có sẵn từ URL params → không cần "create on step 1 next"
 *   - Load existing data (course + chapters + lessons) khi mount
 *   - Step 1: subjectId hiển thị readonly (đổi môn sau khi tạo khoá có
 *     side effect FK cho chapters/enrollments đã có → phase sau nếu cần)
 *   - Step 3: thay "Lưu nháp / Gửi duyệt / Upload" bằng "Lưu thay đổi"
 *     cho edit (gửi duyệt vẫn được nếu course DRAFT)
 *
 * Sub-components Step1InfoEdit / Step2Structure / Step4Preview cố ý
 * duplicate khỏi /new để không đụng file cũ (giảm rủi ro regression).
 * Khi phase sau muốn DRY, có thể extract sang module riêng + pass
 * `mode="new"|"edit"` prop — nhưng giờ ưu tiên an toàn.
 */

const STEPS = ['Thông tin cơ bản', 'Cấu trúc bài học', 'Xem trước & lưu'];

const AUTO_SAVE_INTERVAL = 30_000;

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

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = params?.id;
  const accessToken = useAuthStore((s) => s.accessToken);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [subjectName, setSubjectName] = useState<string>('');
  const [status, setStatus] = useState<string>('DRAFT');
  const [chapters, setChapters] = useState<DraftChapter[]>([]);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // ---------- Load existing course data ----------
  const courseQuery = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.findOne(courseId!, accessToken!),
    enabled: !!courseId && !!accessToken,
  });

  useEffect(() => {
    if (!courseQuery.data || prefilled) return;
    const c = courseQuery.data;
    setTitle(c.title ?? '');
    setDescription(c.description ?? '');
    setThumbnailUrl(c.thumbnailUrl ?? '');
    setSubjectName(c.subject?.name ?? '');
    setStatus(c.status ?? 'DRAFT');
    // course.chapters đi kèm với lessons (backend courses.service.findOne
    // include chapter + lesson tree nested) — map trực tiếp sang DraftChapter.
    const mappedChapters: DraftChapter[] = (c.chapters ?? []).map((ch) => ({
      id: ch.id,
      title: ch.title,
      lessons: (ch.lessons ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type as LessonType,
      })),
    }));
    setChapters(mappedChapters);
    setPrefilled(true);
  }, [courseQuery.data, prefilled]);

  // ---------- Auto-save Step 1 fields ----------
  const dirtyRef = useRef(false);
  useEffect(() => {
    // Chỉ đánh dấu dirty sau khi prefill xong — tránh auto-save trigger
    // trên giá trị rỗng lúc mount.
    if (prefilled) dirtyRef.current = true;
  }, [title, description, thumbnailUrl, prefilled]);

  useEffect(() => {
    if (!courseId || !prefilled) return;
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
          },
          accessToken!,
        );
        setSavedAt(new Date());
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[auto-save]', err);
      } finally {
        setAutoSaving(false);
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [courseId, accessToken, title, description, prefilled]);

  // ---------- Step validation ----------
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      const trimmed = title.trim();
      if (trimmed.length < 3) return 'Tên khoá học cần ít nhất 3 ký tự';
      if (trimmed.length > 200) return 'Tên khoá học tối đa 200 ký tự';
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
    if (step === 0 && courseId) {
      // Force-save ngay khi Next, không đợi auto-save interval.
      try {
        await coursesApi.update(
          courseId,
          {
            title: title.trim(),
            description: description.trim() || undefined,
          },
          accessToken!,
        );
        dirtyRef.current = false;
        setSavedAt(new Date());
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Lưu thông tin thất bại';
        toast.error(msg);
        return;
      }
    }
    if (step === 1 && courseId) {
      // Commit reorder — tiếp cận giống wizard new.
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

  // ---------- Final actions ----------
  const handleSaveChanges = () => {
    toast.success('Đã lưu thay đổi');
    router.push('/instructor/courses');
  };

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

  // ---------- Thumbnail upload ----------
  const handleThumbnailUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadApi.thumbnail(file, accessToken!);
      setThumbnailUrl(result.url);
      // Patch ngay không đợi auto-save — để thumbnail thấy trên UI.
      if (courseId) {
        await coursesApi.update(courseId, { thumbnailUrl: result.url } as never, accessToken!);
        setSavedAt(new Date());
      }
      toast.success('Đã upload thumbnail');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Upload thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  // ---------- Chapter + lesson ops ----------
  const addChapter = async () => {
    if (!courseId) return;
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

  // ---------- Render ----------
  if (!courseId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">ID khoá không hợp lệ</p>
        <Button asChild variant="outline">
          <Link href="/instructor/courses">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>
    );
  }

  if (courseQuery.isLoading || !prefilled) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (courseQuery.isError || !courseQuery.data) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted">
              Không tìm thấy khoá học hoặc bạn không có quyền chỉnh sửa.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/instructor/courses">
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = status === 'DRAFT';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chỉnh sửa khoá học</h1>
          <p className="mt-1 text-sm text-muted">
            Wizard 3 bước. Auto-save mỗi 30 giây trên bước 1.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {autoSaving
              ? 'Đang lưu…'
              : savedAt
                ? `Đã lưu lúc ${savedAt.toLocaleTimeString('vi-VN')}`
                : 'Chưa có thay đổi'}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/instructor/courses">
              <ArrowLeft className="h-4 w-4" />
              Danh sách
            </Link>
          </Button>
        </div>
      </header>

      <Stepper steps={STEPS} current={step} />

      <Card>
        <CardContent className="p-6">
          {step === 0 && (
            <Step1InfoEdit
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              thumbnailUrl={thumbnailUrl}
              uploading={uploading}
              onUpload={handleThumbnailUpload}
              subjectName={subjectName}
              status={status}
            />
          )}

          {step === 1 && (
            <Step2Structure
              chapters={chapters}
              onAddChapter={addChapter}
              onAddLesson={addLesson}
              onChapterDragEnd={handleChapterDragEnd}
              onLessonDragEnd={handleLessonDragEnd}
              sensors={sensors}
            />
          )}

          {step === 2 && (
            <Step3Preview
              title={title}
              description={description}
              thumbnailUrl={thumbnailUrl}
              chapters={chapters}
              subjectName={subjectName}
              status={status}
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleSaveChanges}>
              <Save className="h-4 w-4" />
              Lưu thay đổi
            </Button>
            {isDraft && (
              <Button variant="outline" onClick={handleSubmitForReview}>
                <Send className="h-4 w-4" />
                Gửi duyệt Admin
              </Button>
            )}
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
// Step 1 — info form (readonly subject)
// =====================================================
function Step1InfoEdit({
  title,
  setTitle,
  description,
  setDescription,
  thumbnailUrl,
  uploading,
  onUpload,
  subjectName,
  status,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  thumbnailUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  subjectName: string;
  status: string;
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
        <p className="mt-1 text-xs text-muted">3–200 ký tự. {title.trim().length}/200</p>
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
          maxLength={2000}
          placeholder="Mô tả nội dung khoá học, đối tượng học viên…"
          className="w-full rounded-button border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-muted">Tối đa 2000 ký tự. {description.length}/2000</p>
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

      {/* Readonly meta — Subject + Status không sửa được trong wizard edit */}
      <div className="grid grid-cols-1 gap-3 rounded-card border border-dashed border-border bg-surface-2/40 p-4 text-xs sm:grid-cols-2">
        <div>
          <div className="font-semibold uppercase tracking-wider text-muted">Môn học</div>
          <div className="mt-0.5 text-sm text-foreground">{subjectName || '—'}</div>
          <div className="mt-1 text-[11px] text-muted">
            Không thể đổi môn sau khi tạo khoá (ảnh hưởng liên kết chương/bài).
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wider text-muted">Trạng thái</div>
          <div className="mt-0.5 text-sm text-foreground">{status}</div>
          <div className="mt-1 text-[11px] text-muted">
            Đổi trạng thái qua nút Gửi duyệt / Lưu trữ ở danh sách khoá học.
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Step 2 — drag-drop chapters + lessons (duplicate từ new page để độc lập)
// =====================================================
function Step2Structure({
  chapters,
  onAddChapter,
  onAddLesson,
  onChapterDragEnd,
  onLessonDragEnd,
  sensors,
}: {
  chapters: DraftChapter[];
  onAddChapter: () => void;
  onAddLesson: (chapterId: string) => void;
  onChapterDragEnd: (e: DragEndEvent) => void;
  onLessonDragEnd: (chapterId: string, e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  const chapterIds = useMemo(() => chapters.map((c) => c.id), [chapters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Kéo-thả để sắp xếp lại thứ tự. Mỗi chương cần ít nhất 1 bài giảng.
        </p>
        <Button variant="outline" onClick={onAddChapter}>
          <Plus className="h-4 w-4" />
          Thêm chương
        </Button>
      </div>

      {chapters.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-12 text-center">
          <p className="text-sm text-muted">
            Chưa có chương nào. Bấm nút <span className="font-semibold">Thêm chương</span> để bắt
            đầu.
          </p>
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
                  onAddLesson={() => onAddLesson(ch.id)}
                  onLessonDragEnd={(e) => onLessonDragEnd(ch.id, e)}
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
  onAddLesson,
  onLessonDragEnd,
  sensors,
}: {
  chapter: DraftChapter;
  index: number;
  onAddLesson: () => void;
  onLessonDragEnd: (e: DragEndEvent) => void;
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

  return (
    <div ref={setNodeRef} style={style} className="rounded-card border border-border bg-surface">
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
        <h4 className="flex-1 text-sm font-semibold">{chapter.title}</h4>
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
                  <SortableLesson key={l.id} lesson={l} index={lidx} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableLesson({ lesson, index }: { lesson: DraftLesson; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center gap-2 rounded border border-transparent px-2 py-1.5 hover:border-border hover:bg-surface-2/40"
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
      <span className="flex-1 text-sm">{lesson.title}</span>
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
// Step 3 — preview with status + subject shown
// =====================================================
function Step3Preview({
  title,
  description,
  thumbnailUrl,
  chapters,
  subjectName,
  status,
}: {
  title: string;
  description: string;
  thumbnailUrl: string;
  chapters: DraftChapter[];
  subjectName: string;
  status: string;
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
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span>
                <span className="font-semibold uppercase tracking-wider">Môn:</span>{' '}
                {subjectName || '—'}
              </span>
              <span>·</span>
              <span>
                <span className="font-semibold uppercase tracking-wider">Trạng thái:</span> {status}
              </span>
              <span>·</span>
              <span>{chapters.length} chương</span>
              <span>·</span>
              <span>{totalLessons} bài giảng</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Cấu trúc bài học</h4>
        {chapters.length === 0 ? (
          <p className="text-sm italic text-muted">Chưa có chương nào.</p>
        ) : (
          <ol className="space-y-2">
            {chapters.map((c, i) => (
              <li key={c.id} className="rounded-card border border-border bg-surface p-3">
                <div className="font-medium">
                  Chương {i + 1}: {c.title}
                </div>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                  {c.lessons.map((l) => (
                    <li key={l.id}>
                      {l.title}{' '}
                      <span className="text-xs">({l.type === 'THEORY' ? 'LT' : 'TH'})</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
