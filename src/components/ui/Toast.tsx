'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onClose: () => void;
  duration?: number;
}

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle; accent: string; bg: string }> = {
  success: {
    icon: CheckCircle,
    accent: 'text-emerald-400',
    bg: 'border-emerald-500/20',
  },
  error: {
    icon: AlertCircle,
    accent: 'text-rose-400',
    bg: 'border-rose-500/20',
  },
  info: {
    icon: Info,
    accent: 'text-cyan-400',
    bg: 'border-cyan-500/20',
  },
};

export function Toast({ message, variant, onClose, duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const { icon: Icon, accent, bg } = variantStyles[variant];

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={`pointer-events-auto glass-panel ${bg} flex items-center gap-3 px-4 py-3 min-w-[280px] max-w-[420px]`}
        >
          <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
          <p className="text-sm text-[var(--text-primary)] flex-1">{message}</p>
          <button
            onClick={() => setVisible(false)}
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
