import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { countries, flagOf } from '@/lib/phone';
import { cn } from '@/lib/cn';

// a searchable list of countries that slides up like a sheet
export function CountrySheet({ open, selected, onPick, onClose }: { open: boolean; selected: string; onPick: (iso: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const all = useMemo(() => countries(), []);
  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = setTimeout(() => search.current?.focus(), 30);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  if (!open) return null;
  const t = q.trim().toLowerCase().replace(/^\+/, '');
  const list = all.filter((c) => !t || c.name.toLowerCase().includes(t) || c.dial.startsWith(t) || c.iso.toLowerCase() === t);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Choose your country" className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-line bg-panel sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium">Choose your country</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-mute hover:text-fg"><X size={16} /></button>
        </div>
        <div className="p-3">
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code" aria-label="Search country or code" className="h-11 w-full rounded-lg border border-line bg-bg px-3 text-base focus:border-accent focus:outline-none" />
        </div>
        <ul role="listbox" aria-label="Countries" className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {list.map((c) => (
            <li key={c.iso} role="option" aria-selected={c.iso === selected} tabIndex={0}
              onClick={() => onPick(c.iso)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c.iso); } }}
              className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-bg', c.iso === selected && 'bg-bg text-accent')}>
              <span className="text-xl">{flagOf(c.iso)}</span>
              <span className="flex-1">{c.name}</span>
              <span className="font-mono text-sm text-mute">+{c.dial}</span>
            </li>
          ))}
          {!list.length && <li className="px-4 py-6 text-center text-mute">No country found</li>}
        </ul>
      </div>
    </div>
  );
}
