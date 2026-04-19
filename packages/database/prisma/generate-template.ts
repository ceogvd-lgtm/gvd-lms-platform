/**
 * Generate a static question-bank-template.xlsx at
 * `apps/frontend/public/templates/`. Served directly by Next.js.
 *
 * Mục đích: user có thể tải template qua URL tĩnh `/templates/...` mà
 * không cần JS runtime generator (dự phòng khi JS lỗi hoặc cần share link).
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

const header = [
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

mkdirSync(OUT_DIR, { recursive: true });

const ws = XLSX.utils.aoa_to_sheet(header);
// Column widths
ws['!cols'] = [
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

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'QuestionBank');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(OUT_FILE, buf);

console.log(`✓ Generated: ${OUT_FILE}`);
console.log(`  ${header.length - 1} sample rows (1 per question type)`);
