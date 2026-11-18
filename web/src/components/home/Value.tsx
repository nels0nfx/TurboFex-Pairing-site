import { Rocket, Smile, Users } from 'lucide-react';

// What TurboFex is, in three short points, before any feature list.
const points = [
  { icon: Users, title: 'Run your groups', text: 'Welcome new members, keep order and keep spam out.' },
  { icon: Smile, title: 'Have fun, get things done', text: 'Games, tools, lookups, stickers and downloads in every chat.' },
  { icon: Rocket, title: 'Make it yours', text: 'Host it where you like and add plugins, or write your own.' },
];

export function Value() {
  return (
    <section className="tf-wrap mt-12" aria-label="What TurboFex is">
      <ul className="tf-cards tf-cards--3">
        {points.map(({ icon: I, title, text }) => (
          <li key={title} className="tf-card"><span className="tf-tile tf-tile--sm"><I size={20} aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></li>
        ))}
      </ul>
    </section>
  );
}
