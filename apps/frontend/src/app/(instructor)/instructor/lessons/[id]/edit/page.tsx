'use client';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Archive, Eye, FileQuestion, History, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AttachmentsManager } from '@/components/instructor/attachments-manager';
import { ContentUploader } from '@/components/instructor/content-uploader';
import { LessonTreeSidebar } from '@/components/instructor/lesson-tree-sidebar';
import { PracticeContentEditor } from '@/components/instructor/practice-content-editor';
import { RichTextEditor, type JSONContent } from '@/components/instructor/rich-text-editor';
import { ApiError, theoryContentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { chaptersApi, lessonsApi } from '@/lib/curriculum';

const AUTO_SAVE_INTERVAL = 30_000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PageProps {
  params: { id: string };
}

/**
 * Lesson editor (Phase 10).
 *
 * Layout:
 *   ┌─ left: lesson tree (chapter → lesson links)
 *   └─ right: tabs Lý thuyết / Thực hành / Lịch sử
 *
 * Auto-save: every 30 seconds the dirty Theory body is patched via
 * `PATCH /lessons/:id/theory/body`. Practice tab uses explicit Save
 * (form-style) since the WebGL settings rarely change.
 *
 * Per CLAUDE.md INSTRUCTOR rule: NO delete button anywhere on this page.
 */
export default function LessonEditorPage({ params }: PageProps) {
  const { id: lessonId } = params;
  const accessToken = useAuthStore((s) => s.accessToken);

  // Lesson navigation context — we use this to discover the parent
  // course so the sidebar tree can render. `/lessons/:id/context`
  // returns { lesson, chapter, course, prev, next } in a single round-trip.
  const contextQuery = useQuery({
    queryKey: ['lesson-context', lessonId],
    queryFn: () => lessonsApi.getContext(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  // ---- Theory state ----
  const theoryQuery = useQuery({
    queryKey: ['theory', lessonId],
    queryFn: () => theoryContentsApi.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const [theoryBody, setTheoryBody] = useState<JSONContent | null>(null);
  const [theoryStatus, setTheoryStatus] = useState<SaveStatus>('idle');
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (theoryQuery.data) {
      setTheoryBody((theoryQuery.data.body as JSONContent | null) ?? null);
      dirtyRef.current = false;
    }
  }, [theoryQuery.data]);

  // Auto-save loop
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(async () => {
      if (!dirtyRef.current || !theoryBody) return;
      dirtyRef.current = false;
      setTheoryStatus('saving');
      try {
        await theoryContentsApi.saveBody(lessonId, theoryBody, accessToken);
        setTheoryStatus('saved');
      } catch (err) {
        setTheoryStatus('error');
        // eslint-disable-next-line no-console
        console.warn('[auto-save theory]', err);
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [accessToken, lessonId, theoryBody]);

  const handleTheoryChange = (content: JSONContent) => {
    setTheoryBody(content);
    dirtyRef.current = true;
    setTheoryStatus('idle');
  };

  const handleManualSaveTheory = async () => {
    if (!theoryBody) return;
    setTheoryStatus('saving');
    try {
      await theoryContentsApi.saveBody(lessonId, theoryBody, accessToken!);
      setTheoryStatus('saved');
      dirtyRef.current = false;
      toast.success('Đã lưu lý thuyết');
    } catch (err) {
      setTheoryStatus('error');
      const msg = err instanceof ApiError ? err.message : 'Lưu thất bại';
      toast.error(msg);
    }
  };

  // Phase-13 note: the Practice tab is now self-contained (see
  // PracticeContentEditor). It owns its own useQuery + mutation — this
  // page no longer tracks practice form state.

  // ---- Lesson archive (soft archive via isPublished=false) ----
  const handleArchive = async () => {
    if (
      !confirm('Lưu trữ bài giảng này? Học viên sẽ không thấy nữa, nhưng dữ liệu vẫn được giữ.')
    ) {
      return;
    }
    try {
      await lessonsApi.update(lessonId, { isPublished: false }, accessToken!);
      toast.success('Đã lưu trữ bài giảng');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lưu trữ thất bại';
      toast.error(msg);
    }
  };

  // ---- Sidebar tree: load all chapters of the parent course ----
  const courseId = contextQuery.data?.course.id;
  const tree = useQuery({
    queryKey: ['lesson-tree', courseId],
    queryFn: () => chaptersApi.listByCourse(courseId!, accessToken!),
    enabled: !!courseId && !!accessToken,
  });

  return (
    <div className="-m-4 flex h-[calc(100vh-64px)] sm:-m-6 lg:-m-8">
      {/* Sidebar tree */}
      {tree.data && tree.data.length > 0 ? (
        <LessonTreeSidebar chapters={tree.data} currentLessonId={lessonId} />
      ) : (
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-2/30 p-3 lg:block">
          <p className="px-2 text-xs italic text-muted">
            {contextQuery.isLoading ? 'Đang tải cây bài học…' : 'Khoá học chưa có bài nào khác.'}
          </p>
        </aside>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Soạn bài giảng</h1>
            <p className="text-xs text-muted">ID: {lessonId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href={`/instructor/lessons/${lessonId}/quiz`}>
                <FileQuestion className="h-4 w-4" />
                Quiz
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href={`/instructor/courses`}>
                <Eye className="h-4 w-4" />
                Xem trước
              </Link>
            </Button>
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="h-4 w-4" />
              Lưu trữ
            </Button>
            {/* No Delete button — instructor cannot delete lessons (Phase 04 rule) */}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background px-6 py-4">
          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">Nội dung chính</TabsTrigger>
              <TabsTrigger value="theory">Lý thuyết</TabsTrigger>
              <TabsTrigger value="attachments">Tài liệu</TabsTrigger>
              <TabsTrigger value="practice">Thực hành ảo</TabsTrigger>
              <TabsTrigger value="history">Lịch sử (10)</TabsTrigger>
            </TabsList>

            {/* CONTENT — Phase 12 upload SCORM/xAPI/PPT/VIDEO */}
            <TabsContent value="content">
              <ContentUploader lessonId={lessonId} />
            </TabsContent>

            {/* ATTACHMENTS — Phase 12 PDF attachments */}
            <TabsContent value="attachments">
              <AttachmentsManager lessonId={lessonId} />
            </TabsContent>

            {/* THEORY */}
            <TabsContent value="theory">
              <div className="space-y-4">
                {theoryQuery.isLoading ? (
                  <div className="h-80 animate-pulse rounded-card bg-surface-2" />
                ) : (
                  <RichTextEditor
                    initialContent={theoryBody}
                    onChange={handleTheoryChange}
                    placeholder="Nhập nội dung lý thuyết… (auto-save mỗi 30 giây)"
                    minHeight={500}
                  />
                )}
              </div>
            </TabsContent>

            {/* PRACTICE — Phase 13 new editor replaces the Phase 10 stub */}
            <TabsContent value="practice">
              <PracticeContentEditor lessonId={lessonId} />
            </TabsContent>

            {/* HISTORY (stub) */}
            <TabsContent value="history">
              <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center">
                <History className="mx-auto h-12 w-12 text-muted" />
                <p className="mt-3 text-sm font-semibold text-foreground">Lịch sử phiên bản</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  Phase 11 sẽ thêm cơ chế snapshot 10 phiên bản gần nhất + restore. Hiện tại
                  auto-save chỉ ghi đè bản hiện hành.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Floating save status */}
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-button border border-border bg-surface px-4 py-2 shadow-lg">
          {theoryStatus === 'saving' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs font-semibold text-primary">Đang lưu…</span>
            </>
          )}
          {theoryStatus === 'saved' && (
            <>
              <Save className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Đã lưu
              </span>
            </>
          )}
          {theoryStatus === 'error' && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              Lưu thất bại — bấm để thử lại
            </span>
          )}
          {theoryStatus === 'idle' && <span className="text-xs text-muted">Chưa thay đổi</span>}
          <Button size="sm" variant="ghost" onClick={handleManualSaveTheory}>
            Lưu ngay
          </Button>
        </div>
      </div>
    </div>
  );
}
