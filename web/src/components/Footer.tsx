import { Link } from 'react-router-dom';
import { CHANNEL, LEGACY, TELEGRAM } from '@/lib/links';

const cols: { title: string; items: ({ label: string; href: string; to?: undefined } | { label: string; to: string; href?: undefined })[] }[] = [
  { title: 'Product', items: [{ label: 'Pair WhatsApp', to: '/pair' }, { label: 'Marketplace', href: LEGACY.marketplace }, { label: 'Playground', href: LEGACY.playground }] },
  { title: 'Developers', items: [{ label: 'Developer Centre', href: LEGACY.developers }, { label: 'Plugin guide', href: LEGACY.guide }] },
  { title: 'Community', items: [{ label: 'WhatsApp Channel', href: CHANNEL }, { label: 'Telegram', href: TELEGRAM }] },
  { title: 'Company', items: [{ label: 'About', href: LEGACY.about }, { label: 'Terms', href: LEGACY.terms }, { label: 'Privacy', href: LEGACY.privacy }] },
];

// only the landing page has a footer (same rule as the current site)
export function Footer() {
  const ext = (h: string) => (h.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {});
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-5">
        <div className="md:col-span-1">
          <p className="font-semibold text-fg">Turbo<span className="text-gold">Fex</span></p>
          <p className="mt-2 text-sm text-mute">The WhatsApp bot ecosystem: pairing, plugins and a developer community.</p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="text-sm font-medium">{c.title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-mute">
              {c.items.map((i) => <li key={i.label}>{i.to ? <Link className="hover:text-fg" to={i.to}>{i.label}</Link> : <a className="hover:text-fg" href={i.href} {...ext(i.href!)}>{i.label}</a>}</li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-line px-4 py-5 text-center text-xs text-mute">© TurboFex. The ultimate WhatsApp bot ecosystem.</p>
    </footer>
  );
}
