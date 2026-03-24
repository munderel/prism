'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';

interface TopBarProps {
  onMenuToggle?: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#050510]/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3 lg:hidden">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.05] hover:text-white transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/">
          <h1 className="text-lg font-bold font-display prism-text">
            Prism
          </h1>
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {session?.user && (
          <>
            <span className="text-sm text-gray-400">{session.user.name}</span>
            {session.user.image && (
              <Image
                src={session.user.image}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
            )}
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
