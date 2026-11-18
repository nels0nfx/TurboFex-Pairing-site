import { cn } from '@/lib/cn';

const items = ['Your number', 'Link in WhatsApp', 'Session ID'];

// shows which of the three steps you are on
export function Steps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
      {items.map((t, i) => (
        <li key={t} aria-current={step === i + 1 ? 'step' : undefined} className={cn('flex flex-1 items-center gap-2', step === i + 1 ? 'text-fg' : 'text-mute')}>
          <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono', step > i + 1 ? 'border-gold bg-gold text-bg' : step === i + 1 ? 'border-gold text-gold' : 'border-line')}>{i + 1}</span>
          <span className="hidden sm:inline">{t}</span>
        </li>
      ))}
    </ol>
  );
}
