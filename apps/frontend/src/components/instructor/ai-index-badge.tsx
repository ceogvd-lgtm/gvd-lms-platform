'use client';

import { cn } from '@lms/ui';
import { Bot, Clock, FileText } from 'lucide-react';

import type { LessonAttachment } from '@/lib/theory-engine';

interface AiIndexBadgeProps {
  attachment: Pick<LessonAttachment, 'mimeType' | 'aiIndexed' | 'createdAt'>;
  className?: string;
}

/**
 * Phase 18 — trạng thái AI indexing cho attachment.
 *
 *   🤖 AI đã học        PDF đã chunk + embed vào Chroma, chatbot trả lời
 *                       được theo nội dung PDF (aiIndexed=true)
 *   ⏳ Đang xử lý...    PDF upload < 2 phút, worker đang chạy (khả năng
 *                       cao đang index); hiển thị để user biết chờ
 *   ⚠️ Chưa index       PDF upload > 2 phút nhưng aiIndexed vẫn false —
 *                       có thể quota Gemini đầy hoặc PDF quét không có text
 *   📄 PDF              (không render — caller tự ẩn cho non-PDF)
 *
 * Non-PDF mime (Word, Excel, PNG…) → component không hiển thị gì (return
 * null) để UI không lẫn lộn.
 */
export function AiIndexBadge({ attachment, className }: AiIndexBadgeProps) {
  if (attachment.mimeType !== 'application/pdf') return null;

  const uploadedMs = new Date(attachment.createdAt).getTime();
  const ageMs = Date.now() - uploadedMs;
  const INDEXING_WINDOW = 2 * 60 * 1000; // 2 phút cửa sổ "đang xử lý"

  if (attachment.aiIndexed) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400',
          className,
        )}
        title="Chatbot AI đã học nội dung PDF này"
      >
        <Bot className="h-3 w-3" />
        AI đã học
      </span>
    );
  }

  if (ageMs < INDEXING_WINDOW) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400',
          className,
        )}
        title="Đang chunk + embed PDF vào ChromaDB, thường mất 30-60 giây"
      >
        <Clock className="h-3 w-3 animate-pulse" />
        Đang xử lý…
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400',
        className,
      )}
      title="PDF chưa được AI index — có thể do quota Gemini đầy hoặc PDF là ảnh quét không có text"
    >
      <FileText className="h-3 w-3" />
      Chưa index
    </span>
  );
}
