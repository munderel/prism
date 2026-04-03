import type { Variants, Transition } from 'framer-motion';

// Spring physics: stiffness 100, damping 20 — premium, weighty feel
export const springTransition: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
};

// Container that orchestrates staggered children
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

// Individual items in a staggered list
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: springTransition,
  },
};

// For expandable sections (process detail, forms)
export const expandVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },
};

// Card hover micro-interaction
export const cardHoverProps = {
  whileHover: { scale: 1.008, y: -1 },
  transition: { type: 'spring', stiffness: 400, damping: 25 } as Transition,
};
