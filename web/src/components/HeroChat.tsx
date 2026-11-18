import { Bot } from 'lucide-react';

// A small picture of what the bot feels like in a chat. It is an example, and it says so.
export function HeroChat() {
  return (
    <figure aria-label="Example chat with a TurboFex bot" className="relative mx-auto w-full max-w-sm">
      <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-gold/15 via-transparent to-info/10 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-glow">
        <div className="flex items-center gap-3 border-b border-line bg-raise px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/15 text-gold"><Bot size={16} /></span>
          <div className="leading-tight"><p className="text-sm font-medium text-fg">TurboFex bot</p><p className="flex items-center gap-1.5 text-xs text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />online</p></div>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-raise px-3.5 py-2 font-mono text-fg">.plugin list</p>
          <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm border border-line bg-bg px-3.5 py-2.5 text-body">
            <p className="font-medium text-fg">Plugins</p>
            <p className="mt-1 text-mute">Pick one from the store, send <span className="font-mono text-info">.plugin install</span> and its commands appear in your menu.</p>
          </div>
          <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-raise px-3.5 py-2 font-mono text-fg">.menu</p>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-mute">Example chat</figcaption>
    </figure>
  );
}
