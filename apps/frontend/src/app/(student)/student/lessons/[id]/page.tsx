'use client';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileText, Menu } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { LessonOutline } from '@/components/student/lesson-outline';
import { NotesTab } from '@/components/student/notes-tab';
import { PdfViewer } from '@/components/student/pdf-viewer';
import { PptPlayer } from '@/components/student/ppt-player';
import { ScormPlayer } from '@/components/student/scorm-player';
import { StudentQuiz } from '@/components/student/student-quiz';
import { VideoPlayer } from '@/components/student/video-player';
import { ApiError, theoryContentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { chaptersApi } from '@/lib/curriculum';
import {
  attachmentsApi,
  lessonEngineApi,
  scormApi,
  theoryEngineApi,
  type LessonAttachment,
  type ScormManifestResponse,
  type SlideDeck,
} from '@/lib/theory-engine';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Student lesson page (Phase 12).
 *
 * Layout:
 *   Header sticky: title + progress %
 *   Sidebar 240px  — chapter/lesson outline (collapsible on mobile)
 *   Content        — Tabs [Lý thuyết] [Tài liệu] [Ghi chú]
 *   Bottom nav     — [← Bài trước] [Bài tiếp theo →]
 *
 * "Lý thuyết" dispatches by TheoryContent.contentType:
 *   VIDEO       → VideoPlayer with resume + keyboard shortcuts
 *   SCORM/XAPI  → ScormPlayer (iframe + scorm-again bridge)
 *   POWERPOINT  → PptPlayer (slide deck)
 *   PDF / other → link-only (student downloads directly)
 *
 * The page kicks a lightweight confetti render on the first COMPLETED
 * transition — `showConfetti` is true only for ~3 s.
 */
export default function StudentLessonPage({ params }: PageProps) {
  const { id: lessonId } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contentDone, setContentDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);

  // =====================================================
  // Data: theory content + course outline + progress
  // =====================================================
  const theoryQuery = useQuery({
    queryKey: ['student-theory', lessonId],
    queryFn: () => theoryContentsApi.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const progressQuery = useQuery({
    queryKey: ['lesson-progress', lessonId],
    queryFn: () => lessonEngineApi.progress(lessonId, accessToken!),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  });

  const attachmentsQuery = useQuery({
    queryKey: ['lesson-attachments', lessonId],
    queryFn: () => attachmentsApi.list(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  // SCORM manifest (only fetched when needed)
  const scormQuery = useQuery<ScormManifestResponse>({
    queryKey: ['scorm-manifest', lessonId],
    queryFn: () => scormApi.manifest(lessonId, accessToken!),
    enabled:
      !!accessToken &&
      (theoryQuery.data?.contentType === 'SCORM' || theoryQuery.data?.contentType === 'XAPI'),
  });

  // PPT deck (only fetched when needed)
  const deckQuery = useQuery<SlideDeck | null>({
    queryKey: ['ppt-deck', lessonId],
    queryFn: () => theoryEngineApi.getSlides(lessonId, accessToken!),
    enabled: !!accessToken && theoryQuery.data?.contentType === 'POWERPOINT',
  });

  // Course chapters — we piggy-back on the existing chaptersApi, but we
  // need the courseId. We derive it from `lesson.chapter.course` via the
  // progress call (the student endpoint returns enough context) or skip
  // the sidebar when unknown.
  const courseId = (progressQuery.data?.progress as { lessonId?: string } | null | undefined)
    ? undefined // placeholder — courseId isn't in the progress payload
    : undefined;
  const tree = useQuery({
    queryKey: ['student-outline', courseId],
    queryFn: () => chaptersApi.listByCourse(courseId!, accessToken!),
    enabled: false, // we leave outline empty for now; Phase 13 adds a proper endpoint
  });

  // =====================================================
  // Completion tracking — the individual players each call `onComplete`
  // when their own completion criterion fires. We flip `contentDone`,
  // then the student has to pass the quiz (if any) before the lesson
  // itself is marked COMPLETED.
  // =====================================================
  useEffect(() => {
    if (progressQuery.data?.progress?.status === 'COMPLETED') {
      setContentDone(true);
    }
  }, [progressQuery.data]);

  async function markLessonComplete() {
    if (!accessToken) return;
    try {
      await lessonEngineApi.complete(lessonId, accessToken);
      toast.success('Chúc mừng, bạn đã hoàn thành bài học!');
      if (!confettiFiredRef.current) {
        confettiFiredRef.current = true;
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 3000);
      }
      progressQuery.refetch();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        // BadRequest from backend — quiz not passed or content not done.
        // Don't toast — the user will see the quiz section unlocked.
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Không đánh dấu được');
      }
    }
  }

  // Progress percentage shown in header
  const progressPct = useMemo(() => {
    const status = progressQuery.data?.progress?.status;
    if (status === 'COMPLETED') return 100;
    if (status === 'IN_PROGRESS') {
      const v = progressQuery.data?.videoProgress;
      if (v?.duration) return Math.min(99, Math.round((v.watchedSeconds / v.duration) * 100));
      return 30;
    }
    return 0;
  }, [progressQuery.data]);

  const theory = theoryQuery.data;

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Sidebar — desktop */}
      <div className="hidden w-60 shrink-0 lg:block">
        {tree.data && tree.data.length > 0 ? (
          <LessonOutline chapters={tree.data} currentLessonId={lessonId} />
        ) : (
          <div className="h-full border-r border-border bg-surface-2/40 p-3 text-xs text-muted">
            Outline khoá học sẽ xuất hiện khi có ngữ cảnh course (Phase 13).
          </div>
        )}
      </div>

      {/* Sidebar — mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Đóng mục lục"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-background">
            {tree.data && tree.data.length > 0 ? (
              <LessonOutline chapters={tree.data} currentLessonId={lessonId} />
            ) : (
              <p className="p-4 text-xs text-muted">Outline sẽ xuất hiện khi có ngữ cảnh course.</p>
            )}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-button border border-border lg:hidden"
            aria-label="Mục lục"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {theoryQuery.isLoading ? 'Đang tải…' : theory?.overview?.slice(0, 80) || 'Bài học'}
            </h1>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  'h-full transition-all',
                  progressPct >= 100 ? 'bg-emerald-500' : 'bg-primary',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <span className="hidden text-xs text-muted md:block">{progressPct}%</span>
        </header>

        <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6 md:px-6">
          {/* Content tabs */}
          <Tabs defaultValue="theory">
            <TabsList>
              <TabsTrigger value="theory">Lý thuyết</TabsTrigger>
              <TabsTrigger value="attachments">
                Tài liệu{' '}
                {attachmentsQuery.data && attachmentsQuery.data.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                    {attachmentsQuery.data.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="notes">Ghi chú</TabsTrigger>
            </TabsList>

            {/* ----- Lý thuyết ----- */}
            <TabsContent value="theory">
              {theoryQuery.isLoading ? (
                <div className="h-80 animate-pulse rounded-card bg-surface-2" />
              ) : !theory?.contentUrl ? (
                <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center text-sm text-muted">
                  Bài giảng này chưa có nội dung chính.
                </div>
              ) : theory.contentType === 'VIDEO' ? (
                <VideoPlayer
                  lessonId={lessonId}
                  src={theory.contentUrl}
                  onComplete={() => setContentDone(true)}
                />
              ) : theory.contentType === 'SCORM' || theory.contentType === 'XAPI' ? (
                scormQuery.data ? (
                  <ScormPlayer
                    lessonId={lessonId}
                    manifest={scormQuery.data}
                    onComplete={() => setContentDone(true)}
                  />
                ) : (
                  <div className="h-80 animate-pulse rounded-card bg-surface-2" />
                )
              ) : theory.contentType === 'POWERPOINT' ? (
                deckQuery.data ? (
                  <PptPlayer
                    deck={deckQuery.data}
                    onReachedEnd={async () => {
                      setContentDone(true);
                      // Force the LessonProgress row to IN_PROGRESS so the
                      // sidebar reflects the state — the quiz gate below
                      // still has to pass before COMPLETED fires.
                      await markLessonComplete().catch(() => undefined);
                    }}
                  />
                ) : (
                  <div className="h-80 animate-pulse rounded-card bg-surface-2" />
                )
              ) : (
                <div className="rounded-card border border-border bg-surface p-6 text-sm">
                  <p className="mb-3 font-semibold">Loại nội dung: {theory.contentType}</p>
                  <a
                    href={theory.contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    Mở nội dung
                  </a>
                </div>
              )}

              {/* Quiz integration — appears once content is done */}
              <div className="mt-8">
                <StudentQuiz
                  lessonId={lessonId}
                  locked={!contentDone}
                  onPassed={markLessonComplete}
                />
              </div>

              {/* Manual "Complete" button for content types without a
                  natural "ended" signal (e.g. PDF or unknown) */}
              {contentDone && progressQuery.data?.progress?.status !== 'COMPLETED' && (
                <div className="mt-6 flex justify-end">
                  <Button onClick={markLessonComplete}>Đánh dấu hoàn thành bài học</Button>
                </div>
              )}
            </TabsContent>

            {/* ----- Tài liệu ----- */}
            <TabsContent value="attachments">
              <AttachmentsTab
                items={attachmentsQuery.data ?? []}
                loading={attachmentsQuery.isLoading}
              />
            </TabsContent>

            {/* ----- Ghi chú ----- */}
            <TabsContent value="notes">
              {user ? (
                <NotesTab lessonId={lessonId} studentId={user.id} />
              ) : (
                <div className="py-8 text-center text-sm text-muted">Đăng nhập để ghi chú.</div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Bottom nav (stub — real siblings wired in Phase 13 when the
            course context endpoint lands) */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border bg-surface/80 px-4 py-3 backdrop-blur">
          <Button variant="ghost" disabled>
            <ArrowLeft className="h-4 w-4" />
            Bài trước
          </Button>
          <Link href="/student/dashboard" className="text-xs text-muted hover:text-primary">
            Về trang chủ
          </Link>
          <Button variant="ghost" disabled>
            Bài tiếp theo
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Confetti — inline SVG burst on first completion */}
      {showConfetti && <ConfettiBurst />}
    </div>
  );
}

function AttachmentsTab({ items, loading }: { items: LessonAttachment[]; loading: boolean }) {
  const [open, setOpen] = useState<LessonAttachment | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-button bg-surface-2" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-12 text-center text-sm text-muted">
        Giảng viên chưa đính kèm tài liệu nào cho bài học này.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 text-sm"
          >
            <FileText className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.fileName}</p>
              <p className="text-xs text-muted">{(a.fileSize / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(a)}>
              Xem
            </Button>
            <a
              href={a.fileUrl}
              download={a.fileName}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-button border border-border px-2.5 text-xs font-semibold hover:border-primary hover:text-primary"
            >
              Tải về
            </a>
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-4 rounded-card border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">{open.fileName}</h3>
            <Button variant="outline" size="sm" onClick={() => setOpen(null)}>
              Đóng
            </Button>
          </div>
          <PdfViewer url={open.fileUrl} fileName={open.fileName} />
        </div>
      )}
    </div>
  );
}

/**
 * Tiny CSS-only confetti burst — renders 30 spans with randomised
 * positions and animations so we don't ship a dependency for a 3-second
 * effect. Cleans up automatically when the parent sets showConfetti=false.
 */
function ConfettiBurst() {
  const pieces = Array.from({ length: 30 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.5 + Math.random();
        const hue = Math.floor(Math.random() * 360);
        return (
          <span
            key={i}
            className="absolute top-[-5%] block h-2 w-2 rounded-sm"
            style={{
              left: `${left}%`,
              background: `hsl(${hue}, 80%, 55%)`,
              animation: `confetti-fall ${duration}s ${delay}s ease-out forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <ChevronLeft className="hidden" />
      <ChevronRight className="hidden" />
    </div>
  );
}
