import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './Button';
import { LEGACY } from '@/lib/links';
import { cn } from '@/lib/cn';

// Pages already in the new site are router links; the others are the current pages (plain links).
const outside = [
  { href: LEGACY.marketplace, label: 'Marketplace' },
  { href: LEGACY.developers, label: 'Developers' },
  { href: LEGACY.guide, label: 'Docs' },
  { href: LEGACY.playground, label: 'Playground' },
  { href: LEGACY.community, label: 'Community' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const cls = 'rounded-md px-3 py-2 text-sm text-mute transition hover:text-fg';
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="TurboFex home" className="flex items-center gap-2 font-semibold tracking-tight" onClick={() => setOpen(false)}>
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-gold text-xs font-bold text-bg">T</span>
          <span>Turbo<span className="text-gold">Fex</span></span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {outside.map((l) => <a key={l.href} href={l.href} className={cls}>{l.label}</a>)}
          <NavLink to="/pair" className={({ isActive }) => cn(cls, isActive && 'text-fg')}>Pair</NavLink>
          <ThemeToggle />
          <Link to="/pair"><Button className="ml-2 h-9">Get started</Button></Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-mute">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-2 md:hidden" aria-label="Main mobile">
          {outside.map((l) => <a key={l.href} href={l.href} className={cn(cls, 'block')}>{l.label}</a>)}
          <NavLink to="/pair" onClick={() => setOpen(false)} className={({ isActive }) => cn(cls, 'block', isActive && 'text-fg')}>Pair WhatsApp</NavLink>
        </nav>
      )}
    </header>
  );
}
