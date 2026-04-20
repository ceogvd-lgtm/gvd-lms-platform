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
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
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

  // Phase 18 — bỏ handleSubmitForReview khỏi wizard edit. Flow mới:
  // 1) Soạn cấu trúc ở wizard → 2) click "Upload nội dung" → 3) upload
  // video/SCORM/quiz ở lesson editor → 4) bấm "Gửi duyệt" ở header
  // lesson editor khi bài đầy đủ. Tránh instructor gửi duyệt course
  // rỗng nội dung ngay từ wizard.

  // Phase 18 — huỷ gửi duyệt (PENDING_REVIEW → DRAFT) khi instructor
  // phát hiện lỗi trước khi admin review.
  const handleWithdrawSubmit = async () => {
    if (!courseId) return;
    if (
      !confirm(
        'Huỷ gửi duyệt?\n\n' +
          'Khoá học quay về trạng thái Nháp để tiếp tục chỉnh sửa cấu trúc. Khi xong, gửi duyệt lại.',
      )
    ) {
      return;
    }
    try {
      await coursesApi.updateStatus(courseId, 'WITHDRAW', accessToken!);
      toast.success('Đã huỷ gửi duyệt — khoá học về trạng thái Nháp');
      setStatus('DRAFT');
      // Refresh course data (status change affects everything downstream).
      await courseQuery.refetch();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Huỷ gửi duyệt thất bại';
      toast.error(msg);
    }
  };

  // ---------- Thumbnail upload ----------
  const handleThumbnailUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadApi.thumbnail(file, accessToken!);
      setThumbnailUrl(result.fileUrl);
      // Patch ngay không đợi auto-save — để thumbnail thấy trên UI.
      if (courseId) {
        await coursesApi.update(courseId, { thumbnailUrl: result.fileUrl } as never, accessToken!);
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

  // ---------- Rename / Delete handlers (Phase 18) ----------
  // Optimistic: patch local state trước, rollback nếu API fail. UX mượt
  // ngay cả trên mạng chậm; toast.error hiện rollback thông báo rõ.
  const handleRenameChapter = async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      toast.error('Tên chương không được để trống');
      return;
    }
    const prevState = chapters;
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    try {
      await chaptersApi.update(id, { title: trimmed }, accessToken!);
      toast.success('Đã cập nhật tên chương');
      setSavedAt(new Date());
    } catch (err) {
      setChapters(prevState); // rollback
      const msg = err instanceof ApiError ? err.message : 'Đổi tên thất bại';
      toast.error(msg);
    }
  };

  const handleDeleteChapter = async (chapter: DraftChapter) => {
    const lessonCount = chapter.lessons.length;
    const confirmMsg =
      `Xoá chương "${chapter.title}"?\n\n` +
      (lessonCount > 0 ? `Tất cả ${lessonCount} bài học trong chương này sẽ bị xoá theo.\n` : '') +
      'Không thể hoàn tác.';
    if (!confirm(confirmMsg)) return;

    const prevState = chapters;
    setChapters((prev) => prev.filter((c) => c.id !== chapter.id));
    try {
      await chaptersApi.remove(chapter.id, accessToken!);
      toast.success('Đã xoá chương');
      setSavedAt(new Date());
    } catch (err) {
      setChapters(prevState); // rollback
      const msg = err instanceof ApiError ? err.message : 'Xoá thất bại';
      toast.error(msg);
    }
  };

  const handleRenameLesson = async (chapterId: string, lessonId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      toast.error('Tên bài giảng không được để trống');
      return;
    }
    const prevState = chapters;
    setChapters((prev) =>
      prev.map((c) =>
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
      setSavedAt(new Date());
    } catch (err) {
      setChapters(prevState);
      const msg = err instanceof ApiError ? err.message : 'Đổi tên thất bại';
      toast.error(msg);
    }
  };

  // Phase 18 — chuyển lesson sang chapter khác cùng course.
  // UX: giảng viên tạo nhầm 2 chapter → chuyển hết bài sang 1 chapter rồi
  // xoá chapter rỗng. Chỉ hoạt động khi course DRAFT (BE enforce).
  const handleMoveLesson = async (
    fromChapterId: string,
    lesson: DraftLesson,
    toChapterId: string,
  ) => {
    if (fromChapterId === toChapterId) return;
    const targetChapter = chapters.find((c) => c.id === toChapterId);
    if (!targetChapter) return;
    if (
      !confirm(
        `Chuyển bài giảng "${lesson.title}" sang chương "${targetChapter.title}"?\n\n` +
          'Bài sẽ được đặt ở cuối chương đích.',
      )
    ) {
      return;
    }
    const prevState = chapters;
    // Optimistic: remove from source chapter, append to target
    setChapters((prev) =>
      prev.map((c) => {
        if (c.id === fromChapterId) {
          return { ...c, lessons: c.lessons.filter((l) => l.id !== lesson.id) };
        }
        if (c.id === toChapterId) {
          return { ...c, lessons: [...c.lessons, lesson] };
        }
        return c;
      }),
    );
    try {
      await lessonsApi.move(lesson.id, toChapterId, accessToken!);
      toast.success(`Đã chuyển "${lesson.title}" sang chương "${targetChapter.title}"`);
      setSavedAt(new Date());
    } catch (err) {
      setChapters(prevState); // rollback
      const msg = err instanceof ApiError ? err.message : 'Chuyển chương thất bại';
      toast.error(msg);
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
    const prevState = chapters;
    setChapters((prev) =>
      prev.map((c) =>
        c.id !== chapterId ? c : { ...c, lessons: c.lessons.filter((l) => l.id !== lesson.id) },
      ),
    );
    try {
      await lessonsApi.remove(lesson.id, accessToken!);
      toast.success('Đã xoá bài giảng');
      setSavedAt(new Date());
    } catch (err) {
      setChapters(prevState);
      const msg = err instanceof ApiError ? err.message : 'Xoá thất bại';
      toast.error(msg);
    }
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

  // Phase 18 — `isDraft` không còn dùng sau khi bỏ nút "Gửi duyệt Admin"
  // ở Step 3 (flow đúng: submit từ lesson editor sau khi upload xong).
  // Giữ `isPendingReview` cho nút "Huỷ gửi duyệt".
  const isPendingReview = status === 'PENDING_REVIEW';

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
              onRenameChapter={handleRenameChapter}
              onDeleteChapter={handleDeleteChapter}
              onRenameLesson={handleRenameLesson}
              onDeleteLesson={handleDeleteLesson}
              onMoveLesson={handleMoveLesson}
              canDelete={status === 'DRAFT'}
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
            {/* Phase 18 — BỎ nút "Gửi duyệt Admin" ở bước này vì course
                CHƯA có nội dung thật (video/SCORM/quiz/WebGL). Nếu gửi
                duyệt bây giờ admin sẽ review khung sườn rỗng → vô nghĩa.
                Thay bằng "Upload nội dung" làm primary action dẫn sang
                lesson editor; instructor sẽ bấm "Gửi duyệt" ở header
                lesson editor SAU KHI hoàn thiện nội dung.
                Huỷ gửi duyệt (PENDING_REVIEW → DRAFT) vẫn giữ ở đây
                vì user có thể đang xem tổng quan rồi quyết định rút. */}
            {isPendingReview && (
              <Button variant="outline" onClick={handleWithdrawSubmit}>
                <ChevronLeft className="h-4 w-4" />
                Huỷ gửi duyệt
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
  onRenameChapter,
  onDeleteChapter,
  onRenameLesson,
  onDeleteLesson,
  onMoveLesson,
  canDelete,
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
  /** Phase 18 — chuyển lesson sang chapter khác cùng course */
  onMoveLesson: (fromChapterId: string, lesson: DraftLesson, toChapterId: string) => Promise<void>;
  /** Phase 18 — chỉ cho phép xoá khi course còn DRAFT (BE cũng check). */
  canDelete: boolean;
  sensors: ReturnType<typeof useSensors>;
}) {
  const chapterIds = useMemo(() => chapters.map((c) => c.id), [chapters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Kéo-thả để sắp xếp lại thứ tự. Mỗi chương cần ít nhất 1 bài giảng.
          {canDelete ? (
            <span className="ml-1 text-xs italic">Hover vào chương/bài để sửa tên hoặc xoá.</span>
          ) : (
            <span className="ml-1 text-xs italic">
              Khoá học đã gửi duyệt — không xoá được (chỉ sửa tên).
            </span>
          )}
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
                  allChapters={chapters}
                  onAddLesson={() => onAddLesson(ch.id)}
                  onLessonDragEnd={(e) => onLessonDragEnd(ch.id, e)}
                  onRename={(newTitle) => onRenameChapter(ch.id, newTitle)}
                  onDelete={() => onDeleteChapter(ch)}
                  onRenameLesson={(lessonId, newTitle) => onRenameLesson(ch.id, lessonId, newTitle)}
                  onDeleteLesson={(lesson) => onDeleteLesson(ch.id, lesson)}
                  onMoveLesson={(lesson, toChapterId) => onMoveLesson(ch.id, lesson, toChapterId)}
                  canDelete={canDelete}
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
  canDelete,
  sensors,
}: {
  chapter: DraftChapter;
  index: number;
  /** Phase 18 — dropdown "Chuyển sang chương" cần list chapter khác cùng course */
  allChapters: DraftChapter[];
  onAddLesson: () => void;
  onLessonDragEnd: (e: DragEndEvent) => void;
  onRename: (newTitle: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRenameLesson: (lessonId: string, newTitle: string) => Promise<void>;
  onDeleteLesson: (lesson: DraftLesson) => Promise<void>;
  onMoveLesson: (lesson: DraftLesson, toChapterId: string) => Promise<void>;
  canDelete: boolean;
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

  // Phase 18 — inline-edit state. Cục bộ cho chapter này, không bị reset
  // khi parent re-render nhờ React preserve state theo key (chapter.id).
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
              // Phase 18 — auto-focus khi bật inline edit (jsx-a11y không cho
              // dùng autoFocus prop trực tiếp → dùng callback ref thay thế).
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
        {/* Phase 18 — action icons: edit + delete. Desktop hiện khi hover
            (nhóm group/group-hover); mobile hiện luôn (md:opacity-0) */}
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
                disabled={busy || !canDelete}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
                title={
                  canDelete ? 'Xoá chương' : 'Không xoá được — khoá học đã gửi duyệt / có học viên'
                }
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
                    canDelete={canDelete}
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
  canDelete,
}: {
  lesson: DraftLesson;
  index: number;
  currentChapterId: string;
  allChapters: DraftChapter[];
  onRename: (newTitle: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Phase 18 — chuyển lesson sang chapter khác cùng course */
  onMove: (toChapterId: string) => Promise<void>;
  canDelete: boolean;
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
      {/* Phase 18 — icons: desktop hiện khi hover, mobile hiện luôn */}
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
            {/* Phase 18 — chỉ hiện "Chuyển sang chương" khi có >1 chapter
                trong course + course DRAFT (canDelete). Dùng native select
                ẩn đằng sau icon button để không cần thêm dropdown lib. */}
            {canDelete && allChapters.length > 1 && (
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
                    if (target && target !== currentChapterId) {
                      void onMove(target);
                    }
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="Chuyển sang chương khác"
                  title="Chuyển sang chương khác"
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
              disabled={busy || !canDelete}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
              title={
                canDelete ? 'Xoá bài giảng' : 'Không xoá được — khoá học đã gửi duyệt / có học viên'
              }
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
      {/* Phase 18 — hướng dẫn flow đúng: upload nội dung rồi mới gửi duyệt */}
      <div className="rounded-card border border-primary/30 bg-primary/5 p-3 text-xs text-muted">
        <span className="font-semibold text-primary">Lưu ý:</span> Đây là bước xem trước{' '}
        <span className="font-semibold">khung sườn</span>. Bấm{' '}
        <span className="font-semibold">Upload nội dung</span> để vào lesson editor và upload video
        / SCORM / quiz / WebGL cho từng bài. Sau khi hoàn thiện, bấm{' '}
        <span className="font-semibold">Gửi duyệt</span> ở header lesson editor để admin review bài
        giảng đầy đủ.
      </div>

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
