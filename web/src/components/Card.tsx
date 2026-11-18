import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// panel = the normal surface; raised = a lighter surface for things that sit on top of a panel
export const Card = ({ className, raised, ...p }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) => (
  <div className={cn('rounded-2xl border border-line p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]', raised ? 'bg-raise' : 'bg-panel', className)} {...p} />
);
