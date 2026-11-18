import { motion, useReducedMotion } from 'framer-motion';

// The glowing background behind the top of the landing page: a fading grid and two slow light blobs
export function Backdrop() {
  const still = useReducedMotion();
  const drift = (x: number[], y: number[], d: number) => (still ? undefined : { animate: { x, y }, transition: { duration: d, repeat: Infinity, repeatType: 'mirror' as const, ease: 'easeInOut' as const } });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <motion.div className="absolute -left-24 top-10 h-[420px] w-[420px] rounded-full bg-gold/25 blur-[110px]" {...drift([0, 60, 0], [0, 40, 0], 14)} />
      <motion.div className="absolute -right-20 top-48 h-[380px] w-[380px] rounded-full bg-fg/10 blur-[110px]" {...drift([0, -50, 0], [0, 60, 0], 17)} />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
