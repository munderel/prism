'use client';

import { useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { SWRProvider } from '@/app/(app)/swr-provider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SessionProvider>
      <SWRProvider>
        <LazyMotion features={domAnimation} strict>
          {/* Noise texture overlay */}
          <div className="noise-overlay" />

          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="lg:ml-64 relative z-10">
            <TopBar onMenuToggle={() => setSidebarOpen(true)} />
            <main className="p-6">
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {children}
              </m.div>
            </main>
          </div>
        </LazyMotion>
      </SWRProvider>
    </SessionProvider>
  );
}
