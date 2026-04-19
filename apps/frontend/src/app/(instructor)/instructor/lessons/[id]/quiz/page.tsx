'use client';

import { Button, cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, HelpCircle, ListOrdered, Target, Trash2, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { QuestionBankPicker } from '@/components/quiz/question-bank-picker';
import { QuizPreviewModal } from '@/components/quiz/quiz-preview-modal';
import { QuizQuestionList } from '@/components/quiz/quiz-question-list';
import { QuizSettingsPanel } from '@/components/quiz/quiz-settings-panel';
import { ApiError } from '@/lib/api';
import { type Quiz, type QuestionBank, quizzesApi } from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

export default function InstructorQuizBuilderPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const quizQuery = useQuery({
    queryKey: ['lesson-quiz', lessonId],
    queryFn: () => quizzesApi.getForLesson(lessonId, accessToken!, true),
    enabled: !!accessToken && !!lessonId,
  });

  const [dropActive, setDropActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const excludeIds = useMemo(() => {
    const s = new Set<string>();
    quizQuery.data?.questions.forEach((q) => s.add(q.questionId));
    return s;
  }, [quizQuery.data]);

  // ---------- Mutations ----------
  const addQuestion = useMutation({
    mutationFn: (q: QuestionBank) => quizzesApi.addQuestion(quizQuery.data!.id, q.id, accessToken!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không thêm được câu hỏi');
    },
  });

  const randomPick = useMutation({
    mutationFn: (body: Parameters<typeof quizzesApi.randomPick>[1]) =>
      quizzesApi.randomPick(quizQuery.data!.id, body, accessToken!),
    onSuccess: (res) => {
      if (res.added === 0) {
        toast.info(`Không có câu hỏi phù hợp trong kho (pool ${res.pool})`);
      } else {
        toast.success(
          `Đã thêm ${res.added} câu hỏi` + (res.skipped > 0 ? ` (bỏ ${res.skipped} trùng)` : ''),
        );
      }
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Bốc thất bại');
    },
  });

  const removeQuestion = useMutation({
    mutationFn: (questionId: string) =>
      quizzesApi.removeQuestion(quizQuery.data!.id, questionId, accessToken!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không gỡ được câu hỏi');
    },
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      quizzesApi.reorder(quizQuery.data!.id, orderedIds, accessToken!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không lưu được thứ tự');
    },
  });

  const deleteQuiz = useMutation({
    mutationFn: () => quizzesApi.remove(quizQuery.data!.id, accessToken!),
    onSuccess: () => {
      toast.success('Đã xoá quiz');
      // Invalidate cache để trang edit lesson biết quiz không còn.
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
      router.push(`/instructor/lessons/${lessonId}/edit`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Xoá quiz thất bại');
    },
  });

  const handleDeleteQuiz = () => {
    const quiz = quizQuery.data;
    if (!quiz) return;
    if (
      !window.confirm(
        `Xoá toàn bộ quiz "${quiz.title}"?\n\n` +
          'Tất cả câu hỏi đã gán sẽ bị gỡ (câu hỏi vẫn còn trong ngân hàng).\n' +
          'Không thể hoàn tác qua UI.',
      )
    )
      return;
    deleteQuiz.mutate();
  };

  const updateSettings = useMutation({
    mutationFn: (patch: Partial<Quiz>) =>
      quizzesApi.update(quizQuery.data!.id, patch, accessToken!),
    onSuccess: () => {
      toast.success('Đã lưu cài đặt quiz');
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không lưu được cài đặt');
    },
  });

  const createQuiz = useMutation({
    mutationFn: () =>
      quizzesApi.createForLesson(
        lessonId,
        { title: 'Bài kiểm tra mới', passScore: 70, maxAttempts: 3 },
        accessToken!,
      ),
    onSuccess: () => {
      toast.success('Đã tạo quiz — hãy thêm câu hỏi từ ngân hàng');
      qc.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không tạo được quiz');
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      const id = e.dataTransfer.getData('application/x-question-id');
      if (!id || !quizQuery.data) return;
      if (excludeIds.has(id)) {
        toast.info('Câu hỏi đã có trong quiz');
        return;
      }
      addQuestion.mutate({ id } as QuestionBank);
    },
    [addQuestion, excludeIds, quizQuery.data],
  );

  if (quizQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-button bg-surface-2" />
        <div className="h-96 animate-pulse rounded-card bg-surface-2" />
      </div>
    );
  }

  if (!quizQuery.data) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>
        <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center">
          <HelpCircle className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">Bài giảng này chưa có quiz</p>
          <p className="mt-1 text-xs text-muted">Tạo quiz để bắt đầu thêm câu hỏi từ ngân hàng.</p>
          <Button
            onClick={() => createQuiz.mutate()}
            disabled={createQuiz.isPending}
            className="mt-5"
          >
            {createQuiz.isPending ? 'Đang tạo…' : 'Tạo quiz cho bài giảng'}
          </Button>
        </div>
      </div>
    );
  }

  const quiz = quizQuery.data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/instructor/lessons/${lessonId}/edit`}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Về bài giảng
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{quiz.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <ListOrdered className="h-3.5 w-3.5" />
              {quiz.questions.length} câu
            </span>
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" />
              {quiz.totalPoints} điểm
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              Pass {quiz.passScore}%
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Xem trước
          </Button>
          {/*
            Phase 18 — xoá toàn bộ quiz. Backend DELETE /quizzes/:id cascade
            xoá mọi QuizQuestion join rows (giữ nguyên QuestionBank) + mọi
            QuizAttempt liên quan. CLAUDE.md: INSTRUCTOR "Tạo | Sửa | Lưu
            trữ" KHÔNG có nút xoá bài giảng nhưng quiz thuộc phạm vi
            assessment nội bộ của instructor → cho phép xoá (matches backend
            ownership check ở quizzes.controller).
          */}
          <Button
            variant="outline"
            onClick={handleDeleteQuiz}
            disabled={deleteQuiz.isPending}
            className="border-rose-300 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:border-rose-700/50 dark:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
            {deleteQuiz.isPending ? 'Đang xoá…' : 'Xoá quiz'}
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[360px_1fr_300px]">
        {/* Bank */}
        <QuestionBankPicker
          excludeIds={excludeIds}
          onAdd={(q) => addQuestion.mutate(q)}
          onRandomPick={(body) => randomPick.mutate(body)}
          disabled={addQuestion.isPending || randomPick.isPending}
        />

        {/* Quiz list (drop target) */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-card border bg-surface p-3 transition-colors',
            dropActive ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Danh sách trong quiz ({quiz.questions.length})</p>
            {dropActive && <span className="text-xs text-primary">Thả vào đây để thêm</span>}
          </div>
          <QuizQuestionList
            questions={quiz.questions}
            onReorder={(orderedIds) => reorder.mutate(orderedIds)}
            onRemove={(questionId) => removeQuestion.mutate(questionId)}
          />
        </div>

        {/* Settings (moves under the list on mobile — see breakpoint) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <QuizSettingsPanel
            quiz={quiz}
            onSave={async (patch) => {
              await updateSettings.mutateAsync(patch);
            }}
            disabled={updateSettings.isPending}
          />
        </div>
      </div>

      <QuizPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} quiz={quiz} />
    </div>
  );
}
