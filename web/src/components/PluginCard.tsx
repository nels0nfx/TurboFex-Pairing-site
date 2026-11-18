import { BadgeCheck, Star } from 'lucide-react';
import type { StorePlugin } from '@/lib/api';
import { Badge } from './Badge';
import { Card } from './Card';
import { LEGACY } from '@/lib/links';

// one plugin from the real store. It opens the plugin in the current marketplace for now.
export function PluginCard({ p }: { p: StorePlugin }) {
  const href = `${LEGACY.marketplace}#${encodeURIComponent(p.id)}`;
  return (
    <a href={href} aria-label={`${p.name}, version ${p.version}`} className="block h-full">
      <Card className="h-full space-y-3 p-5 transition hover:border-gold/50">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gold/12 text-lg font-semibold text-gold">
            {p.docs?.icon ? <img src={`/api/plugin-icon?id=${encodeURIComponent(p.id)}&v=${encodeURIComponent(p.version)}`} alt="" width={48} height={48} loading="lazy" className="h-full w-full object-cover" /> : (p.name || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.name}</p>
            {p.dev?.developer && (
              <p className="flex items-center gap-1 text-xs text-mute">by {p.dev.developer}{p.dev.verified && <BadgeCheck size={13} className="text-ok" aria-label="Verified developer" />}</p>
            )}
          </div>
        </div>
        <p className="line-clamp-3 text-sm text-mute">{p.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>v{p.version}</Badge>
          {p.featured && <Badge tone="gold">Featured</Badge>}
          {p.rating && p.rating.count > 0 && <Badge tone="gold"><Star size={11} aria-hidden />{p.rating.avg.toFixed(1)} ({p.rating.count})</Badge>}
        </div>
      </Card>
    </a>
  );
}
