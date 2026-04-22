import { Button } from '@lms/ui';
import Link from 'next/link';

import { GvdLogo } from '@/components/brand/gvd-logo';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
      <GvdLogo className="h-32 w-32 text-primary" />
      <h1 className="text-5xl font-bold text-primary">
        GVD <span className="text-secondary">next-gen LMS</span>
      </h1>
      <p className="max-w-xl text-center text-lg text-muted">
        Hệ thống đào tạo thực hành kỹ thuật công nghiệp thế hệ mới — tích hợp AI và mô phỏng 3D.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/dashboard">Vào Dashboard</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">Đăng nhập</Link>
        </Button>
      </div>
    </main>
  );
}
