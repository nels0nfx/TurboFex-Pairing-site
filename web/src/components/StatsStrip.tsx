import { CheckCircle2, Code2, Package, PauseCircle, Star } from 'lucide-react';
import { useSiteStatus, useStore } from '@/lib/queries';
import { IconTile } from './IconTile';
import { Counter } from './fx/Counter';
import { Glass } from './fx/Glass';
import type { Tone } from './Badge';
import type { LucideIcon } from 'lucide-react';

interface Tile { icon: LucideIcon; tone: Tone; value: string | number; label: string }

// Only real numbers from the server. A number that does not exist is not shown.
export function StatsStrip({ pairing = true }: { pairing?: boolean }) {
  const status = useSiteStatus();
  const store = useStore();
  if (!status.data && !store.data) return null;
  const tiles: Tile[] = [];
  const paused = !!status.data?.maintenance?.on;
  if (pairing && status.data) tiles.push(paused ? { icon: PauseCircle, tone: 'warn', value: 'Paused', label: 'WhatsApp pairing' } : { icon: CheckCircle2, tone: 'ok', value: 'Online', label: 'WhatsApp pairing' });
  const list = store.data?.paused || !Array.isArray(store.data?.plugins) ? [] : store.data!.plugins;
  if (list.length) {
    tiles.push({ icon: Package, tone: 'accent', value: list.length, label: list.length === 1 ? 'Published plugin' : 'Published plugins' });
    const devs = new Set(list.map((p) => p.dev?.developer).filter(Boolean));
    if (devs.size) tiles.push({ icon: Code2, tone: 'info', value: devs.size, label: devs.size === 1 ? 'Developer' : 'Developers' });
    const installs = list.reduce((n, p) => n + (p.installs || 0), 0);
    if (installs > 0) tiles.push({ icon: Package, tone: 'ok', value: installs, label: 'Reported installs' });
    else {
      const rated = list.filter((p) => p.rating && p.rating.count);
      const count = rated.reduce((n, p) => n + p.rating!.count, 0);
      if (count) tiles.push({ icon: Star, tone: 'accent', value: `${(rated.reduce((n, p) => n + p.rating!.avg * p.rating!.count, 0) / count).toFixed(1)} ★`, label: `Average rating (${count})` });
    }
  }
  if (!tiles.length) return null;
  return (
    <ul aria-label="TurboFex in numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.label}><Glass className="flex items-center gap-3 rounded-xl p-4">
          <IconTile icon={t.icon} tone={t.tone} />
          <div><p className="text-lg font-semibold leading-tight text-fg">{typeof t.value === 'number' ? <Counter value={t.value} /> : t.value}</p><p className="text-xs text-mute">{t.label}</p></div>
        </Glass></li>
      ))}
    </ul>
  );
}
