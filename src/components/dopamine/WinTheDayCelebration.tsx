'use client';

import { useEffect } from 'react';
import { Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

interface Props {
  show: boolean;
  onComplete?: () => void;
}

export function WinTheDayCelebration({ show, onComplete }: Props) {
  useEffect(() => {
    if (show) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#f59e0b', '#fbbf24', '#fcd34d', '#f97316', '#ffffff'] });
      setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: ['#f59e0b', '#fbbf24'] });
        confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: ['#f59e0b', '#fbbf24'] });
      }, 250);
      const timer = setTimeout(() => onComplete?.(), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-orange-500/20 flex items-center justify-center">
          <Trophy className="h-10 w-10 text-amber-400" />
        </div>
        <p className="font-display text-2xl font-bold text-amber-400">You Won the Day!</p>
      </div>
    </div>
  );
}
