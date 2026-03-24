'use client';

import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface PrismStatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  glowColor: string;
}

function useCountUp(target: number, duration = 600): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return current;
}

export function PrismStatCard({ label, value, icon: Icon, color, glowColor }: PrismStatCardProps) {
  const displayValue = useCountUp(value);

  return (
    <m.div
      className="glass-panel p-4 group"
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-md opacity-40"
            style={{ backgroundColor: glowColor }}
          />
          <Icon className={`h-4.5 w-4.5 relative ${color}`} />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <span className="font-display text-3xl font-bold text-white">{displayValue}</span>
    </m.div>
  );
}
