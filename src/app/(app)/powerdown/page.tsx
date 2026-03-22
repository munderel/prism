'use client';

import { useRouter } from 'next/navigation';
import { Moon } from 'lucide-react';
import { PowerDownRitual } from '@/components/powerdown/PowerDownRitual';

export default function PowerDownPage() {
  const router = useRouter();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Moon className="h-6 w-6 text-indigo-400" />
          Power Down Ritual
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          End your day with intention. Review, plan, and power down.
        </p>
      </div>

      <PowerDownRitual onComplete={() => router.push('/')} />
    </div>
  );
}
