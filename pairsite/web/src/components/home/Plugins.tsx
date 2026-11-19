import { SectionHead } from './SectionHead';
import { FeaturedPlugins } from './FeaturedPlugins';
import { CodePanel } from './CodePanel';
import { TestMode } from './TestMode';
import { StatsStrip } from '@/components/StatsStrip';
import { LEGACY } from '@/lib/links';

// One plugin section: the store, then how to build one. Pairing and the bot keep their own sections.
export function Plugins() {
  return (
    <section id="plugins" className="tf-wrap tf-section" aria-labelledby="plugins-h">
      <SectionHead id="plugins-h" eyebrow="Plugins" title="Add more, or build your own" lead="Install signed, reviewed plugins from the marketplace, or write one yourself." />
      <div className="mt-8"><StatsStrip pairing={false} /></div>
      <div className="mt-4"><FeaturedPlugins /></div>
      <p className="tf-linkrow">
        <a className="tf-link" href={LEGACY.marketplace}>Marketplace</a>
        <a className="tf-link" href={LEGACY.developers}>Developer Centre</a>
        <a className="tf-link" href={LEGACY.guide}>Documentation</a>
        <a className="tf-link" href={LEGACY.playground}>Playground</a>
      </p>
      <CodePanel />
      <TestMode />
    </section>
  );
}
