import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/cn';

// Stage 0 only has the preview pages; the real menu grows with each stage.
const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/design', label: 'Design' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const item = ({ isActive }: { isActive: boolean }) => cn('rounded-md px-3 py-2 text-sm transition', isActive ? 'text-fg' : 'text-mute hover:text-fg');
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gold text-xs font-bold text-bg">T</span>
          TurboFex
        </Link>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={item}>{l.label}</NavLink>)}
          <ThemeToggle />
        </nav>
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-mute">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-2 sm:hidden" aria-label="Main mobile">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)} className={(s) => cn(item(s), 'block')}>{l.label}</NavLink>)}
        </nav>
      )}
    </header>
  );
}
