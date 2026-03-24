'use client';

import { useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { SWRProvider } from '@/app/(app)/swr-provider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SessionProvider>
      <SWRProvider>
        <LazyMotion features={domAnimation} strict>
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="lg:ml-64">
            <TopBar onMenuToggle={() => setSidebarOpen(true)} />
            <main className="p-6">{children}</main>
          </div>
        </LazyMotion>
      </SWRProvider>
    </SessionProvider>
  );
}
