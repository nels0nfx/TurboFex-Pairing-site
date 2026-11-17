import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const tones = { neutral: 'text-mute border-line', gold: 'text-gold border-gold/40', ok: 'text-ok border-ok/40', bad: 'text-bad border-bad/40' };

export const Badge = ({ tone = 'neutral', className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs', tones[tone], className)} {...p} />
);
