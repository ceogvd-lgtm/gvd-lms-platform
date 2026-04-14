import { Button } from '@lms/ui';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-4xl font-bold text-primary">LMS Platform</h1>
      <p className="text-slate-600 dark:text-slate-300 max-w-xl text-center">
        Hệ thống LMS thế hệ mới tích hợp AI — Phase 01 scaffold sẵn sàng.
      </p>
      <Button>Bắt đầu học</Button>
    </main>
  );
}
