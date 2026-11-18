import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from './Badge';

const tint: Record<Tone, string> = {
  neutral: 'bg-raise text-body',
  accent: 'bg-accent/[0.12] text-accent',
  ok: 'bg-ok/[0.12] text-ok',
  info: 'bg-info/[0.12] text-info',
  warn: 'bg-warn/[0.12] text-warn',
  bad: 'bg-bad/[0.12] text-bad',
};

// a small tinted square with an icon; the colour tells what kind of thing it is
export function IconTile({ icon: Icon, tone = 'neutral', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', tint[tone], className)}><Icon size={18} /></span>;
}
