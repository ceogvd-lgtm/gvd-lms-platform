import { dirname, join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfMakeModule = require('pdfmake');
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * pdfmake 0.3.x exports a singleton instance with `.setFonts()` +
 * `.createPdf()`. `createPdf()` returns an OutputDocumentServer whose
 * `.getBuffer()` resolves to a Buffer — exactly what the response
 * layer needs. The earlier `new PdfPrinter(fonts)` style still exists
 * in 0.3.x but requires a `virtualfs` + `urlResolver`; the singleton
 * sets those up internally, so we use it.
 *
 * pdfmake doesn't ship ESM-friendly typings so we cast through a local
 * interface.
 */
interface PdfMakeSingleton {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(policy: (url: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
}

const pdfMake = pdfMakeModule as unknown as PdfMakeSingleton;

/**
 * Configure fonts exactly once. Roboto TTF files ship with pdfmake and
 * have full Vietnamese diacritic coverage, so no custom font bundle
 * is needed for the Phase 09 reports.
 */
let fontsConfigured = false;

function ensureFonts(): void {
  if (fontsConfigured) return;

  // Resolve pdfmake's own directory at runtime so the TTF paths are
  // portable across pnpm hoisting layouts. The `.ttf` files ship inside
  // the pdfmake package.
  const pdfmakePkg = require.resolve('pdfmake/package.json');
  const pdfmakeDir = dirname(pdfmakePkg);
  const fontDir = join(pdfmakeDir, 'fonts', 'Roboto');

  pdfMake.setFonts({
    Roboto: {
      normal: join(fontDir, 'Roboto-Regular.ttf'),
      bold: join(fontDir, 'Roboto-Medium.ttf'),
      italics: join(fontDir, 'Roboto-Italic.ttf'),
      bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf'),
    },
  });
  // Block every external URL — our reports only use local fonts/images,
  // so we tighten this down to prevent SSRF-style abuse via docDefinition.
  pdfMake.setUrlAccessPolicy(() => false);
  fontsConfigured = true;
}

/**
 * Turn a pdfmake doc definition into a Buffer.
 */
export async function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  ensureFonts();
  const pdf = pdfMake.createPdf({
    ...doc,
    defaultStyle: { font: 'Roboto', ...(doc.defaultStyle ?? {}) },
  });
  return pdf.getBuffer();
}

// =====================================================
// Report builders — each returns a pdfmake doc definition
// =====================================================

export interface ProgressRow {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  progressPercent: number;
  completedAt: Date | null;
  score: number | null;
}

export function buildProgressReportDoc(
  rows: ProgressRow[],
  title: string,
  subtitle: string,
): TDocumentDefinitions {
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: title, style: 'h1' },
      { text: subtitle, style: 'subtitle' },
      { text: `Tổng số bản ghi: ${rows.length}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', 50, 60, 60],
          body: [
            [
              { text: 'Học viên', style: 'th' },
              { text: 'Email', style: 'th' },
              { text: 'Khoá học', style: 'th' },
              { text: 'Tiến độ', style: 'th', alignment: 'right' as const },
              { text: 'Điểm', style: 'th', alignment: 'right' as const },
              { text: 'Hoàn thành', style: 'th' },
            ],
            ...rows.map((r) => [
              r.studentName,
              r.studentEmail,
              r.courseTitle,
              { text: `${r.progressPercent}%`, alignment: 'right' as const },
              {
                text: r.score !== null ? String(r.score) : '—',
                alignment: 'right' as const,
              },
              r.completedAt ? r.completedAt.toLocaleDateString('vi-VN') : '—',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center' as const,
      margin: [0, 20, 0, 0],
    }),
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 10, color: '#666', margin: [0, 0, 0, 8] },
      th: { bold: true, fillColor: '#1E40AF', color: '#fff' },
    },
  };
}

export interface UserExportRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isBlocked: boolean;
  createdAt: Date;
}

export function buildUserListDoc(rows: UserExportRow[], title: string): TDocumentDefinitions {
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: title, style: 'h1' },
      { text: `Tổng số người dùng: ${rows.length}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [80, '*', '*', 60, 50, 70],
          body: [
            [
              { text: 'ID', style: 'th' },
              { text: 'Họ tên', style: 'th' },
              { text: 'Email', style: 'th' },
              { text: 'Vai trò', style: 'th' },
              { text: 'Khoá', style: 'th' },
              { text: 'Ngày tạo', style: 'th' },
            ],
            ...rows.map((r) => [
              r.id.slice(0, 8),
              r.name,
              r.email,
              r.role,
              r.isBlocked ? 'Có' : 'Không',
              r.createdAt.toLocaleDateString('vi-VN'),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      th: { bold: true, fillColor: '#1E40AF', color: '#fff' },
    },
  };
}

export interface CertificateExportRow {
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: Date;
  status: string;
}

export function buildCertificateListDoc(
  rows: CertificateExportRow[],
  title: string,
): TDocumentDefinitions {
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: title, style: 'h1' },
      { text: `Tổng chứng chỉ: ${rows.length}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [90, '*', '*', 70, 60],
          body: [
            [
              { text: 'Mã', style: 'th' },
              { text: 'Học viên', style: 'th' },
              { text: 'Khoá học', style: 'th' },
              { text: 'Ngày cấp', style: 'th' },
              { text: 'Trạng thái', style: 'th' },
            ],
            ...rows.map((r) => [
              r.code,
              r.studentName,
              r.courseTitle,
              r.issuedAt.toLocaleDateString('vi-VN'),
              r.status,
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      th: { bold: true, fillColor: '#7C3AED', color: '#fff' },
    },
  };
}
