import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// panel = the normal surface; raised = a lighter surface for things that sit on top of a panel
export const Card = ({ className, raised, ...p }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) => (
  <div className={cn('rounded-xl border border-line p-5', raised ? 'bg-raise' : 'bg-panel', className)} {...p} />
);
