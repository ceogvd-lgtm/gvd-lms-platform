import type { Metadata } from 'next';

import { fetchPublicCertificate, type PublicCertificate } from '@/lib/certificates';

interface Props {
  params: { code: string };
}

/**
 * Phase 16 — public `/verify/[code]` page.
 *
 * Server-rendered (no auth) so the verification URL baked into every
 * certificate QR code works for anyone with the link. Pulls the cert
 * via `fetchPublicCertificate` — which calls the @Public backend
 * endpoint `GET /api/v1/certificates/verify/:code`.
 *
 * 404 renders a clean "Không tìm thấy" card so bad links don't
 * produce Next.js's default error page.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await fetchPublicCertificate(params.code).catch(() => null);
  if (!cert) {
    return {
      title: 'Chứng chỉ không tồn tại',
      description: 'Không tìm thấy chứng chỉ với mã bạn cung cấp.',
    };
  }
  const title = `${cert.studentName} — Chứng chỉ ${cert.courseName}`;
  return {
    title,
    description: `Xác minh chứng chỉ hoàn thành khoá học "${cert.courseName}" do ${cert.institutionName} cấp.`,
    openGraph: {
      title,
      description: `Học viên ${cert.studentName} đã hoàn thành khoá học "${cert.courseName}" với xếp loại ${cert.grade ?? '—'}.`,
      type: 'website',
    },
  };
}

export default async function VerifyPage({ params }: Props) {
  const cert = await fetchPublicCertificate(params.code).catch(() => null);
  return (
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-20">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L14 8H20L15 12L17 18L12 14L7 18L9 12L4 8H10L12 2Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">GVD Learning</h1>
          <p className="mt-1 text-sm text-muted">Hệ thống xác minh chứng chỉ</p>
        </header>

        {cert ? (
          <ValidCard
            cert={cert}
            shareUrl={`${process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3000'}/verify/${cert.code}`}
          />
        ) : (
          <NotFoundCard code={params.code} />
        )}
      </div>
    </main>
  );
}

function ValidCard({ cert, shareUrl }: { cert: PublicCertificate; shareUrl: string }) {
  const isActive = cert.status === 'ACTIVE';
  const isRevoked = cert.status === 'REVOKED';

  const statusStyle = isActive
    ? 'bg-success/10 text-success border-success/30'
    : isRevoked
      ? 'bg-error/10 text-error border-error/30'
      : 'bg-warning/10 text-warning border-warning/30';
  const statusLabel = isActive ? 'HỢP LỆ' : isRevoked ? 'ĐÃ THU HỒI' : 'HẾT HẠN';
  const iconColor = isActive ? 'text-success' : 'text-error';

  const gradeColor =
    cert.grade === 'Xuất sắc'
      ? 'text-warning'
      : cert.grade === 'Giỏi'
        ? 'text-success'
        : 'text-primary';

  return (
    <div className="rounded-card border border-border bg-background p-6 shadow-xl sm:p-10">
      {/* Big status icon */}
      <div className="flex flex-col items-center gap-3">
        <div
          className={
            'flex h-20 w-20 items-center justify-center rounded-full ' +
            (isActive ? 'bg-success/10' : isRevoked ? 'bg-error/10' : 'bg-warning/10')
          }
        >
          {isActive ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className={iconColor}>
              <path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className={iconColor}>
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <span
          className={
            'rounded-full border px-4 py-1 text-xs font-bold tracking-widest ' + statusStyle
          }
        >
          {statusLabel}
        </span>
      </div>

      {/* Student + course */}
      <div className="mt-6 text-center">
        <p className="text-sm uppercase tracking-wider text-muted">Chứng nhận rằng</p>
        <h2 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">{cert.studentName}</h2>
        <p className="mt-3 text-sm text-muted">đã hoàn thành khoá học</p>
        <h3 className="mt-1 text-xl font-bold text-primary sm:text-2xl">{cert.courseName}</h3>
      </div>

      {/* Grade */}
      {cert.grade && (
        <div className="mt-6 flex flex-col items-center gap-1">
          <p className="text-xs uppercase tracking-wider text-muted">Xếp loại</p>
          <p className={'text-2xl font-bold ' + gradeColor}>{cert.grade}</p>
          {cert.finalScore !== null && (
            <p className="text-xs text-muted">Điểm: {cert.finalScore}%</p>
          )}
        </div>
      )}

      {/* Meta */}
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Ngày cấp</dt>
          <dd className="mt-1 font-semibold text-foreground">
            {new Date(cert.issuedAt).toLocaleDateString('vi-VN')}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Hiệu lực đến</dt>
          <dd className="mt-1 font-semibold text-foreground">
            {cert.expiresAt
              ? new Date(cert.expiresAt).toLocaleDateString('vi-VN')
              : 'Không có thời hạn'}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs uppercase tracking-wider text-muted">Mã chứng chỉ</dt>
          <dd className="mt-1 break-all font-mono text-xs font-semibold text-foreground">
            {cert.code}
          </dd>
        </div>
      </dl>

      {/* Revoke reason */}
      {isRevoked && cert.revokedReason && (
        <div className="mt-6 rounded-card border border-error/30 bg-error/5 p-4 text-sm">
          <p className="font-semibold text-error">Lý do thu hồi:</p>
          <p className="mt-1 text-foreground">{cert.revokedReason}</p>
        </div>
      )}

      {/* Share — only valid certs */}
      {isActive && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-button bg-[#0A66C2] px-4 py-2 text-sm font-semibold text-white shadow transition-transform hover:scale-105"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z" />
            </svg>
            Chia sẻ LinkedIn
          </a>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted">
        Cấp bởi <span className="font-semibold text-foreground">{cert.institutionName}</span>
      </p>
    </div>
  );
}

function NotFoundCard({ code }: { code: string }) {
  return (
    <div className="rounded-card border border-border bg-background p-10 text-center shadow-xl">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-error/10 text-error">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-foreground">Không tìm thấy chứng chỉ</h2>
      <p className="mt-2 text-sm text-muted">
        Mã <span className="font-mono text-foreground">{code}</span> không tồn tại trong hệ thống,
        hoặc đã bị xoá.
      </p>
    </div>
  );
}
