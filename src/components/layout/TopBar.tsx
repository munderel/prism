'use client';

import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';

export function TopBar() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm px-6">
      <div className="lg:hidden">
        <h1 className="text-lg font-bold text-white">
          <span className="text-indigo-400">Goal</span> Dashboard
        </h1>
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
