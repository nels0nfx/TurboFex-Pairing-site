import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Cube } from './Cube';
import { LEGACY } from '@/lib/links';

export function Hero() {
  return (
    <section className="tf-wrap relative overflow-hidden pb-6 pt-4 lg:pt-10" aria-labelledby="hero-h">
      <div className="tf-grid-bg" aria-hidden="true" />
      <Cube />
      <div className="tf-stack relative mt-4">
        <a className="tf-pill" href={LEGACY.marketplace}>Browse the plugin marketplace <ChevronRight size={15} aria-hidden="true" /></a>
        <h1 id="hero-h" className="tf-h1 tf-silver mt-2">WhatsApp bots, built to extend</h1>
        <p className="tf-lead max-w-xl">Pair your number in a minute, add signed plugins from the marketplace, or write your own. One bot, every group.</p>
        <div className="mt-2 flex w-full flex-col items-center gap-1 sm:w-auto sm:flex-row sm:gap-5">
          <Link to="/pair" className="tf-btn">Get started <ArrowRight size={17} aria-hidden="true" /></Link>
          <a href={LEGACY.guide} className="tf-link">Documentation <ChevronRight size={16} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}
