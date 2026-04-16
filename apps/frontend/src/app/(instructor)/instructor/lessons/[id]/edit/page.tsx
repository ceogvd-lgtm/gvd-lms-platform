'use client';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@lms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Eye, FileQuestion, History, Loader2, Save, Upload } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { LessonTreeSidebar } from '@/components/instructor/lesson-tree-sidebar';
import { RichTextEditor, type JSONContent } from '@/components/instructor/rich-text-editor';
import { ApiError, practiceContentsApi, theoryContentsApi, uploadApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { chaptersApi, lessonsApi } from '@/lib/curriculum';

const AUTO_SAVE_INTERVAL = 30_000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PageProps {
  params: Promise<{ id: string }>;
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
  const { id: lessonId } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  // Lesson + parent chapter (so we can render the tree on the left).
  const lesson = useQuery({
    queryKey: ['lesson-edit-meta', lessonId],
    queryFn: async () => {
      // We don't have a public GET /lessons/:id, so derive courseId via
      // the theory-content GET (which loads through assertOwnership and
      // returns null if no theory exists yet — fine, we just need the
      // ownership check to pass).
      // Cheap workaround: ask chapters API to list, then filter.
      // For Phase 10 this is acceptable; a dedicated endpoint can come later.
      throw new Error('placeholder — see below');
    },
    enabled: false, // we do it manually below
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

  // ---- Practice state ----
  const practiceQuery = useQuery({
    queryKey: ['practice', lessonId],
    queryFn: () => practiceContentsApi.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const [practiceForm, setPracticeForm] = useState<{
    introduction: string;
    webglUrl: string;
    passScore: number;
    timeLimit: number;
    maxAttempts: number;
  }>({ introduction: '', webglUrl: '', passScore: 70, timeLimit: 600, maxAttempts: 3 });
  const [savingPractice, setSavingPractice] = useState(false);
  const [uploadingWebgl, setUploadingWebgl] = useState(false);

  useEffect(() => {
    if (practiceQuery.data) {
      const p = practiceQuery.data;
      setPracticeForm({
        introduction: p.introduction,
        webglUrl: p.webglUrl,
        passScore: p.passScore,
        timeLimit: p.timeLimit ?? 600,
        maxAttempts: p.maxAttempts ?? 3,
      });
    }
  }, [practiceQuery.data]);

  const handlePracticeSave = async () => {
    setSavingPractice(true);
    try {
      await practiceContentsApi.upsert(
        lessonId,
        {
          introduction: practiceForm.introduction,
          objectives: [],
          webglUrl: practiceForm.webglUrl,
          scoringConfig: {},
          safetyChecklist: {},
          passScore: practiceForm.passScore,
          timeLimit: practiceForm.timeLimit,
          maxAttempts: practiceForm.maxAttempts,
        },
        accessToken!,
      );
      toast.success('Đã lưu nội dung thực hành');
      qc.invalidateQueries({ queryKey: ['practice', lessonId] });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lưu thất bại';
      toast.error(msg);
    } finally {
      setSavingPractice(false);
    }
  };

  const handleWebglUpload = async (file: File) => {
    setUploadingWebgl(true);
    try {
      const result = await uploadApi.content(file, 'WEBGL', lessonId, accessToken!);
      setPracticeForm((p) => ({ ...p, webglUrl: result.url }));
      toast.success('Đã upload bundle WebGL');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Upload thất bại';
      toast.error(msg);
    } finally {
      setUploadingWebgl(false);
    }
  };

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
  // We piggy-back on theoryQuery (loaded above) to discover course context.
  // For Phase 10, if the API doesn't expose it directly we render an
  // empty placeholder — the editor still works.
  // (The cleanest fix: add a `GET /lessons/:id` endpoint with course/chapter info.)
  const courseId = (theoryQuery.data as unknown as { courseId?: string } | null)?.courseId;
  const tree = useQuery({
    queryKey: ['lesson-tree', courseId],
    queryFn: () => chaptersApi.listByCourse(courseId!, accessToken!),
    enabled: !!courseId && !!accessToken,
  });
  void lesson; // silence unused-var lint — kept for future hook expansion

  return (
    <div className="-m-4 flex h-[calc(100vh-64px)] sm:-m-6 lg:-m-8">
      {/* Sidebar tree */}
      {tree.data && tree.data.length > 0 ? (
        <LessonTreeSidebar chapters={tree.data} currentLessonId={lessonId} />
      ) : (
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-2/30 p-3 lg:block">
          <p className="px-2 text-xs italic text-muted">
            Cây bài học sẽ xuất hiện sau khi lesson có ngữ cảnh course.
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
          <Tabs defaultValue="theory">
            <TabsList>
              <TabsTrigger value="theory">Lý thuyết</TabsTrigger>
              <TabsTrigger value="practice">Thực hành ảo</TabsTrigger>
              <TabsTrigger value="history">Lịch sử (10)</TabsTrigger>
            </TabsList>

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

            {/* PRACTICE */}
            <TabsContent value="practice">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="practice-intro">
                    Giới thiệu
                  </label>
                  <textarea
                    id="practice-intro"
                    rows={3}
                    value={practiceForm.introduction}
                    onChange={(e) =>
                      setPracticeForm((p) => ({ ...p, introduction: e.target.value }))
                    }
                    className="w-full rounded-button border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="webgl-upload" className="mb-1.5 block text-sm font-medium">
                    File WebGL (Unity bundle)
                  </label>
                  <div className="flex items-center gap-3">
                    {practiceForm.webglUrl && (
                      <code className="rounded bg-surface-2 px-2 py-1 text-xs">
                        {practiceForm.webglUrl.split('/').pop() ?? practiceForm.webglUrl}
                      </code>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-button border border-dashed border-border px-3 py-2 text-sm hover:border-primary">
                      <Upload className="h-4 w-4" />
                      {uploadingWebgl
                        ? 'Đang upload…'
                        : practiceForm.webglUrl
                          ? 'Đổi file'
                          : 'Chọn file'}
                      <input
                        id="webgl-upload"
                        type="file"
                        className="hidden"
                        accept=".unityweb,.zip"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleWebglUpload(f);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="passScore" className="mb-1.5 block text-sm font-medium">
                      Điểm đạt (%)
                    </label>
                    <input
                      id="passScore"
                      type="number"
                      min={0}
                      max={100}
                      value={practiceForm.passScore}
                      onChange={(e) =>
                        setPracticeForm((p) => ({ ...p, passScore: Number(e.target.value) }))
                      }
                      className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="timeLimit" className="mb-1.5 block text-sm font-medium">
                      Thời gian (giây)
                    </label>
                    <input
                      id="timeLimit"
                      type="number"
                      min={0}
                      value={practiceForm.timeLimit}
                      onChange={(e) =>
                        setPracticeForm((p) => ({ ...p, timeLimit: Number(e.target.value) }))
                      }
                      className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="maxAttempts" className="mb-1.5 block text-sm font-medium">
                      Số lần thử tối đa
                    </label>
                    <input
                      id="maxAttempts"
                      type="number"
                      min={1}
                      value={practiceForm.maxAttempts}
                      onChange={(e) =>
                        setPracticeForm((p) => ({ ...p, maxAttempts: Number(e.target.value) }))
                      }
                      className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handlePracticeSave} disabled={savingPractice}>
                    <Save className="h-4 w-4" />
                    {savingPractice ? 'Đang lưu…' : 'Lưu nội dung thực hành'}
                  </Button>
                </div>
              </div>
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
