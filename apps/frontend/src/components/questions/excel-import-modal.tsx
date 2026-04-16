'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  cn,
} from '@lms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { ApiError } from '@/lib/api';
import {
  type Difficulty,
  type QuestionOption,
  type QuestionType,
  questionsApi,
  type QuestionImportPayload,
  type ImportResult,
} from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

interface ExcelImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourseId?: string;
}

type ParsedRow = QuestionImportPayload['questions'][number] & {
  row: number;
  error?: string;
};

const VALID_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'];
const VALID_DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/**
 * Parse a workbook into `ParsedRow[]`. Template columns:
 *
 *   Question | Type | OptionA | OptionB | OptionC | OptionD |
 *   CorrectAnswer | Difficulty | Tags | Points
 *
 *   CorrectAnswer is one or more letters A-F separated by commas. For
 *   TRUE_FALSE, use `T` / `F` (or `true` / `false`). For FILL_BLANK,
 *   the cell is a comma-separated list of accepted answers.
 */
function parseWorkbook(data: ArrayBuffer): { rows: ParsedRow[]; sheet: string } {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], sheet: '' };
  const sheet = wb.Sheets[sheetName]!;
  const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
    defval: '',
    raw: false,
  });

  const out: ParsedRow[] = [];
  json.forEach((raw, idx) => {
    const rowNumber = idx + 2; // header is row 1
    try {
      const question = String(raw['Question'] ?? '').trim();
      if (!question) throw new Error('Thiếu nội dung câu hỏi');

      const rawType = String(raw['Type'] ?? 'SINGLE_CHOICE')
        .trim()
        .toUpperCase();
      if (!VALID_TYPES.includes(rawType as QuestionType)) {
        throw new Error(`Loại câu hỏi không hợp lệ: ${rawType}`);
      }
      const type = rawType as QuestionType;

      const correctCell = String(raw['CorrectAnswer'] ?? '').trim();
      const difficultyCell = String(raw['Difficulty'] ?? 'MEDIUM')
        .trim()
        .toUpperCase();
      const difficulty = (
        VALID_DIFFICULTIES.includes(difficultyCell as Difficulty) ? difficultyCell : 'MEDIUM'
      ) as Difficulty;

      const tags = String(raw['Tags'] ?? '')
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const points = Number(raw['Points'] ?? 1) || 1;

      const options: QuestionOption[] = buildOptions(type, raw, correctCell);

      out.push({
        row: rowNumber,
        question,
        type,
        options,
        explanation: null,
        difficulty,
        tags,
        points,
        courseId: null,
        departmentId: null,
      });
    } catch (err) {
      out.push({
        row: rowNumber,
        question: String(raw['Question'] ?? ''),
        type: 'SINGLE_CHOICE',
        options: [],
        explanation: null,
        difficulty: 'MEDIUM',
        tags: [],
        points: 1,
        courseId: null,
        departmentId: null,
        error: err instanceof Error ? err.message : 'Dòng không hợp lệ',
      });
    }
  });
  return { rows: out, sheet: sheetName };
}

