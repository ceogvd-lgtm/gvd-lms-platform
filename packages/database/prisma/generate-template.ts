/**
 * Generate a static question-bank-template.xlsx at
 * `apps/frontend/public/templates/`. Served directly by Next.js.
 *
 * Mục đích: user có thể tải template qua URL tĩnh `/templates/...` mà
 * không cần JS runtime generator (dự phòng khi JS lỗi hoặc cần share link).
 *
 * Phase 18 — file giờ có 2 sheet:
 *   1. "QuestionBank"       — header tiếng Anh (compatible với parser cũ)
 *   2. "Template Tiếng Việt" — header tiếng Việt, Difficulty tiếng Việt
 *                              (parser tự normalize)
 * Parser đọc sheet đầu tiên (sheet 0) → mặc định tiếng Anh. Nếu user
 * đổi thứ tự sheet thì tự chọn sheet tiếng Việt.
 *
 * Run:
 *   pnpm --filter @lms/database exec tsx prisma/generate-template.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as XLSX from 'xlsx';

const ROOT = join(__dirname, '..', '..', '..');
const OUT_DIR = join(ROOT, 'apps', 'frontend', 'public', 'templates');
const OUT_FILE = join(OUT_DIR, 'question-bank-template.xlsx');

// ---------- Sheet 1 — English header ----------
const enHeader = [
  [
    'Question',
    'Type',
    'OptionA',
    'OptionB',
    'OptionC',
    'OptionD',
    'CorrectAnswer',
    'Difficulty',
    'Tags',
    'Points',
  ],
  [
    'Điện áp xoay chiều 3 pha chuẩn Việt Nam là?',
    'SINGLE_CHOICE',
    '220V',
    '380V',
    '110V',
    '440V',
    'B',
    'EASY',
    'điện,cơ bản',
    1,
  ],
  [
    'Các thiết bị bảo vệ quá dòng gồm?',
    'MULTI_CHOICE',
    'Cầu chì',
    'Aptomat',
    'Công tắc',
    'Rơ le nhiệt',
    'A,B,D',
    'MEDIUM',
    'an toàn,điện',
    2,
  ],
  ['Dòng điện một chiều là DC?', 'TRUE_FALSE', '', '', '', '', 'T', 'EASY', 'cơ bản', 1],
  [
    'Ký hiệu của cường độ dòng điện là chữ gì?',
    'FILL_BLANK',
    '',
    '',
    '',
    '',
    'I,i',
    'EASY',
    'ký hiệu',
    1,
  ],
];

// ---------- Sheet 2 — Vietnamese header ----------
const viHeader = [
  [
    'Câu hỏi',
    'Loại',
    'Đáp án A',
    'Đáp án B',
    'Đáp án C',
    'Đáp án D',
    'Đáp án đúng',
    'Độ khó',
    'Thẻ',
    'Điểm',
    'Giải thích',
  ],
  [
    'Dòng điện định mức của CB 1 pha 220V là?',
    'SINGLE_CHOICE',
    '10A',
    '16A',
    '20A',
    '32A',
    '2', // số 2 → parser map thành B
    'Dễ', // tiếng Việt → parser map thành EASY
    'điện,cb',
    1,
    'Dòng định mức CB 16A phổ biến cho mạch gia dụng.',
  ],
  [
    'PPE nào bắt buộc khi làm việc trên cao?',
    'MULTI_CHOICE',
    'Mũ bảo hộ',
    'Dây an toàn',
    'Kính mát',
    'Giày chống trượt',
    'A,B,D', // chữ — vẫn hoạt động
    'Trung bình',
    'an toàn,làm việc trên cao',
    2,
    'Kính mát không phải PPE bắt buộc (dùng kính bảo hộ thay thế).',
  ],
  [
    'Đúng hay sai: SCORM là tiêu chuẩn e-learning',
    'TRUE_FALSE',
    '',
    '',
    '',
    '',
    'Đúng', // có dấu → parser chấp nhận
    'Dễ',
    'e-learning,tiêu chuẩn',
    1,
    '',
  ],
  [
    'Viết tắt của "Personal Protective Equipment" là?',
    'FILL_BLANK',
    '',
    '',
    '',
    '',
    'PPE,ppe',
    'Dễ',
    'ppe,viết tắt',
    1,
    '',
  ],
];

mkdirSync(OUT_DIR, { recursive: true });

const wsEn = XLSX.utils.aoa_to_sheet(enHeader);
wsEn['!cols'] = [
  { wch: 50 }, // Question
  { wch: 14 }, // Type
  { wch: 20 }, // OptionA
  { wch: 20 }, // OptionB
  { wch: 20 }, // OptionC
  { wch: 20 }, // OptionD
  { wch: 18 }, // CorrectAnswer
  { wch: 12 }, // Difficulty
  { wch: 24 }, // Tags
  { wch: 8 }, // Points
];

const wsVi = XLSX.utils.aoa_to_sheet(viHeader);
wsVi['!cols'] = [
  { wch: 50 }, // Câu hỏi
  { wch: 14 }, // Loại
  { wch: 20 }, // Đáp án A
  { wch: 20 }, // Đáp án B
  { wch: 20 }, // Đáp án C
  { wch: 20 }, // Đáp án D
  { wch: 18 }, // Đáp án đúng
  { wch: 14 }, // Độ khó
  { wch: 24 }, // Thẻ
  { wch: 8 }, // Điểm
  { wch: 40 }, // Giải thích
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsEn, 'QuestionBank');
XLSX.utils.book_append_sheet(wb, wsVi, 'Template Tiếng Việt');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(OUT_FILE, buf);

console.log(`✓ Generated: ${OUT_FILE}`);
console.log(`  Sheet 1 (QuestionBank):       ${enHeader.length - 1} sample rows (English)`);
console.log(`  Sheet 2 (Template Tiếng Việt): ${viHeader.length - 1} sample rows (Vietnamese)`);
