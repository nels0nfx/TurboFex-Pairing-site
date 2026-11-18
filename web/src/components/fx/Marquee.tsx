// A slow, endless strip of real command names. It pauses when touched or hovered.
const COMMANDS = ['menu', 'ping', 'status', 'weather', 'reverse', 'plugin install', 'plugin list', 'again', 'autocorrect', 'update', 'server', 'repair'];

export function Marquee() {
  const row = (hidden: boolean) => COMMANDS.map((c) => (
    <li key={c + hidden} aria-hidden={hidden || undefined} className="glass mx-1.5 shrink-0 rounded-full px-4 py-2 font-mono text-sm text-body"><span className="text-gold">.</span>{c}</li>
  ));
  return (
    <section aria-label="A few commands in the bot" className="marquee fade-edges overflow-hidden py-2">
      <ul className="marquee-track">{row(false)}{row(true)}</ul>
    </section>
  );
}
