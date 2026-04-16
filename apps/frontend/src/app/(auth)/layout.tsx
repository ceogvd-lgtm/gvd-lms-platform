import { SplitLayout } from '@/components/auth/split-layout';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SplitLayout>{children}</SplitLayout>;
}