function buildOptions(
  type: QuestionType,
  raw: Record<string, string | number>,
  correctCell: string,
): QuestionOption[] {
  if (type === 'TRUE_FALSE') {
    const c = correctCell.trim().toUpperCase();
    const isTrue = c === 'T' || c === 'TRUE' || c === 'Đ' || c === 'DUNG';
    return [
      { id: 'true', text: 'Đúng', isCorrect: isTrue },
      { id: 'false', text: 'Sai', isCorrect: !isTrue },
    ];
  }

  if (type === 'FILL_BLANK') {
    const answers = correctCell
      .split(/[,;|]/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (answers.length === 0) throw new Error('FILL_BLANK cần ít nhất 1 đáp án');
    return answers.map((a) => ({ id: '', text: a, isCorrect: true }));
  }

  // SINGLE_CHOICE / MULTI_CHOICE
  const cols: Array<{ key: string; letter: string }> = [
    { key: 'OptionA', letter: 'A' },
    { key: 'OptionB', letter: 'B' },
    { key: 'OptionC', letter: 'C' },
    { key: 'OptionD', letter: 'D' },
    { key: 'OptionE', letter: 'E' },
    { key: 'OptionF', letter: 'F' },
  ];
  const present = cols
    .map((c) => ({ letter: c.letter, text: String(raw[c.key] ?? '').trim() }))
    .filter((c) => c.text.length > 0);
  if (present.length < 2) throw new Error('Cần ít nhất 2 lựa chọn (OptionA, OptionB)');

  const correctLetters = correctCell
    .split(/[,;|\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (correctLetters.length === 0) throw new Error('Thiếu cột CorrectAnswer');
  if (type === 'SINGLE_CHOICE' && correctLetters.length !== 1) {
    throw new Error('SINGLE_CHOICE phải có đúng 1 đáp án');
  }

  return present.map((p) => ({
    id: '',
    text: p.text,
    isCorrect: correctLetters.includes(p.letter),
  }));
}

function downloadTemplate() {
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
  const ws = XLSX.utils.aoa_to_sheet(header);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'QuestionBank');
  XLSX.writeFile(wb, 'question-bank-template.xlsx');
}

export function ExcelImportModal({ open, onOpenChange, defaultCourseId }: ExcelImportModalProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.error), [rows]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (validRows.length === 0) throw new Error('Không có dòng hợp lệ để nhập');
      const payload: QuestionImportPayload = {
        questions: validRows.map((r) => ({
          question: r.question,
          type: r.type,
          options: r.options,
          explanation: r.explanation,
          difficulty: r.difficulty,
          tags: r.tags,
          points: r.points,
          courseId: defaultCourseId ?? null,
          departmentId: null,
        })),
        defaultCourseId,
      };
      return questionsApi.import(payload, accessToken!);
    },
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['question-tags'] });
      if (res.created > 0) {
        toast.success(`Đã nhập ${res.created} câu hỏi`);
      }
      if (res.errors.length > 0) {
        toast.warning(`${res.errors.length} dòng bị bỏ qua do lỗi định dạng`);
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Nhập thất bại';
      toast.error(msg);
    },
  });

  const handleFile = useCallback(async (f: File) => {
    setResult(null);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const { rows: parsed, sheet } = parseWorkbook(buf);
      setRows(parsed);
      setFile(f);
      toast.info(
        `Đã đọc ${parsed.length} dòng từ sheet "${sheet}" — ${
          parsed.filter((r) => !r.error).length
        } hợp lệ`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không đọc được file');
    } finally {
      setParsing(false);
    }
  }, []);

  function reset() {
    setFile(null);
    setRows([]);
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent maxWidth="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nhập câu hỏi từ Excel</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Drop zone */}
          {rows.length === 0 && !parsing && !result && (
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-card border-2 border-dashed py-12 text-center transition-colors',
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-surface-2/40 hover:border-primary/50',
              )}
            >
              <UploadCloud className="mb-3 h-10 w-10 text-primary" />
              <p className="text-sm font-semibold">Kéo thả file Excel (.xlsx) vào đây</p>
              <p className="mt-1 text-xs text-muted">
                Hoặc{' '}
                <label className="cursor-pointer text-primary underline">
                  chọn file
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="hidden"
                  />
                </label>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                className="mt-4"
              >
                <Download className="h-4 w-4" />
                Tải template mẫu
              </Button>
            </div>
          )}

          {parsing && (
            <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm">Đang đọc file…</p>
            </div>
          )}

          {/* Summary + preview table */}
          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{file?.name}</p>
                  <p className="text-xs text-muted">
                    {rows.length} dòng ·{' '}
                    <span className="text-emerald-600">{validRows.length} hợp lệ</span>
                    {invalidRows.length > 0 && (
                      <>
                        {' '}
                        · <span className="text-rose-500">{invalidRows.length} lỗi</span>
                      </>
                    )}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={reset}>
                  Chọn file khác
                </Button>
              </div>

              <div className="overflow-hidden rounded-card border border-border">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-surface-2/60 text-left uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-2 py-2">Dòng</th>
                      <th className="px-2 py-2">Câu hỏi</th>
                      <th className="px-2 py-2">Loại</th>
                      <th className="px-2 py-2">Lựa chọn</th>
                      <th className="px-2 py-2">Khó</th>
                      <th className="px-2 py-2">Tags</th>
                      <th className="px-2 py-2">Điểm</th>
                      <th className="px-2 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 20).map((r) => (
                      <tr
                        key={r.row}
                        className={r.error ? 'bg-rose-500/5' : 'bg-surface hover:bg-surface-2/40'}
                      >
                        <td className="px-2 py-2 text-muted">{r.row}</td>
                        <td className="max-w-[220px] truncate px-2 py-2">{r.question}</td>
                        <td className="px-2 py-2">{r.type}</td>
                        <td className="px-2 py-2 text-muted">
                          {r.options.length} / {r.options.filter((o) => o.isCorrect).length} đúng
                        </td>
                        <td className="px-2 py-2">{r.difficulty}</td>
                        <td className="max-w-[120px] truncate px-2 py-2 text-muted">
                          {r.tags.join(', ')}
                        </td>
                        <td className="px-2 py-2">{r.points}</td>
                        <td className="px-2 py-2">
                          {r.error ? (
                            <span className="inline-flex items-center gap-1 text-rose-500">
                              <AlertTriangle className="h-3 w-3" />
                              {r.error}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <div className="border-t border-border bg-surface-2/40 px-2 py-1.5 text-center text-xs text-muted">
                    Đã hiển thị 20/{rows.length} dòng đầu. Các dòng còn lại sẽ được xử lý tương tự.
                  </div>
                )}
              </div>
            </div>
          )}

          {importMutation.isPending && (
            <div className="rounded-card border border-border bg-surface p-4">
              <p className="mb-2 text-sm font-semibold">Đang nhập…</p>
              <Progress value={0} aria-label="Đang nhập" />
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="rounded-card border border-emerald-500/40 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  Đã nhập {result.created} câu hỏi
                </p>
                {result.skipped > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    Bỏ qua {result.skipped} dòng do không hợp lệ.
                  </p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="overflow-hidden rounded-card border border-rose-500/40">
                  <div className="border-b border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-600">
                    Chi tiết lỗi
                  </div>
                  <ul className="divide-y divide-border text-xs">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="px-3 py-2">
                        <span className="font-semibold">Dòng {e.row}</span> — {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {rows.length > 0 && !result && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={validRows.length === 0 || importMutation.isPending}
            >
              <UploadCloud className="h-4 w-4" />
              Nhập {validRows.length} câu hỏi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
