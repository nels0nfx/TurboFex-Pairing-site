import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Cube } from './Cube';
import { BOT } from '@/lib/platform';

export function Hero() {
  return (
    <section className="tf-wrap relative overflow-hidden pb-6 pt-4 lg:pt-10" aria-labelledby="hero-h">
      <div className="tf-grid-bg" aria-hidden="true" />
      <Cube />
      <div className="tf-stack relative mt-4">
        <a className="tf-pill" href={BOT.repo} target="_blank" rel="noopener noreferrer">v{BOT.version} · Open source <ChevronRight size={15} aria-hidden="true" /></a>
        <h1 id="hero-h" className="tf-h1 tf-silver mt-2">The complete WhatsApp bot platform</h1>
        <p className="tf-lead max-w-xl">A bot that runs your groups and gives your chats tools, games and fun. Host it anywhere, and extend it with plugins.</p>
        <div className="mt-2 flex w-full flex-col items-center gap-1 sm:w-auto sm:flex-row sm:gap-5">
          <Link to="/#deploy" className="tf-btn">Get started <ArrowRight size={17} aria-hidden="true" /></Link>
          <Link to="/#bot" className="tf-link">See what it does <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className="tf-builton" aria-label="Built on">Built on <span>WhatsApp</span> · <span>Node.js</span> · <span>GitHub</span></p>
      </div>
    </section>
  );
}
