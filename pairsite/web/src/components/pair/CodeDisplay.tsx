import { cn } from '@/lib/cn';

// the 8-character pairing code in two groups of four; dots while it is being made
export function CodeDisplay({ code }: { code: string }) {
  const clean = code.replace(/[^A-Za-z0-9]/g, '');
  const chars = clean ? clean.split('') : Array(8).fill('•');
  return (
    <div role="img" aria-label={clean ? `Pairing code ${clean.split('').join(' ')}` : 'Pairing code is being generated'} className={cn('flex items-center justify-center gap-1.5 font-mono text-3xl font-semibold sm:gap-2 sm:text-4xl', !clean && 'animate-pulse text-mute')}>
      {chars.slice(0, 8).map((c, i) => (
        <span key={i} className="contents">
          {i === 4 && <span aria-hidden className="px-1 text-mute">–</span>}
          <span className="grid h-12 w-8 place-items-center rounded-md border border-line bg-bg sm:h-14 sm:w-10">{c}</span>
        </span>
      ))}
    </div>
  );
}
