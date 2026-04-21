import ExcelJS from 'exceljs';

/**
 * Excel exporters for reports module. Each function builds an
 * ExcelJS.Workbook and returns a Buffer ready to be sent as a response.
 *
 * Styling mirrors the PDF exporter where possible (primary blue header
 * row, bold font) so the two formats look like siblings.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

export interface ProgressRow {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  progressPercent: number;
  completedAt: Date | null;
  score: number | null;
}

export async function buildProgressReportXlsx(
  rows: ProgressRow[],
  title: string,
  subtitle: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GVD simvana';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Progress');
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16 };
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };

  sheet.getRow(4).values = ['Học viên', 'Email', 'Khoá học', 'Tiến độ (%)', 'Điểm', 'Hoàn thành'];
  sheet.getRow(4).font = HEADER_FONT;
  sheet.getRow(4).fill = HEADER_FILL;
  sheet.getRow(4).height = 22;

  sheet.columns = [
    { key: 'studentName', width: 24 },
    { key: 'studentEmail', width: 28 },
    { key: 'courseTitle', width: 32 },
    { key: 'progressPercent', width: 12 },
    { key: 'score', width: 10 },
    { key: 'completedAt', width: 14 },
  ];

  let rowIndex = 5;
  for (const r of rows) {
    sheet.getRow(rowIndex).values = [
      r.studentName,
      r.studentEmail,
      r.courseTitle,
      r.progressPercent,
      r.score ?? '—',
      r.completedAt ? r.completedAt.toLocaleDateString('vi-VN') : '—',
    ];
    rowIndex += 1;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export interface UserExportRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isBlocked: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

export async function buildUserListXlsx(rows: UserExportRow[], title: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GVD simvana';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Users');
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 16 };

  sheet.getRow(3).values = [
    'ID',
    'Họ tên',
    'Email',
    'Vai trò',
    'Xác minh email',
    'Bị khoá',
    'Ngày tạo',
  ];
  sheet.getRow(3).font = HEADER_FONT;
  sheet.getRow(3).fill = HEADER_FILL;
  sheet.getRow(3).height = 22;

  sheet.columns = [
    { key: 'id', width: 26 },
    { key: 'name', width: 24 },
    { key: 'email', width: 32 },
    { key: 'role', width: 14 },
    { key: 'emailVerified', width: 14 },
    { key: 'isBlocked', width: 10 },
    { key: 'createdAt', width: 18 },
  ];

  let rowIndex = 4;
  for (const r of rows) {
    sheet.getRow(rowIndex).values = [
      r.id,
      r.name,
      r.email,
      r.role,
      r.emailVerified ? 'Có' : 'Không',
      r.isBlocked ? 'Có' : 'Không',
      r.createdAt.toLocaleDateString('vi-VN'),
    ];
    rowIndex += 1;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export interface CertificateExportRow {
  code: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  issuedAt: Date;
  status: string;
  revokedReason: string | null;
}

export async function buildCertificateListXlsx(
  rows: CertificateExportRow[],
  title: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GVD simvana';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Certificates');
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 16 };

  sheet.getRow(3).values = [
    'Mã',
    'Học viên',
    'Email',
    'Khoá học',
    'Ngày cấp',
    'Trạng thái',
    'Lý do thu hồi',
  ];
  sheet.getRow(3).font = HEADER_FONT;
  // Use secondary color (violet) to visually distinguish certificate exports
  sheet.getRow(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' },
  };
  sheet.getRow(3).height = 22;

  sheet.columns = [
    { key: 'code', width: 20 },
    { key: 'studentName', width: 24 },
    { key: 'studentEmail', width: 28 },
    { key: 'courseTitle', width: 32 },
    { key: 'issuedAt', width: 14 },
    { key: 'status', width: 12 },
    { key: 'revokedReason', width: 28 },
  ];

  let rowIndex = 4;
  for (const r of rows) {
    sheet.getRow(rowIndex).values = [
      r.code,
      r.studentName,
      r.studentEmail,
      r.courseTitle,
      r.issuedAt.toLocaleDateString('vi-VN'),
      r.status,
      r.revokedReason ?? '',
    ];
    rowIndex += 1;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
