import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { LEGACY } from '@/lib/links';

// Sections of the landing page are router links (/#bot); pages not moved yet are plain links to the current pages.
const sections = [
  { to: '/#bot', label: 'Bot' },
  { to: '/#deploy', label: 'Deploy' },
  { to: '/#platform', label: 'Platform' },
];
const outside = [
  { href: LEGACY.marketplace, label: 'Marketplace' },
  { href: LEGACY.guide, label: 'Docs' },
  { href: LEGACY.developers, label: 'Developers' },
];

function Mark() {
  return (
    <svg className="tf-logomark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#111114" stroke="rgba(255,255,255,.18)" />
      <path d="M7 7l5 5-5 5M12.5 7l5 5-5 5" stroke="rgb(var(--tf-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const cls = 'rounded-md px-3 py-2 text-sm text-mute transition hover:text-fg';
  return (
    <>
      <header className="tf-nav" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="tf-navin">
          <Link to="/" aria-label="TurboFex home" className="tf-logo"><Mark /><span>TurboFex</span></Link>
          <nav className="tf-deskLinks" aria-label="Main">
            {sections.map((l) => <Link key={l.to} to={l.to} className={cls}>{l.label}</Link>)}
            {outside.map((l) => <a key={l.href} href={l.href} className={cls}>{l.label}</a>)}
            <NavLink to="/pair" className={({ isActive }) => `${cls} ${isActive ? 'text-fg' : ''}`}>Pair</NavLink>
            <Link to="/#deploy" className="tf-btn" style={{ height: '2.4rem', width: 'auto', padding: '0 1rem', marginLeft: '.6rem', fontSize: '.88rem', borderRadius: '.7rem' }}>Get started</Link>
          </nav>
          <button type="button" className="tf-burger" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="tf-menu"><Menu size={18} /></button>
        </div>
      </header>
      {open && (
        <div className="tf-menu" id="tf-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="tf-navin" style={{ padding: 0, flex: 'none' }}>
            <Link to="/" aria-label="TurboFex home" className="tf-logo" onClick={() => setOpen(false)}><Mark /><span>TurboFex</span></Link>
            <button type="button" className="tf-burger" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
          </div>
          <nav aria-label="Main mobile" style={{ marginTop: '1rem' }}>
            {sections.map((l) => <Link key={l.to} to={l.to} className="big" onClick={() => setOpen(false)}>{l.label}</Link>)}
            <Link to="/pair" className="big" onClick={() => setOpen(false)}>Pair WhatsApp</Link>
            {outside.map((l) => <a key={l.href} href={l.href} className="big">{l.label}</a>)}
          </nav>
          <Link to="/#deploy" className="tf-btn" style={{ marginTop: 'auto' }} onClick={() => setOpen(false)}>Get started</Link>
        </div>
      )}
    </>
  );
}
