import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <MainLayout>{children}</MainLayout>
      </ToastProvider>
    </ThemeProvider>
  );
}
