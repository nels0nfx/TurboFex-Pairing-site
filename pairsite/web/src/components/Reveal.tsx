import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// fades a block in once when it scrolls into view
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const still = useReducedMotion();
  // no fade-in when motion is off, or in a browser too old to tell when a block scrolls into view
  if (still || typeof IntersectionObserver === 'undefined') return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.45, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}
