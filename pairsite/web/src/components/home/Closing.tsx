import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BOT } from '@/lib/platform';

export function Closing() {
  return (
    <section className="tf-wrap tf-section pb-4" aria-labelledby="closing-h">
      <div className="tf-stack">
        <h2 id="closing-h" className="tf-h2 tf-silver">Your bot, your groups, your way</h2>
        <div className="mt-2 flex w-full flex-col items-center gap-1 sm:w-auto sm:flex-row sm:gap-5">
          <Link to="/#deploy" className="tf-btn">Get started <ArrowRight size={17} aria-hidden="true" /></Link>
          <a className="tf-link" href={BOT.repo} target="_blank" rel="noopener noreferrer">View on GitHub <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}
