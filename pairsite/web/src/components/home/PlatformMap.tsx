import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SectionHead } from './SectionHead';
import { PLATFORM, type PlatformItem } from '@/lib/platform';

function Card({ p }: { p: PlatformItem }) {
  const I = p.icon;
  const body = (
    <>
      <span className="tf-tile tf-tile--sm"><I size={20} aria-hidden="true" /></span>
      <div><h3>{p.title}</h3><p>{p.text}</p></div>
      {p.status === 'available' && <ArrowUpRight className="tf-go" size={16} aria-hidden="true" />}
    </>
  );
  if (p.status === 'planned') return <li className="tf-card tf-card--planned">{body}</li>;
  return <li>{p.to ? <Link to={p.to} className="tf-card">{body}</Link> : <a href={p.href} className="tf-card" {...(p.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{body}</a>}</li>;
}

export function PlatformMap() {
  const now = PLATFORM.filter((p) => p.status === 'available');
  const later = PLATFORM.filter((p) => p.status === 'planned');
  return (
    <section id="platform" className="tf-wrap tf-section" aria-labelledby="platform-h">
      <SectionHead id="platform-h" eyebrow="The platform" title="Everything in one place" lead="The bot is the core. These are the parts around it." />
      <h3 className="tf-group"><span className="tf-dot tf-dot--ok" aria-hidden="true" />Available now</h3>
      <ul className="tf-cards tf-cards--3" aria-label="Available now">{now.map((p) => <Card key={p.id} p={p} />)}</ul>
      {later.length > 0 && (
        <>
          <h3 className="tf-group"><span className="tf-dot" aria-hidden="true" />Coming later</h3>
          <ul className="tf-cards tf-cards--3" aria-label="Coming later">{later.map((p) => <Card key={p.id} p={p} />)}</ul>
        </>
      )}
    </section>
  );
}
