import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem { id: string; label: string; content: ReactNode }

// simple tabs; the arrow keys move between them
export function Tabs({ items }: { items: TabItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
    setActive(items[n].id);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  };
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition', active === t.id ? 'border-gold text-fg' : 'border-transparent text-mute hover:text-fg')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-4">
          {active === t.id && t.content}
        </div>
      ))}
    </div>
  );
}
