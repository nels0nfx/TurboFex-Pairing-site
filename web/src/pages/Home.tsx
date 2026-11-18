import { useEffect } from 'react';
import { Glass } from '@/components/fx/Glass';
import { Footer } from '@/components/Footer';
import { PluginCard } from '@/components/PluginCard';
import { Reveal } from '@/components/Reveal';
import { StatsStrip } from '@/components/StatsStrip';
import { StatusPill } from '@/components/StatusPill';
import { Hero } from '@/components/home/Hero';
import { WorksWith } from '@/components/home/WorksWith';
import { LinkInMinute } from '@/components/home/LinkInMinute';
import { CodePanel } from '@/components/home/CodePanel';
import { TestMode } from '@/components/home/TestMode';
import { useStore } from '@/lib/queries';
import { LEGACY } from '@/lib/links';

const Eyebrow = ({ children }: { children: string }) => <p className="tf-eyebrow">{children}</p>;

function Featured() {
  const { data, isPending, isError } = useStore();
  const all = data && Array.isArray(data.plugins) ? data.plugins : [];
  const list = data && !data.paused ? [...all].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3) : [];
  const anyFeatured = list.some((p) => p.featured);
  let body;
  if (isPending) body = <div className="grid gap-3 md:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-44 animate-pulse rounded-2xl" />)}</div>;
  else if (isError) body = <Glass className="p-5">The plugin list cannot be loaded right now.</Glass>;
  else if (data?.paused) body = <Glass className="p-5">The store is paused for a moment. Please check back soon.</Glass>;
  else if (!list.length) body = <Glass className="p-5">No plugins are published yet. Approved plugins appear here.</Glass>;
  else body = <><div className="grid gap-3 md:grid-cols-3">{list.map((p) => <PluginCard key={p.id} p={p} />)}</div>{!anyFeatured && <p className="mt-3 text-sm text-mute">Showing the latest published plugins.</p>}</>;
  return (
    <section aria-labelledby="featured-h" className="tf-wrap tf-section">
      <div className="tf-stack mb-8">
        <Eyebrow>Marketplace</Eyebrow><h2 id="featured-h" className="tf-h2 tf-silver">Featured plugins</h2>
        <a href={LEGACY.marketplace} className="tf-link">View all plugins</a>
      </div>
      {body}
    </section>
  );
}

export default function Home() {
  useEffect(() => { document.title = 'TurboFex | WhatsApp bots, built to extend'; }, []);
  return (
    <>
      <main id="main" className="relative">
        <Hero />
        <WorksWith />
        <Reveal><LinkInMinute /></Reveal>
        <Reveal><CodePanel /></Reveal>
        <Reveal><TestMode /></Reveal>
        {/* The rest of the landing page is rebuilt in the next phase. Until then these two blocks show real data. */}
        <section aria-label="Status" className="tf-wrap tf-section">
          <div className="mb-4 flex justify-center"><StatusPill /></div>
          <StatsStrip />
        </section>
        <Featured />
      </main>
      <Footer />
    </>
  );
}
