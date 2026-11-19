import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// counts up to a real number once (no animation when motion is off)
export function Counter({ value }: { value: number }) {
  const still = useReducedMotion();
  const [n, setN] = useState(still ? value : 0);
  useEffect(() => {
    if (still) { setN(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, still]);
  return <>{n}</>;
}
