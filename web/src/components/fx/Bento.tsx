import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FileText, FolderLock, MessageSquareText, SlidersHorizontal, Users, Zap } from 'lucide-react';
import { Glass } from './Glass';
import { IconTile } from '../IconTile';
import { cn } from '@/lib/cn';

// "What a plugin can do": glass tiles, each with a small moving picture. Words are the real capabilities.
function Tile({ icon: Icon, title, text, className, children }: { icon: typeof Zap; title: string; text: string; className?: string; children?: ReactNode }) {
  return (
    <Glass className={cn('flex flex-col gap-4 p-5 transition-transform duration-300 hover:-translate-y-1', className)}>
      <div className="flex items-start gap-3"><IconTile icon={Icon} tone="info" /><div><h3 className="font-medium text-fg">{title}</h3><p className="mt-1 text-sm text-mute">{text}</p></div></div>
      {children && <div aria-hidden className="mt-auto">{children}</div>}
    </Glass>
  );
}

const Pulse = ({ label, delay }: { label: string; delay: string }) => (
  <span className="relative inline-flex items-center gap-2 rounded-full border border-line/70 bg-bg/50 px-3 py-1 font-mono text-xs text-body">
    <span className="relative grid h-2 w-2 place-items-center"><span className="ring absolute h-2 w-2 rounded-full bg-info" style={{ animationDelay: delay }} /><span className="h-2 w-2 rounded-full bg-info" /></span>{label}
  </span>
);

function Toggle({ on, delay }: { on: boolean; delay: number }) {
  const still = useReducedMotion();
  return (
    <span className={cn('relative inline-block h-5 w-9 rounded-full border border-line/70', on ? 'bg-info/30' : 'bg-raise')}>
      <motion.span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full', on ? 'bg-info' : 'bg-mute')} initial={false}
        animate={still ? { x: on ? 18 : 2 } : { x: on ? [2, 18, 18, 2, 2] : [18, 2, 2, 18, 18] }}
        transition={still ? undefined : { duration: 6, repeat: Infinity, delay, times: [0, 0.1, 0.5, 0.6, 1] }} />
    </span>
  );
}

export function Bento() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile icon={MessageSquareText} title="Commands" text="New commands that use your normal prefix, with their own help text." className="md:col-span-2">
        <div className="rounded-xl border border-line/60 bg-bg/60 p-3 font-mono text-xs leading-6 text-mute">
          <p><span className="text-gold">.</span>plugin install <span className="text-info">name</span></p>
          <p className="text-ok">✓ installed, commands added to your menu</p>
          <p><span className="text-gold">.</span>name<span className="caret text-gold"> |</span></p>
        </div>
      </Tile>
      <Tile icon={Zap} title="Events" text="React to new messages, members joining and members leaving.">
        <div className="flex flex-wrap gap-2"><Pulse label="message" delay="0s" /><Pulse label="member.join" delay=".6s" /><Pulse label="member.leave" delay="1.2s" /></div>
      </Tile>
      <Tile icon={FileText} title="Pictures and files" text="Send and convert media, within safe size limits.">
        <div className="relative h-16">
          {[0, 1, 2].map((i) => <span key={i} className="absolute top-2 h-12 w-16 rounded-lg border border-line/70 bg-raise/80" style={{ left: `${i * 26}px`, transform: `rotate(${(i - 1) * 8}deg)` }} />)}
        </div>
      </Tile>
      <Tile icon={Users} title="Group tools" text="Group management, only for plugins you allow and bots that are admins.">
        <div className="flex -space-x-2">{['bg-gold/70', 'bg-info/70', 'bg-ok/70', 'bg-warn/70', 'bg-mute/70'].map((c, i) => <span key={i} className={cn('h-8 w-8 rounded-full border-2 border-bg', c)} />)}</div>
      </Tile>
      <Tile icon={SlidersHorizontal} title="Options" text="Owners change a plugin's settings with one command.">
        <div className="space-y-2"><div className="flex items-center justify-between font-mono text-xs text-mute">welcome message <Toggle on delay={0} /></div><div className="flex items-center justify-between font-mono text-xs text-mute">strict mode <Toggle on={false} delay={1.5} /></div></div>
      </Tile>
      <Tile icon={FolderLock} title="Private storage" text="Each plugin keeps its own notes, apart from every other plugin." className="md:col-span-3" />
    </div>
  );
}
