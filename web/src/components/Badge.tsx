import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// One colour, one meaning, everywhere on the site
export const TONES = {
  neutral: 'text-mute border-line bg-raise/60',
  gold: 'text-gold border-gold/40 bg-gold/10',   // TurboFex, featured
  ok: 'text-ok border-ok/40 bg-ok/10',            // safe, working, verified
  info: 'text-info border-info/40 bg-info/10',    // learn and build
  warn: 'text-warn border-warn/40 bg-warn/10',    // be careful
  bad: 'text-bad border-bad/40 bg-bad/10',        // a problem
} as const;
export type Tone = keyof typeof TONES;

export const Badge = ({ tone = 'neutral', className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs', TONES[tone], className)} {...p} />
);
