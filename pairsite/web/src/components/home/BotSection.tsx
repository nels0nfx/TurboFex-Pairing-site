import { ArrowRight } from 'lucide-react';
import { SectionHead } from './SectionHead';
import { BOT, BOT_AREAS } from '@/lib/platform';

export function BotSection() {
  return (
    <section id="bot" className="tf-wrap tf-section" aria-labelledby="bot-h">
      <SectionHead id="bot-h" eyebrow="The bot" title="A bot with a lot inside" lead="Send .menu in WhatsApp to see everything. It is built from the commands your version really has." />
      <p className="tf-facts" aria-label="The bot in numbers"><b>{BOT.commands}</b> commands <i aria-hidden="true">·</i> <b>{BOT.categories}</b> categories</p>
      <ul className="tf-cards tf-cards--3">
        {BOT_AREAS.map(({ icon: I, title, text }) => (
          <li key={title} className="tf-card"><span className="tf-tile tf-tile--sm"><I size={20} aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></li>
        ))}
      </ul>
      <p className="mt-6 text-center"><a className="tf-link" href={BOT.repo} target="_blank" rel="noopener noreferrer">View the source on GitHub <ArrowRight size={15} aria-hidden="true" /></a></p>
    </section>
  );
}
