import { Link } from 'react-router-dom';
import { CHANNEL, LEGACY, TELEGRAM } from '@/lib/links';
import { BOT } from '@/lib/platform';
import { StatusPill } from './StatusPill';

type Item = { label: string; href: string; to?: undefined } | { label: string; to: string; href?: undefined };
const cols: { title: string; items: Item[] }[] = [
  { title: 'Bot', items: [{ label: 'Features', to: '/#bot' }, { label: 'Deploy', to: '/#deploy' }, { label: 'GitHub', href: BOT.repo }, { label: 'Releases', href: BOT.releases }] },
  { title: 'Platform', items: [{ label: 'Pair WhatsApp', to: '/pair' }, { label: 'Marketplace', href: LEGACY.marketplace }, { label: 'Playground', href: LEGACY.playground }] },
  { title: 'Developers', items: [{ label: 'Developer Centre', href: LEGACY.developers }, { label: 'Plugin guide', href: LEGACY.guide }] },
  { title: 'Community', items: [{ label: 'WhatsApp Channel', href: CHANNEL }, { label: 'Telegram', href: TELEGRAM }] },
  { title: 'Company', items: [{ label: 'About', href: LEGACY.about }, { label: 'Terms', href: LEGACY.terms }, { label: 'Privacy', href: LEGACY.privacy }] },
];

// only the landing page has a footer (same rule as the current site)
export function Footer() {
  const ext = (h: string) => (h.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {});
  return (
    <footer className="tf-footer">
      <div className="tf-wrap tf-footgrid">
        <div className="tf-footbrand">
          <p className="tf-logo" style={{ fontSize: '1.05rem' }}>TurboFex</p>
          <p>The complete WhatsApp bot platform.</p>
          <StatusPill showVersion={false} />
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3>{c.title}</h3>
            <ul>
              {c.items.map((i) => <li key={i.label}>{i.to ? <Link to={i.to}>{i.label}</Link> : <a href={i.href} {...ext(i.href!)}>{i.label}</a>}</li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="tf-copy">© TurboFex</p>
    </footer>
  );
}
