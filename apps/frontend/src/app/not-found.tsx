import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-3xl font-bold">404 — Không tìm thấy trang</h2>
      <Link href="/" className="text-primary hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
