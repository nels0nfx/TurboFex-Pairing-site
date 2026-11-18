import { motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Bot, ShieldCheck, Timer } from 'lucide-react';
import { Glass } from './Glass';
import { Tilt } from './Tilt';
import { Badge } from '../Badge';

// A floating stack of glass cards that tilts in 3D. Everything in it is an example picture and is labelled as one.
export function HeroScene() {
  const still = useReducedMotion();
  const float = (d: number, dy = 9) => (still ? {} : { animate: { y: [0, -dy, 0] }, transition: { duration: d, repeat: Infinity, ease: 'easeInOut' as const } });
  return (
    <figure aria-label="Example of a TurboFex bot, a plugin and a session ID" className="relative mx-auto w-full max-w-md">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-gold/20 via-transparent to-fg/10 blur-3xl" />
      <Tilt>
        <div className="relative h-[430px] sm:h-[480px]" style={{ transformStyle: 'preserve-3d' }}>
          <motion.div className="absolute left-0 top-6 w-[78%]" style={{ z: 20 }} {...float(7)}>
            <Glass className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/15 text-gold"><Bot size={16} /></span>
                <div className="leading-tight"><p className="text-sm font-medium text-fg">TurboFex bot</p><p className="flex items-center gap-1.5 text-xs text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />online</p></div>
              </div>
              <div className="space-y-2.5 p-4 text-sm">
                <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-gold/15 px-3.5 py-2 font-mono text-fg">.plugin list</p>
                <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-raise/70 px-3.5 py-2.5 text-mute">Pick a plugin from the store and send <span className="font-mono text-info">.plugin install</span></p>
                <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-gold/15 px-3.5 py-2 font-mono text-fg">.menu<span className="caret ml-0.5 text-gold">|</span></p>
              </div>
            </Glass>
          </motion.div>

          <motion.div className="absolute right-0 top-0 w-[56%]" style={{ z: 90 }} {...float(6, 12)}>
            <Glass className="p-4">
              <p className="text-xs text-mute">Your plugin</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-fg"><ShieldCheck size={15} className="text-ok" />Signed and reviewed</p>
              <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="ok">sandboxed</Badge><Badge tone="info">v1.0.0</Badge></div>
            </Glass>
          </motion.div>

          <motion.div className="absolute bottom-2 right-2 w-[82%]" style={{ z: 150 }} {...float(8, 10)}>
            <Glass className="border-gold/30 p-4 shadow-glow">
              <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-xs text-mute"><BadgeCheck size={14} className="text-ok" />Linked successfully</p><span className="flex items-center gap-1 font-mono text-xs text-mute"><Timer size={12} />5:00</span></div>
              <p className="mt-2 text-xs text-mute">Your session ID</p>
              <p className="mt-1 break-all rounded-lg border border-gold/30 bg-bg/60 px-3 py-2.5 text-center font-mono text-base text-fg">TFX-XXXX-XXXX-XXXX</p>
            </Glass>
          </motion.div>
        </div>
      </Tilt>
      <figcaption className="mt-1 text-center text-xs text-mute">Example</figcaption>
    </figure>
  );
}
