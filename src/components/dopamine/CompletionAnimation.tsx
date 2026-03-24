'use client';

import { m, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface CompletionAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

export function CompletionAnimation({ show, onComplete }: CompletionAnimationProps) {
  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <m.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <m.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.5, times: [0, 0.7, 1] }}
            className="h-24 w-24 rounded-full bg-green-500/20 flex items-center justify-center"
          >
            <m.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
            >
              <Check className="h-12 w-12 text-green-400" strokeWidth={3} />
            </m.div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
