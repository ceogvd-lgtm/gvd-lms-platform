import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import { renderPdf } from '../reports/exporters/pdf.exporter';

/**
 * Phase 16 — individual certificate PDF.
 *
 * A4 landscape, brand colour #1E40AF, native pdfmake QR code (no
 * extra `qrcode` dep). Relies on the singleton `pdfMake` in
 * {@link renderPdf} so we inherit the same font + URL-access policy.
 */
export interface CertificatePdfInput {
  studentName: string;
  courseName: string;
  code: string;
  grade: string;
  finalScore: number;
  issuedAt: Date;
  expiresAt: Date | null;
  verifyUrl: string;
  institutionName: string;
  signerName?: string;
  signerTitle?: string;
}

const BRAND = '#1E40AF';
const GRADE_COLOR: Record<string, string> = {
  'Xuất sắc': '#F59E0B',
  Giỏi: '#10B981',
  Đạt: '#3B82F6',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Build the pdfmake document definition for a single certificate.
 * Kept pure so unit tests can inspect the doc without rendering.
 */
export function buildCertificateDoc(input: CertificatePdfInput): TDocumentDefinitions {
  const gradeColor = GRADE_COLOR[input.grade] ?? '#111827';

  return {
    info: {
      title: `Chứng chỉ — ${input.courseName}`,
      author: input.institutionName,
    },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 40, 40, 40],
    // A4 landscape = 842 × 595 pt
    background: [
      {
        canvas: [
          {
            type: 'rect',
            x: 20,
            y: 20,
            w: 802,
            h: 555,
            lineWidth: 3,
            lineColor: BRAND,
            r: 8,
          },
          // Inner hairline
          {
            type: 'rect',
            x: 28,
            y: 28,
            w: 786,
            h: 539,
            lineWidth: 0.5,
            lineColor: BRAND,
            r: 6,
          },
        ],
      },
    ],
    content: [
      { text: input.institutionName, style: 'institution', margin: [0, 10, 0, 0] },
      { text: 'CHỨNG CHỈ HOÀN THÀNH', style: 'title', margin: [0, 20, 0, 4] },
      { text: 'CERTIFICATE OF COMPLETION', style: 'subtitle' },
      { text: 'Chứng nhận rằng', style: 'bodyCenter', margin: [0, 30, 0, 0] },
      { text: input.studentName, style: 'studentName' },
      {
        text: 'đã hoàn thành xuất sắc khoá học',
        style: 'bodyCenter',
        margin: [0, 10, 0, 0],
      },
      { text: input.courseName, style: 'courseName', margin: [0, 6, 0, 20] },

      {
        columns: [
          {
            text: [
              { text: 'Điểm đạt được: ', style: 'bodyCenter' },
              { text: `${input.finalScore}%`, style: 'bodyCenter', bold: true },
            ],
            alignment: 'center',
          },
          {
            text: [
              { text: 'Xếp loại: ', style: 'bodyCenter' },
              { text: input.grade, style: 'bodyCenter', bold: true, color: gradeColor },
            ],
            alignment: 'center',
          },
        ],
        margin: [0, 0, 0, 30],
      },

      {
        columns: [
          {
            width: 100,
            stack: [
              { qr: input.verifyUrl, fit: 90 },
              {
                text: 'Quét mã để xác minh',
                fontSize: 9,
                alignment: 'center',
                margin: [0, 4, 0, 0],
              },
            ],
          },
          {
            width: '*',
            stack: [
              { text: `Mã chứng chỉ: ${input.code}`, fontSize: 11, margin: [0, 6, 0, 4] },
              {
                text: `Ngày cấp: ${formatDate(input.issuedAt)}`,
                fontSize: 11,
                margin: [0, 0, 0, 4],
              },
              {
                text: input.expiresAt
                  ? `Hiệu lực đến: ${formatDate(input.expiresAt)}`
                  : 'Không có thời hạn',
                fontSize: 11,
                margin: [0, 0, 0, 4],
              },
              {
                text: input.verifyUrl,
                fontSize: 10,
                color: BRAND,
                link: input.verifyUrl,
                margin: [0, 8, 0, 0],
              },
            ],
          },
          {
            width: 180,
            stack: [
              { text: '', margin: [0, 30, 0, 0] },
              {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 1 }],
              },
              {
                text: input.signerName ?? input.institutionName,
                fontSize: 11,
                bold: true,
                alignment: 'center',
                margin: [0, 4, 0, 0],
              },
              {
                text: input.signerTitle ?? 'Đại diện đơn vị',
                fontSize: 10,
                alignment: 'center',
                color: '#6B7280',
              },
            ],
          },
        ],
        margin: [0, 10, 0, 0],
      },
    ],
    styles: {
      institution: {
        fontSize: 14,
        color: BRAND,
        alignment: 'center',
      },
      title: {
        fontSize: 28,
        bold: true,
        color: BRAND,
        alignment: 'center',
      },
      subtitle: {
        fontSize: 12,
        italics: true,
        color: '#6B7280',
        alignment: 'center',
      },
      bodyCenter: {
        fontSize: 13,
        color: '#374151',
        alignment: 'center',
      },
      studentName: {
        fontSize: 36,
        bold: true,
        alignment: 'center',
        color: '#111827',
      },
      courseName: {
        fontSize: 20,
        bold: true,
        alignment: 'center',
        color: BRAND,
      },
    },
    defaultStyle: { font: 'Roboto' },
  };
}

/**
 * Render the certificate to a PDF buffer — convenience wrapper so
 * callers don't need to import both the builder and `renderPdf`.
 */
export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Buffer> {
  return renderPdf(buildCertificateDoc(input));
}
