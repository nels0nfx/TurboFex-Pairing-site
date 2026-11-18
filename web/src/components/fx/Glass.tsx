import { useRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// A frosted-glass panel. On hover (or touch) a soft light follows the pointer.
export function Glass({ className, onPointerMove, ...p }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={cn('glass spot rounded-2xl', className)}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) { ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`); ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`); }
        onPointerMove?.(e);
      }}
      {...p}
    />
  );
}
