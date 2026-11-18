import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SectionHead } from './SectionHead';
import { BOT, HOSTS, START_STEPS } from '@/lib/platform';

export function Deploy() {
  return (
    <section id="deploy" className="tf-wrap tf-section" aria-labelledby="deploy-h">
      <SectionHead id="deploy-h" eyebrow="Deploy" title="Run it your way" lead="TurboFex is plain Node.js, so it runs on a phone, a server, Docker or a hosting panel." />
      <ul className="tf-cards tf-cards--3">
        {HOSTS.map(({ icon: I, title, text }) => (
          <li key={title} className="tf-card"><span className="tf-tile tf-tile--sm"><I size={20} aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></li>
        ))}
      </ul>
      <ol className="tf-steps" aria-label="How to start">
        {START_STEPS.map((s, i) => (
          <li key={s.title}><span className="tf-num" aria-hidden="true">{i + 1}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-6">
        <Link to="/pair" className="tf-btn">Link your WhatsApp <ArrowRight size={17} aria-hidden="true" /></Link>
        <a className="tf-link" href={BOT.hostingGuide} target="_blank" rel="noopener noreferrer">Hosting guides <ArrowRight size={15} aria-hidden="true" /></a>
        <a className="tf-link" href={BOT.releases} target="_blank" rel="noopener noreferrer">Releases <ArrowRight size={15} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
