'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lms/ui';
import { Clock, ListOrdered, Target, Trophy } from 'lucide-react';

import { QuestionPreview } from '@/components/questions/question-preview';
import type { QuestionBank, QuizWithQuestions } from '@/lib/assessments';

interface QuizPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: QuizWithQuestions;
}

/**
 * Instructor preview of the quiz — renders questions as a student would see
 * them, but keeps the correct-answer highlighting on so the instructor can
 * verify everything before publishing.
 */
export function QuizPreviewModal({ open, onOpenChange, quiz }: QuizPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Xem trước quiz (như học viên)</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Header strip */}
          <div className="rounded-card border border-border bg-surface-2/40 p-4">
            <h3 className="text-lg font-bold">{quiz.title}</h3>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <ListOrdered className="h-3.5 w-3.5" />
                {quiz.questions.length} câu
              </span>
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" />
                {quiz.totalPoints} điểm tổng
              </span>
              <span className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                Qua ở {quiz.passScore}%
              </span>
              {quiz.timeLimit && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.round(quiz.timeLimit / 60)} phút
                </span>
              )}
            </div>
          </div>

          {quiz.questions.length === 0 ? (
            <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted">
              Chưa có câu hỏi.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {quiz.questions.map((qq, idx) => (
                <QuestionPreview
                  key={qq.id}
                  index={idx}
                  question={toFullQuestion(qq)}
                  revealAnswers
                />
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lift a QuizQuestionRow back into a QuestionBank shape for <QuestionPreview>.
 * The backend-delivered row already includes everything we need except
 * metadata that preview doesn't use — we fill those with safe defaults.
 */
function toFullQuestion(row: QuizWithQuestions['questions'][number]): QuestionBank {
  return {
    id: row.question.id,
    courseId: null,
    departmentId: null,
    question: row.question.question,
    type: row.question.type,
    options: row.question.options,
    correctAnswer: row.question.correctAnswer,
    explanation: row.question.explanation,
    difficulty: row.question.difficulty,
    tags: row.question.tags,
    points: row.points,
    createdBy: '',
    creator: null,
    createdAt: '',
    updatedAt: '',
  };
}
