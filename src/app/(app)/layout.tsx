import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <MainLayout>{children}</MainLayout>
      </ToastProvider>
    </ThemeProvider>
  );
}
