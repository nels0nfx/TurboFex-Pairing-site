import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useSpring } from 'framer-motion';

// Tilts its content in 3D toward the mouse. Phones (no mouse) and people who turned motion off get a still picture.
export function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 110, damping: 14 });
  const ry = useSpring(0, { stiffness: 110, damping: 14 });
  const canTilt = () => !still && typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  return (
    <div style={{ perspective: 1100 }} className={className}
      onPointerMove={(e) => {
        if (!canTilt() || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * max * 2);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}>
      <motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}>{children}</motion.div>
    </div>
  );
}
